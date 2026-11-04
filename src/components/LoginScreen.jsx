import React, { useState, useEffect, useRef } from 'react';
import {
  Eye, EyeOff, LogIn, Database, Sparkles, CheckCircle2,
  Crown, Stethoscope, User, Lock, AlertCircle, RefreshCw
} from 'lucide-react';
import { sqliteService } from '../db/sqliteService';

export function LoginScreen({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const [recentUsers, setRecentUsers] = useState([]);

  const usernameRef = useRef(null);

  // Initialize SQLite & load cached users list (names only, no passwords)
  useEffect(() => {
    let alive = true;
    const init = async () => {
      try {
        await sqliteService.init();
        if (!alive) return;
        setDbReady(true);
        // Load users for quick-select tiles (only public info)
        const users = await sqliteService.getUsers();
        if (alive) setRecentUsers(users.filter(u => u.is_active));
      } catch (e) {
        console.warn('DB init error in login:', e);
        if (alive) setDbReady(true); // still show form
      }
    };
    init();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (dbReady && usernameRef.current) {
      usernameRef.current.focus();
    }
  }, [dbReady]);

  const handleLogin = async (e) => {
    e?.preventDefault();
    if (!username.trim()) {
      setErrorMessage('يرجى إدخال اسم المستخدم');
      usernameRef.current?.focus();
      return;
    }
    if (!password) {
      setErrorMessage('يرجى إدخال كلمة المرور');
      return;
    }
    setIsLoading(true);
    setErrorMessage('');
    try {
      const result = await sqliteService.loginUser(username.trim(), password);
      if (result.success) {
        setIsSuccess(true);
        setTimeout(() => {
          onLoginSuccess(result.user);
        }, 500);
      } else {
        setErrorMessage(result.error || 'بيانات الدخول غير صحيحة');
        setPassword('');
      }
    } catch (err) {
      setErrorMessage('حدث خطأ أثناء تسجيل الدخول. حاول مجدداً.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickSelect = (user) => {
    setUsername(user.username);
    setPassword('');
    setErrorMessage('');
    setTimeout(() => {
      document.getElementById('login-password-input')?.focus();
    }, 50);
  };

  const roleIcon = (role) => {
    if (role === 'admin') return <Crown className="w-4 h-4 text-amber-400" />;
    return <Stethoscope className="w-4 h-4 text-teal-400" />;
  };

  const roleLabel = (role) => {
    if (role === 'admin') return 'مدير الصيدلية';
    if (role === 'pharmacist') return 'صيدلاني';
    return 'كاشير / موظف';
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between items-center bg-[#0B1220] text-slate-100 overflow-hidden px-4 py-8 font-cairo" dir="rtl">
      {/* Ambient glows */}
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Logo Header */}
      <header className="relative z-10 flex flex-col items-center text-center mt-2">
        <div className="inline-flex items-center justify-center p-3.5 rounded-2xl bg-gradient-to-br from-teal-500/20 via-teal-500/10 to-transparent border border-teal-500/30 shadow-glow-teal mb-3">
          <span className="text-3xl select-none">💊</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
          صيدليتي <span className="text-teal-400 font-medium text-xl">| إدارة نقاط البيع</span>
        </h1>
        <p className="text-slate-400 text-sm mt-1 flex items-center gap-1.5 font-medium">
          <Sparkles className="w-4 h-4 text-teal-400" />
          سجّل دخولك لبدء الوردية والعمل على النظام
        </p>
      </header>

      {/* Login Card */}
      <main className="relative z-10 w-full max-w-md my-auto space-y-4">

        {/* Quick User Select Tiles */}
        {recentUsers.length > 0 && (
          <div>
            <p className="text-xs text-slate-400 font-bold mb-2 text-center">اختر حسابك للدخول السريع:</p>
            <div className="grid grid-cols-3 gap-2">
              {recentUsers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => handleQuickSelect(u)}
                  className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                    username === u.username
                      ? 'bg-teal-500/15 border-teal-500/60 shadow-glow-teal'
                      : 'bg-[#17233A]/60 border-[#23324D] hover:border-teal-500/40 hover:bg-[#17233A]'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    u.role === 'admin' ? 'bg-amber-500/20 border border-amber-500/30' : 'bg-teal-500/20 border border-teal-500/30'
                  }`}>
                    {roleIcon(u.role)}
                  </div>
                  <div className="text-[11px] font-bold text-white truncate w-full">{u.full_name.split(' ')[0]}</div>
                  <div className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                    u.role === 'admin' ? 'text-amber-300 bg-amber-500/10' : 'text-teal-300 bg-teal-500/10'
                  }`}>
                    {roleLabel(u.role)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Login Form */}
        <div className="bg-[#111A2B] border border-[#23324D] rounded-3xl p-6 shadow-card-dark">
          <form onSubmit={handleLogin} className="space-y-4">

            {/* Username Field */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300">
                اسم المستخدم (Username)
              </label>
              <div className="relative">
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  ref={usernameRef}
                  type="text"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setErrorMessage(''); }}
                  placeholder="أدخل اسم المستخدم..."
                  autoComplete="username"
                  className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl pr-10 pl-4 py-3 text-sm text-white font-medium focus:outline-none focus:ring-1 focus:ring-teal-500/30 placeholder:text-slate-600 transition-colors"
                  disabled={isLoading || isSuccess}
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300">
                كلمة المرور (Password)
              </label>
              <div className="relative">
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="login-password-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrorMessage(''); }}
                  placeholder="أدخل كلمة المرور..."
                  autoComplete="current-password"
                  className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl pr-10 pl-11 py-3 text-sm text-white font-medium focus:outline-none focus:ring-1 focus:ring-teal-500/30 placeholder:text-slate-600 transition-colors"
                  disabled={isLoading || isSuccess}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-400 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error / Success Message */}
            <div className="min-h-[24px]">
              {errorMessage && (
                <div className="flex items-center gap-2 text-rose-400 text-xs font-medium bg-rose-500/10 border border-rose-500/30 px-3 py-2 rounded-xl">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}
              {isSuccess && (
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>تم التحقق بنجاح! جاري تحميل النظام...</span>
                </div>
              )}
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={isLoading || isSuccess || !dbReady}
              className={`w-full py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2.5 transition-all shadow-lg cursor-pointer ${
                isSuccess
                  ? 'bg-emerald-600 text-white shadow-emerald-900/30'
                  : 'bg-gradient-to-l from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white shadow-teal-900/30 disabled:opacity-50 disabled:cursor-not-allowed'
              }`}
            >
              {isLoading ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : isSuccess ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <LogIn className="w-5 h-5" />
              )}
              <span>
                {isLoading ? 'جاري التحقق...' : isSuccess ? 'تم الدخول بنجاح ✓' : 'تسجيل الدخول إلى النظام'}
              </span>
            </button>

          </form>

          {/* Default credentials hint */}
          <div className="mt-4 pt-3 border-t border-[#23324D]/60 text-center">
            <p className="text-[11px] text-slate-500">
              بيانات الدخول الافتراضية للمدير:
              <span className="text-teal-400 font-mono font-bold mx-1">admin</span>
              /
              <span className="text-teal-400 font-mono font-bold mx-1">admin123</span>
              <br />
              <span className="text-amber-400/70">قم بتغييرها فور الدخول من الإعدادات ← إدارة المستخدمين</span>
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-md flex items-center justify-between text-xs text-slate-400 bg-[#111A2B]/80 backdrop-blur border border-[#23324D] px-4 py-2.5 rounded-2xl shadow-sm">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-slate-300 font-medium">قاعدة البيانات: {dbReady ? 'متصلة محلياً 100%' : 'جاري الاتصال...'}</span>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-teal-400/90 font-medium">
          <Database className="w-3.5 h-3.5" />
          <span>SQLite Native</span>
        </div>
      </footer>
    </div>
  );
}
