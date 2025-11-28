import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Mic, MicOff, PhoneOff, Loader2, Activity } from 'lucide-react';
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { GradeLevel, Subject } from '../types';

interface LiveVoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  grade: GradeLevel;
  subject: Subject;
}

const LiveVoiceModal: React.FC<LiveVoiceModalProps> = ({ isOpen, onClose, grade, subject }) => {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const mountedRef = useRef(true);

  const encodeAudio = (inputData: Float32Array) => {
    const l = inputData.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      const s = Math.max(-1, Math.min(1, inputData[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    
    let binary = '';
    const bytes = new Uint8Array(int16.buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const decodeAudioData = (base64String: string) => {
    const binary = atob(base64String);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }
    return float32;
  };

  const connect = useCallback(async () => {
    try {
      setStatus('connecting');
      const apiKey = process.env.API_KEY;
      if (!apiKey) throw new Error("No API Key found");

      const ai = new GoogleGenAI({ apiKey });

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass({ sampleRate: 24000 });
      audioContextRef.current = ctx;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
        }
      });
      mediaStreamRef.current = stream;

      const systemInstruction = `
        أنت مدرس خصوصي ودود وذكي باللهجة المصرية. اسمك "المعلم الذكي".
        تتحدث مع طالب في ${grade} يدرس مادة ${subject}.
        مهمتك: مساعدة الطالب في المذاكرة، الإجابة عن أسئلته، وتشجيعه.
        التعليمات:
        1. تكلم بأسلوب "دردشة" وليس خطبة. جمل قصيرة وواضحة.
        2. استخدم نبرة مشجعة ومتحمسة.
        3. لا تقرأ علامات التنسيق مثل النجوم أو الشبابيك.
        4. إذا سألك الطالب عن شيء خارج المنهج، رده بذكاء للمنهج.
        5. ابدأ المحادثة بالترحيب وسؤاله "جاهز نذاكر سوا يا بطل؟"
      `;

      const session = await ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' }
            }
          },
          systemInstruction,
        },
        callbacks: {
          onopen: () => {
            if (!mountedRef.current) return;
            setStatus('connected');

            const inputCtx = new AudioContextClass({ sampleRate: 16000 });
            const source = inputCtx.createMediaStreamSource(stream);
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            processor.onaudioprocess = (e) => {
              if (isMuted) return;

              const inputData = e.inputBuffer.getChannelData(0);
              let sum = 0;
              for (let i = 0; i < inputData.length; i++) {
                sum += inputData[i] * inputData[i];
              }
              const rms = Math.sqrt(sum / inputData.length);
              setVolumeLevel(Math.min(rms * 5, 1));

              const base64Data = encodeAudio(inputData);
              session.sendRealtimeInput({
                media: {
                  mimeType: 'audio/pcm;rate=16000',
                  data: base64Data,
                }
              });
            };

            source.connect(processor);
            processor.connect(inputCtx.destination);

            sourceRef.current = source;
            processorRef.current = processor;
          },
          onmessage: (msg: LiveServerMessage) => {
            if (!mountedRef.current) return;

            const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            const ctx = audioContextRef.current;
            if (audioData && ctx) {
              const float32Data = decodeAudioData(audioData);
              const buffer = ctx.createBuffer(1, float32Data.length, 24000);
              buffer.getChannelData(0).set(float32Data);

              const bufSource = ctx.createBufferSource();
              bufSource.buffer = buffer;
              bufSource.connect(ctx.destination);

              const currentTime = ctx.currentTime;
              const start = Math.max(currentTime, nextStartTimeRef.current);
              bufSource.start(start);
              nextStartTimeRef.current = start + buffer.duration;

              setVolumeLevel(Math.random() * 0.5 + 0.3);
            }

            setTimeout(() => setVolumeLevel(0), 200);
          },
          onclose: () => {
            if (mountedRef.current) onClose();
          },
          onerror: (err) => {
            if (mountedRef.current) setStatus('error');
          },
        },
      });

      sessionRef.current = session;
    } catch (error) {
      setStatus('error');
    }
  }, [grade, subject, isMuted, onClose]);

  useEffect(() => {
    mountedRef.current = true;
    if (isOpen) connect();

    return () => {
      mountedRef.current = false;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (processorRef.current) processorRef.current.disconnect();
      if (sourceRef.current) sourceRef.current.disconnect();
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, [isOpen, connect]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/95 z-60 flex flex-col items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-300">
      {/* UI */}
    </div>
  );
};

export default LiveVoiceModal;
