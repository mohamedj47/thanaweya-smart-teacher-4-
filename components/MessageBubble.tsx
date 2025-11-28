import React, { useState, useEffect, useRef } from 'react';
import { Message, Sender, Subject } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, User, Copy, Search, Check, HelpCircle, Volume2, StopCircle, Loader2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, AreaChart, Area, Label } from 'recharts';
import { streamSpeech } from '../services/geminiService';

interface MessageBubbleProps {
  message: Message;
  subject?: Subject;
  onTermClick?: (term: string) => void;
  onQuote?: (text: string) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, subject, onTermClick, onQuote }) => {
  const isUser = message.sender === Sender.USER;
  const [isCopied, setIsCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const nextStartTimeRef = useRef<number>(0);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      stopAudio();
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Helper to extract plain text
  const extractText = (children: any): string => {
    if (!children) return '';
    if (typeof children === 'string') return children;
    if (Array.isArray(children)) return children.map(extractText).join('');
    if (children?.props?.children) return extractText(children.props.children);
    return '';
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(message.text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const stopAudio = () => {
      sourcesRef.current.forEach(source => {
          try { source.stop(); } catch (e) {}
      });
      sourcesRef.current = [];
      setIsSpeaking(false);
      nextStartTimeRef.current = 0;
  };

  const handleSpeak = async () => {
    if (isSpeaking) {
        stopAudio();
        return;
    }

    if (isLoadingAudio) return;

    // Stop any browser speech just in case
    window.speechSynthesis.cancel();

    setIsLoadingAudio(true);
    setIsSpeaking(true);

    try {
        // Clean text: Remove markdown, URLs, charts, etc.
        const cleanText = message.text
            .replace(/```[\s\S]*?```/g, '') // Remove code/chart blocks
            .replace(/[*#`_\-]/g, ' ')
            .replace(/https?:\/\/\S+/g, 'رابط')
            .trim()
            .substring(0, 1500); // Increased limit for streaming

        if (!cleanText) {
             setIsLoadingAudio(false);
             setIsSpeaking(false);
             return;
        }

        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!audioContextRef.current) {
             audioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
        }
        
        if (audioContextRef.current.state === 'suspended') {
             await audioContextRef.current.resume();
        }
        
        // Reset timing
        nextStartTimeRef.current = audioContextRef.current.currentTime;

        let isFirstChunk = true;
        let activeSource: AudioBufferSourceNode | null = null;

        await streamSpeech(cleanText, (base64) => {
            if (isFirstChunk) {
                setIsLoadingAudio(false);
                isFirstChunk = false;
            }
            activeSource = scheduleChunk(base64);
        });

        // When stream finishes, attach end
        if (activeSource) {
            (activeSource as AudioBufferSourceNode).onended = () => {
                if (audioContextRef.current && audioContextRef.current.currentTime >= nextStartTimeRef.current - 0.5) {
                    setIsSpeaking(false);
                }
            };
        } else {
             setIsSpeaking(false);
             setIsLoadingAudio(false);
        }

    } catch (e) {
        console.error("Audio Playback Error", e);
        setIsLoadingAudio(false);
        setIsSpeaking(false);
    }
  };

  const scheduleChunk = (base64: string) => {
      const ctx = audioContextRef.current;
      if (!ctx) return null;

      try {
          const binaryString = atob(base64);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);

          const int16 = new Int16Array(bytes.buffer);
          const float32 = new Float32Array(int16.length);
          for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0;

          const buffer = ctx.createBuffer(1, float32.length, 24000);
          buffer.getChannelData(0).set(float32);

          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);

          const startTime = Math.max(ctx.currentTime, nextStartTimeRef.current);
          source.start(startTime);
          nextStartTimeRef.current = startTime + buffer.duration;

          sourcesRef.current.push(source);

          source.onended = () => {
              const index = sourcesRef.current.indexOf(source);
              if (index > -1) sourcesRef.current.splice(index, 1);
          };

          return source;

      } catch (err) {
          console.error("Error decoding audio chunk", err);
          return null;
      }
  };

  // ROBUST JSON CLEANER
  const cleanJsonString = (str: string): string => {
      let clean = str;
      clean = clean.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      clean = clean.replace(/[\n\r\t]/g, " ");
      clean = clean.replace(/}\s*{/g, '}, {');
      clean = clean.replace(/,(\s*[}\]])/g, "$1");
      clean = clean.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
      clean = clean.replace(/(\d+)\.\s*([,}\]])/g, "$1.0$2");
      return clean;
  };

  return (
    <div className={`flex w-full mb-3 md:mb-5 pop-in ${isUser ? 'justify-end' : 'justify-start'} print:block print:mb-4 print:w-full`}>
      <div className={`flex w-full ${isUser ? 'flex-row-reverse' : 'flex-row'} gap-2.5 print:max-w-full print:flex-row print:w-full`}>
        
        {/* ICON */}
        <div className={`flex-shrink-0 w-9 h-9 md:w-11 md:h-11 rounded-full flex items-center justify-center no-print mt-1 transition-transform hover:scale-110 ${
          isUser ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'
        }`}>
          {isUser ? <User size={18} /> : <Bot size={20} />}
        </div>

        {/* BUBBLE */}
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} print:items-start print:w-full min-w-0 max-w-[92%] md:max-w-[85%]`}>
          
          <div className={`px-4 py-3 md:px-7 md:py-5 rounded-3xl shadow-sm markdown-body text-base md:text-xl leading-loose relative w-full transition-all duration-300
            ${isUser 
              ? 'bg-indigo-600 text-white rounded-tl-none font-medium' 
              : 'bg-white border border-slate-200 text-slate-900 rounded-tr-none font-medium'
            }`}>

            {/* AI Controls */}
            {!isUser && (
              <div className="flex gap-2 mb-3 pb-2 border-b border-slate-100 no-print w-full justify-end items-center">

                {/* Speak */}
                <button 
                  onClick={handleSpeak}
                  disabled={isLoadingAudio}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs md:text-sm font-bold border transition-all active:scale-95 mr-auto ${
                      isSpeaking
                      ? 'bg-indigo-100 text-indigo-600 border-indigo-200 animate-pulse'
                      : isLoadingAudio 
                        ? 'bg-slate-50 text-slate-400 cursor-wait'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-indigo-50 hover:text-indigo-600'
                  }`}
                >
                  {isLoadingAudio ? <Loader2 className="animate-spin" size={16} /> :
                   isSpeaking ? <StopCircle size={16} className="text-indigo-600" /> :
                   <Volume2 size={16} />}
                  <span>{isLoadingAudio ? 'جاري...' : isSpeaking ? 'إيقاف' : 'استمع'}</span>
                </button>

                {/* Copy */}
                <button 
                  onClick={handleCopy}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs md:text-sm font-bold border transition-all active:scale-95 ${
                      isCopied 
                      ? 'bg-emerald-100 text-emerald-600 border-emerald-200' 
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-indigo-50 hover:text-indigo-600'
                  }`}
                >
                  {isCopied ? <Check size={14} /> : <Copy size={14} />}
                  {isCopied ? 'تم النسخ' : 'نسخ'}
                </button>
              </div>
            )}

            {/* TEXT / MARKDOWN */}
            {isUser ? (
              <p className="whitespace-pre-wrap">{message.text}</p>
            ) : (
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                  
                  p: ({node, children, ...props}) => {
                    const text = extractText(children);
                    return (
                        <div className="group relative mb-3 -mx-2 px-2 rounded-xl hover:bg-indigo-50/30">
                            <div onClick={() => onQuote && onQuote(text)}>
                                <p className="inline" {...props}>{children}</p>
                            </div>
                        </div>
                    );
                  },

                  li: ({node, children, ...props}) => {
                    const text = extractText(children);
                    return (
                        <li 
                            className="group relative -mx-2 px-2 hover:bg-indigo-50/30 mb-2"
                            onClick={() => onQuote && onQuote(text)}
                            {...props}
                        >
                            <span>{children}</span>
                        </li>
                    );
                  },

                  a: ({node, ...props}) => (
                    <a className="text-blue-600 underline" {...props} />
                  ),

                  // CHARTS
                  code: ({node, inline, className, children, ...props}: any) => {
                    const match = /language-(\w+)/.exec(className || '');
                    const isChart = match && match[1] === 'chart';

                    if (!inline && isChart) {
                        try {
                           const raw = String(children);
                           const cleaned = cleanJsonString(raw);
                           const chartData = JSON.parse(cleaned);

                           return (
                              <div className="my-6 w-full h-72 bg-white p-4 rounded-xl border shadow-sm" dir="ltr">
                                  <h4 className="text-center font-bold mb-3">{chartData.title}</h4>
                                  <ResponsiveContainer width="100%" height="100%">
                                      {chartData.type === 'bar' ? (
                                           <BarChart data={chartData.data}>
                                               <CartesianGrid strokeDasharray="3 3" />
                                               <XAxis dataKey="x" />
                                               <YAxis />
                                               <RechartsTooltip />
                                               <Bar dataKey="y" fill="#4f46e5" />
                                           </BarChart>
                                      ) : chartData.type === 'area' ? (
                                           <AreaChart data={chartData.data}>
                                               <CartesianGrid strokeDasharray="3 3" />
                                               <XAxis dataKey="x" />
                                               <YAxis />
                                               <RechartsTooltip />
                                               <Area type="monotone" dataKey="y" stroke="#059669" fill="#10b981" fillOpacity={0.3} />
                                           </AreaChart>
                                      ) : (
                                           <LineChart data={chartData.data}>
                                               <CartesianGrid strokeDasharray="3 3" />
                                               <XAxis dataKey="x" />
                                               <YAxis />
                                               <RechartsTooltip />
                                               <Line type="monotone" dataKey="y" stroke="#059669" strokeWidth={3} />
                                           </LineChart>
                                      )}
                                  </ResponsiveContainer>
                              </div>
                           );
                        } catch {
                           return (
                             <div className="text-red-500 text-sm p-3 bg-red-50 border rounded">
                               ⚠️ تعذر عرض الرسم البياني
                             </div>
                           );
                        }
                    }

                    if (inline) {
                      return (
                        <button 
                          onClick={() => onTermClick && onTermClick(String(children))}
                          className="inline-flex items-center mx-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border"
                        >
                          <Search size={12} />
                          <span className="font-bold ml-1">{children}</span>
                        </button>
                      );
                    }

                    return (
                      <pre className="bg-[#1e1e1e] text-[#4ec9b0] p-5 rounded-lg">
                        <code>{children}</code>
                      </pre>
                    );
                  }
                }}
              >
                {message.text}
              </ReactMarkdown>
            )}
          </div>

          <span className="text-[11px] text-slate-400 mt-1 px-2">
            {message.timestamp.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  );
};
