import React, { useState } from 'react';
import {
  ShieldCheck,
  UserCheck,
  Lock,
  User,
  Sparkles,
  AlertCircle,
  Eye,
  EyeOff,
  CheckCircle2,
  Building2
} from 'lucide-react';
import { sqliteService } from '../db/sqliteService';
import { validatePasswordPolicy } from '../utils/password';

export function FirstRunSetupScreen({ onSetupSuccess }) {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSetup = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!fullName.trim() || !username.trim() || !password) {
      setErrorMessage('يرجى ملء جميع الحقول المطلوبة لإنشاء حساب المالك.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('كلمة المرور وتأكيد كلمة المرور غير متطابقين.');
      return;
    }

    const policy = validatePasswordPolicy(password, username.trim());
    if (!policy.valid) {
      setErrorMessage(policy.error);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await sqliteService.createOwner({
        full_name: fullName.trim(),
        username: username.trim(),
        password
      });

      if (res.success) {
        onSetupSuccess(res.user);
      } else {
        setErrorMessage(res.error || 'حدث خطأ أثناء إعداد حساب المالك.');
      }
    } catch (err) {
      setErrorMessage('حدث خطأ غير متوقع. حاول مجدداً.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0B1220] flex items-center justify-center p-4 select-none font-cairo overflow-y-auto" dir="rtl">
      <div className="w-full max-w-[560px] bg-[#111A2B] border border-[#23324D] rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 bg-gradient-to-b from-[#17233A] to-[#111A2B] border-b border-[#23324D] text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-slate-950 shadow-glow-teal mb-3">
            <ShieldCheck className="w-9 h-9 stroke-[2.2]" />
          </div>
          <h1 className="text-2xl font-black text-white">إعداد حساب المالك والمدير العام</h1>
          <p className="text-xs text-slate-400 mt-1">
            مرحباً بك في نظام صيدليتي. يرجى إنشاء حساب المالك الرئيسي لبدء استخدام الصيدلية بأمان.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSetup} className="p-6 sm:p-7 space-y-4">
          
          {/* Full Name */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-300">
              الاسم بالكامل (صاحب / مدير الصيدلية):
            </label>
            <div className="relative">
              <User className="absolute right-3.5 top-3 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="د. أحمد محمود..."
                className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl pr-10 pl-3 py-2.5 text-sm text-white focus:outline-none"
                autoFocus
              />
            </div>
          </div>

          {/* Username */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-300">
              اسم المستخدم لتسجيل الدخول (Username):
            </label>
            <div className="relative">
              <UserCheck className="absolute right-3.5 top-3 w-4 h-4 text-slate-400" />
              <input
                type="text"
                dir="ltr"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="أدخل اسم المستخدم (مثال: admin أو doctor1)"
                className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl pr-10 pl-3 py-2.5 text-sm text-white font-mono focus:outline-none text-left"
              />
            </div>
            <p className="text-[10px] text-slate-500">
              يمكنك كتابة أي اسم مستخدم تختاره (حروف أو أرقام).
            </p>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-300">
              كلمة المرور (Password):
            </label>
            <div className="relative">
              <Lock className="absolute right-3.5 top-3 w-4 h-4 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="أدخل كلمة المرور (4 خانات على الأقل)..."
                className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl pr-10 pl-10 py-2.5 text-sm text-white font-mono focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-3 text-slate-400 hover:text-white"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-slate-400">
              تتكون من 4 خانات على الأقل (أرقام فقط، حروف فقط، أو حروف وأرقام بدون رموز خاصة).
            </p>
          </div>

          {/* Confirm Password */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-300">
              تأكيد كلمة المرور:
            </label>
            <div className="relative">
              <Lock className="absolute right-3.5 top-3 w-4 h-4 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                dir="ltr"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl pr-10 pl-3 py-2.5 text-sm text-white font-mono focus:outline-none"
              />
            </div>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-teal-500/20 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50 mt-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>{isSubmitting ? 'جارٍ إنشاء الحساب...' : '🚀 إنشاء حساب المالك وتأكيد الهوية'}</span>
          </button>
        </form>

        <div className="py-3 px-6 bg-[#0B1220]/90 border-t border-[#23324D] text-center">
          <p className="text-[11px] text-slate-500">
            🔒 هذا الحساب يمتلك كافة الصلاحيات وإدارة المستخدمين ولا يمكن حذفه.
          </p>
        </div>

      </div>
    </div>
  );
}
