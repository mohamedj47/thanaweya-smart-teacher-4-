
import React, { useState, useEffect } from 'react';
import { Key, ShieldCheck, Copy, RefreshCw, Home, AlertTriangle, RotateCcw, Lock, Crown, Printer } from 'lucide-react';

const SALT = "SMART_EDU_EGYPT_2026"; 

export const AdminGenerator: React.FC = () => {
  const [studentDeviceId, setStudentDeviceId] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  
  // State for Testing Tools
  const [myDeviceId, setMyDeviceId] = useState('');
  const [appStatus, setAppStatus] = useState('');
  const [showPrintPoster, setShowPrintPoster] = useState(false);
  const [appUrl, setAppUrl] = useState('');

  useEffect(() => {
    // Load current device info for testing
    setMyDeviceId(localStorage.getItem('device_id') || 'غير معروف');
    const isActivated = localStorage.getItem('app_activated') === 'true';
    setAppStatus(isActivated ? 'مفعل (Activated)' : 'فترة تجريبية (Trial)');
    setAppUrl(window.location.origin);
  }, []);

  const generateCode = () => {
    if (!studentDeviceId.trim()) return;
    const code = btoa(studentDeviceId.trim() + SALT).substring(0, 12);
    setGeneratedCode(code);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedCode);
    alert("تم نسخ الكود!");
  };

  // --- TESTING TOOLS ---
  const forceExpireTrial = () => {
    // Set date to 8 days ago
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 8);
    localStorage.setItem('trial_start_date', pastDate.toISOString());
    localStorage.removeItem('app_activated');
    alert("تم إنهاء الفترة التجريبية! عد للصفحة الرئيسية لترى شاشة القفل.");
    window.location.hash = ""; // Go back to home
    window.location.reload();
  };

  const resetApp = () => {
    localStorage.removeItem('trial_start_date');
    localStorage.removeItem('app_activated');
    localStorage.removeItem('device_id');
    alert("تم تصفير التطبيق! سيعاملك النظام كمستخدم جديد تماماً.");
    window.location.hash = "";
    window.location.reload();
  };

  const activateVip = () => {
      localStorage.setItem('app_activated', 'true');
      alert("تم تفعيل هذا الجهاز بنظام VIP! 👑");
      window.location.hash = "";
      window.location.reload();
  };

  if (showPrintPoster) {
    return (
      <div 
        className="min-h-screen bg-white text-black flex flex-col items-center justify-center p-8 text-center cursor-pointer" 
        dir="rtl" 
        onClick={() => window.print()}
        title="اضغط للطباعة"
      >
        <button 
            onClick={(e) => {e.stopPropagation(); setShowPrintPoster(false)}} 
            className="fixed top-4 left-4 p-3 bg-red-100 text-red-600 rounded-full no-print hover:bg-red-200"
        >
            <Home size={24} />
        </button>

        <div className="border-4 border-black p-12 rounded-3xl max-w-2xl w-full">
            <h1 className="text-7xl font-black mb-4 tracking-tighter">المعلم الذكي</h1>
            <p className="text-3xl font-bold mb-12 text-slate-700">رفيقك للتفوق في الثانوية العامة 🚀</p>
            
            <div className="bg-white p-4 inline-block rounded-xl border-2 border-slate-200 mb-8">
               <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(appUrl)}`} 
                  alt="Scan QR" 
                  className="w-80 h-80"
               />
            </div>
            
            <div className="space-y-4">
                <p className="text-2xl font-bold border-2 border-black px-8 py-3 rounded-full inline-block bg-black text-white">
                    امسح الكود وحمل التطبيق فوراً
                </p>
                <p className="text-xl text-slate-500 mt-4">
                    متاح للصف الأول، الثاني، والثالث الثانوي
                </p>
            </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4 font-mono" dir="rtl">
      <div className="max-w-2xl w-full space-y-6">
        
        {/* Generator Section */}
        <div className="bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 p-8">
          <div className="flex items-center gap-3 mb-8 border-b border-slate-700 pb-6">
            <div className="bg-emerald-500/10 p-3 rounded-full">
              <ShieldCheck className="text-emerald-500 w-8 h-8" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">لوحة التحكم السرية</h1>
              <p className="text-slate-400 text-xs">Admin Code Generator</p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">رقم جهاز الطالب (Device ID)</label>
              <input 
                type="text" 
                value={studentDeviceId}
                onChange={(e) => setStudentDeviceId(e.target.value)}
                placeholder="مثال: ID-X9Y2Z1"
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none font-mono text-center"
                dir="ltr"
              />
            </div>

            <button 
              onClick={generateCode}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw size={18} />
              توليد كود التفعيل
            </button>

            {generatedCode && (
              <div className="bg-slate-900 p-4 rounded-lg border border-emerald-500/50 text-center animate-in fade-in slide-in-from-top-2">
                <p className="text-xs text-slate-500 mb-2">كود التفعيل لهذا الطالب هو:</p>
                <div className="flex items-center justify-center gap-2 mb-2">
                  <code className="text-2xl font-black text-emerald-400 tracking-wider">{generatedCode}</code>
                </div>
                <button 
                  onClick={copyToClipboard}
                  className="text-xs text-slate-400 hover:text-white flex items-center justify-center gap-1 mx-auto"
                  title="Copy"
                >
                  <Copy size={12} />
                  نسخ الكود
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Marketing Tools */}
        <div className="bg-slate-800 rounded-2xl shadow-xl border border-indigo-900/30 p-6 opacity-90">
             <h3 className="text-indigo-400 font-bold mb-4 flex items-center gap-2 text-sm uppercase tracking-wider">
                <Printer size={16} />
                أدوات التسويق والدعاية
            </h3>
            <button 
                onClick={() => setShowPrintPoster(true)}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2"
            >
                <Printer size={18} />
                طباعة بوستر (QR Code) للمحل
            </button>
        </div>

        {/* Developer Testing Tools Section */}
        <div className="bg-slate-800 rounded-2xl shadow-xl border border-red-900/30 p-6 opacity-90">
            <h3 className="text-red-400 font-bold mb-4 flex items-center gap-2 text-sm uppercase tracking-wider">
                <AlertTriangle size={16} />
                أدوات اختبار النظام (لك أنت فقط)
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-900 p-3 rounded-lg border border-slate-700">
                    <p className="text-xs text-slate-500 mb-1">حالتي الآن:</p>
                    <p className="font-bold text-white">{appStatus}</p>
                    <p className="text-[10px] text-slate-600 mt-1 font-mono">{myDeviceId}</p>
                </div>

                <div className="space-y-2">
                    {/* VIP Button */}
                    <button 
                        onClick={activateVip}
                        className="w-full bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold py-2 px-3 rounded border border-amber-400 flex items-center justify-center gap-2 shadow-lg shadow-amber-900/20"
                    >
                        <Crown size={14} />
                        تفعيل جهازي فوراً (VIP Owner)
                    </button>

                    <div className="flex gap-2">
                        <button 
                            onClick={forceExpireTrial}
                            className="flex-1 bg-red-900/50 hover:bg-red-900/80 text-red-200 text-xs font-bold py-2 px-3 rounded border border-red-900/50 flex items-center justify-center gap-2"
                            title="إنهاء الفترة التجريبية"
                        >
                            <Lock size={14} />
                            قفل
                        </button>
                        
                        <button 
                            onClick={resetApp}
                            className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold py-2 px-3 rounded border border-slate-600 flex items-center justify-center gap-2"
                            title="تصفير التطبيق"
                        >
                            <RotateCcw size={14} />
                            تصفير
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <div className="pt-4 text-center">
           <a href="/" className="text-slate-500 hover:text-white text-sm flex items-center justify-center gap-2 transition-colors">
             <Home size={14} />
             العودة للتطبيق الرئيسي
           </a>
        </div>

      </div>
    </div>
  );
};
