
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

        // When stream finishes, we attach onended to the LAST chunk to reset state
        if (activeSource) {
            (activeSource as AudioBufferSourceNode).onended = () => {
                // Only reset if no other sources are pending (simple check)
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
          for (let i = 0; i < len; i++) {
              bytes[i] = binaryString.charCodeAt(i);
          }
          
          const int16 = new Int16Array(bytes.buffer);
          const float32 = new Float32Array(int16.length);
          for (let i = 0; i < int16.length; i++) {
              float32[i] = int16[i] / 32768.0;
          }
          
          const buffer = ctx.createBuffer(1, float32.length, 24000);
          buffer.getChannelData(0).set(float32);
          
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          
          // Gapless Scheduling
          const startTime = Math.max(ctx.currentTime, nextStartTimeRef.current);
          source.start(startTime);
          nextStartTimeRef.current = startTime + buffer.duration;
          
          sourcesRef.current.push(source);
          
          // Cleanup source from list when done
          source.onended = () => {
              const index = sourcesRef.current.indexOf(source);
              if (index > -1) {
                  sourcesRef.current.splice(index, 1);
              }
          };

          return source;
      } catch (err) {
          console.error("Error decoding audio chunk", err);
          return null;
      }
  };

  // --- ROBUST JSON CLEANER ---
  const cleanJsonString = (str: string): string => {
      let clean = str;
      // Remove comments
      clean = clean.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      // Replace newlines and tabs with spaces
      clean = clean.replace(/[\n\r\t]/g, " ");
      // Fix missing commas between objects: } {  =>  }, {
      clean = clean.replace(/}\s*{/g, '}, {');
      // Fix trailing commas before closing braces/brackets
      clean = clean.replace(/,(\s*[}\]])/g, "$1");
      // Fix unquoted keys (simple alphanumeric)
      clean = clean.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
      // Fix trailing decimals: 10. => 10.0
      clean = clean.replace(/(\d+)\.\s*([,}\]])/g, "$1.0$2");
      return clean;
  };

  return (
    // UPDATED LAYOUT FOR ARABIC (RTL):
    // User (Left): justify-end, flex-row-reverse
    // Bot (Right): justify-start, flex-row
    <div className={`flex w-full mb-3 md:mb-5 pop-in ${isUser ? 'justify-end' : 'justify-start'} print:block print:mb-4 print:w-full`}>
      <div className={`flex w-full ${isUser ? 'flex-row-reverse' : 'flex-row'} gap-2.5 print:max-w-full print:flex-row print:w-full`}>
        
        <div className={`flex-shrink-0 w-9 h-9 md:w-11 md:h-11 rounded-full flex items-center justify-center no-print mt-1 transition-transform hover:scale-110 ${
          isUser ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'
        }`}>
          {isUser ? <User size={18} className="md:w-[22px]" /> : <Bot size={20} className="md:w-[24px]" />}
        </div>

        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} print:items-start print:w-full min-w-0 max-w-[92%] md:max-w-[85%]`}>
          {/* Changed text size from text-sm to text-base for mobile, and text-lg to text-xl for desktop */}
          <div className={`px-4 py-3 md:px-7 md:py-5 rounded-3xl shadow-sm markdown-body text-base md:text-xl leading-loose relative w-full overflow-hidden transition-all duration-300
            ${isUser 
              ? 'bg-indigo-600 text-white rounded-tl-none font-medium user-message-bubble' 
              : 'bg-white border border-slate-200 text-slate-900 rounded-tr-none font-medium'
            }`}>
            
            {!isUser && (
              <div className="flex gap-2 mb-3 pb-2 border-b border-slate-100 no-print w-full justify-end items-center">
                
                {/* AI TTS Button (Gemini Powered) */}
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
                  title={isSpeaking ? "إيقاف القراءة" : "استمع للشرح بصوت المعلمة (جودة عالية)"}
                >
                  {isLoadingAudio ? (
                     <Loader2 size={16} className="animate-spin" />
                  ) : isSpeaking ? (
                     <StopCircle size={16} className="text-indigo-600" />
                  ) : (
                     <Volume2 size={16} />
                  )}
                  <span className="inline">
                      {isLoadingAudio ? 'جاري التحميل...' : isSpeaking ? 'إيقاف' : 'استمع'}
                  </span>
                </button>

                <button 
                  onClick={handleCopy}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs md:text-sm font-bold border border-slate-200 transition-all active:scale-95 ${
                      isCopied 
                      ? 'bg-emerald-100 text-emerald-600 border-emerald-200' 
                      : 'bg-slate-50 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'
                  }`}
                >
                  {isCopied ? <Check size={14} /> : <Copy size={14} />}
                  {isCopied ? 'تم النسخ' : 'نسخ'}
                </button>
              </div>
            )}

            {isUser ? (
              <p className="whitespace-pre-wrap leading-loose break-words">{message.text}</p>
            ) : (
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                  table: ({node, ...props}) => <div className="overflow-x-auto my-4 w-full border rounded-xl print:overflow-visible print:block"><table className="min-w-full divide-y divide-slate-200 border text-sm md:text-lg print:border-black print:text-sm print:w-full" {...props} /></div>,
                  th: ({node, ...props}) => <th className="px-3 py-3 bg-slate-50 text-right font-bold text-slate-800 uppercase border print:bg-gray-100 print:text-black print:border-black whitespace-nowrap" {...props} />,
                  td: ({node, ...props}) => <td className="px-3 py-3 text-slate-800 border print:border-black min-w-[120px]" {...props} />,
                  a: ({node, ...props}) => <a className="text-blue-600 underline hover:text-blue-800 font-semibold print:text-black print:no-underline break-all" {...props} />,
                  
                  // --- INTERACTIVE PARAGRAPHS (Text Select Only) ---
                  p: ({node, children, ...props}) => {
                    const text = extractText(children);

                    return (
                        <div 
                            className="group relative mb-3 last:mb-0 -mx-2 px-2 rounded-xl transition-all duration-300 hover:bg-indigo-50/30"
                        >
                            <div
                                className="cursor-pointer select-none md:select-text"
                                onClick={() => onQuote && onQuote(text)}
                                title="اضغط للسؤال عن هذه الجزئية"
                            >
                                <p className="inline leading-loose" {...props}>{children}</p>
                            </div>
                            
                            {/* Controls Overlay (Ask Hint Only) */}
                            <div className="inline-flex items-center gap-1 absolute left-2 top-0 transform -translate-y-1/2 bg-white shadow-sm border border-slate-200 rounded-full px-2 py-0.5 opacity-0 group-hover:opacity-100 transition-all z-10 scale-90 hover:scale-100 pointer-events-none">
                                <span className="text-[10px] text-slate-400 font-bold">
                                    <HelpCircle size={12} className="inline mr-1" />
                                    اسأل
                                </span>
                            </div>
                        </div>
                    );
                  },
                  
                  li: ({node, children, ...props}) => {
                    const text = extractText(children);
                    return (
                        <li 
                            className="group relative -mx-2 px-2 rounded-xl transition-colors cursor-pointer break-words hover:bg-indigo-50/30 mb-2"
                            onClick={(e) => {
                                e.stopPropagation();
                                onQuote && onQuote(text);
                            }}
                            {...props}
                        >
                            <span className="inline leading-loose">{children}</span>
                        </li>
                    );
                  },

                  blockquote: ({node, ...props}) => <blockquote className="border-r-4 border-indigo-300 pr-4 italic text-slate-700 bg-indigo-50/50 p-3 rounded-lg my-3 text-base md:text-xl print:bg-white print:text-black print:border-black print:pl-0" {...props} />,
                  
                  // --- CHART RENDERING LOGIC ---
                  code: ({node, inline, className, children, ...props}: any) => {
                     const match = /language-(\w+)/.exec(className || '');
                     const isChart = match && match[1] === 'chart';
                     
                     if (!inline && isChart) {
                        try {
                           const jsonString = String(children);
                           
                           // If streaming and JSON looks very short, just show loader to avoid error spam
                           if (message.isStreaming && (jsonString.length < 5 || !jsonString.trim().endsWith('}'))) {
                               // Silent throw for streaming incomplete JSON
                               throw new Error("Stream incomplete");
                           }

                           const cleanedJson = cleanJsonString(jsonString);
                           const chartData = JSON.parse(cleanedJson);
                           
                           return (
                               <div className="my-6 w-full h-72 md:h-96 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm direction-ltr pop-in" dir="ltr">
                                   <h4 className="text-center font-bold text-slate-700 mb-3 text-base md:text-lg">{chartData.title}</h4>
                                   <ResponsiveContainer width="100%" height="100%">
                                       {chartData.type === 'bar' ? (
                                           <BarChart data={chartData.data}>
                                               <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                               <XAxis dataKey="x" tick={{fontSize: 12}}>
                                                   <Label value={chartData.xAxisLabel} offset={-5} position="insideBottom" style={{fontSize: 12, fill: '#666'}} />
                                               </XAxis>
                                               <YAxis tick={{fontSize: 12}} label={{ value: chartData.yAxisLabel, angle: -90, position: 'insideLeft', style:{fontSize: 12, fill: '#666'} }} />
                                               <RechartsTooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '14px'}} />
                                               <Bar dataKey="y" fill="#4f46e5" radius={[4, 4, 0, 0]} name={chartData.yAxisLabel || 'القيمة'} />
                                           </BarChart>
                                       ) : chartData.type === 'area' ? (
                                            <AreaChart data={chartData.data}>
                                               <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                               <XAxis dataKey="x" type="number" domain={['auto', 'auto']} tick={{fontSize: 12}}>
                                                   <Label value={chartData.xAxisLabel} offset={-5} position="insideBottom" style={{fontSize: 12, fill: '#666'}} />
                                               </XAxis>
                                               <YAxis tick={{fontSize: 12}} label={{ value: chartData.yAxisLabel, angle: -90, position: 'insideLeft', style:{fontSize: 12, fill: '#666'} }} />
                                               <RechartsTooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '14px'}} />
                                               <Area type="monotone" dataKey="y" stroke="#059669" fill="#10b981" fillOpacity={0.3} name={chartData.yAxisLabel || 'القيمة'} />
                                            </AreaChart>
                                       ) : (
                                           <LineChart data={chartData.data}>
                                               <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                               <XAxis dataKey="x" type="number" domain={['auto', 'auto']} tick={{fontSize: 12}}>
                                                   <Label value={chartData.xAxisLabel} offset={-5} position="insideBottom" style={{fontSize: 12, fill: '#666'}} />
                                               </XAxis>
                                               <YAxis tick={{fontSize: 12}} label={{ value: chartData.yAxisLabel, angle: -90, position: 'insideLeft', style:{fontSize: 12, fill: '#666'} }} />
                                               <RechartsTooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '14px'}} />
                                               <Line type="monotone" dataKey="y" stroke="#059669" strokeWidth={3} dot={{r: 4, fill:'#059669'}} activeDot={{r: 6}} name={chartData.yAxisLabel || 'القيمة'} />
                                           </LineChart>
                                       )}
                                   </ResponsiveContainer>
                               </div>
                           );
                        } catch (e) {
                           // If streaming, show a loading state instead of an error to prevent flickering/confusion
                           if (message.isStreaming) {
                               return (
                                   <div className="flex justify-center p-4 my-4 bg-slate-50 rounded-xl border border-slate-100">
                                       <div className="flex items-center gap-2 text-indigo-500 text-sm font-medium animate-pulse">
                                           <Loader2 className="animate-spin" size={18} />
                                           جاري رسم المخطط البياني...
                                       </div>
                                   </div>
                               );
                           }

                           console.error("Chart parsing failed", e);
                           return (
                               <div className="text-red-500 text-sm p-3 bg-red-50 border border-red-100 rounded text-center my-3 direction-rtl">
                                  ⚠️ تعذر عرض الرسم البياني (بيانات غير صالحة)
                               </div>
                           );
                        }
                     }

                     if (inline) {
                       return (
                         <button 
                           onClick={(e) => {
                               e.stopPropagation();
                               onTermClick && onTermClick(String(children));
                           }}
                           className="inline-flex items-center mx-1 px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100 hover:border-indigo-300 transition-colors cursor-pointer print:bg-transparent print:border-black print:text-black no-print-button-style text-sm md:text-base align-middle active:scale-95 leading-none"
                         >
                           <Search size={12} className="ml-1 opacity-50 no-print" />
                           <span className="font-bold">{children}</span>
                         </button>
                       );
                     }
                     return (
                        <div className="my-5 w-full direction-ltr pop-in" dir="ltr">
                           <div className="flex justify-end mb-0 no-print">
                              <span className="bg-slate-700 text-slate-200 text-[10px] md:text-xs px-3 py-1 rounded-t-lg font-bold">
                                كود توضيحي
                              </span>
                           </div>
                           <pre className="bg-[#1e1e1e] text-[#4ec9b0] p-5 md:p-6 rounded-xl rounded-tr-none shadow-lg border-l-4 border-emerald-500 font-mono text-sm md:text-base leading-relaxed whitespace-pre-wrap break-words overflow-x-auto print:bg-white print:border print:border-black print:text-black print:shadow-none print:whitespace-pre-wrap w-full flex flex-col justify-center items-center text-center">
                             <code {...props} className="break-words inline-block">
                               {children}
                             </code>
                           </pre>
                        </div>
                     );
                  },
                }}
              >
                {message.text}
              </ReactMarkdown>
            )}
          </div>
          <span className="text-[11px] text-slate-400 mt-1.5 px-2 no-print font-medium">
            {message.timestamp.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  );
};
