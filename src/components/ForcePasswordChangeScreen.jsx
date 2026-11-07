import React, { useState } from 'react';
import {
  Lock,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  ShieldAlert
} from 'lucide-react';
import { sqliteService } from '../db/sqliteService';
import { validatePasswordPolicy } from '../utils/password';

export function ForcePasswordChangeScreen({ currentUser, onPasswordChanged }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!newPassword) {
      setErrorMessage('يرجى إدخال كلمة المرور الجديدة.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('كلمة المرور وتأكيدها غير متطابقين.');
      return;
    }

    const policy = validatePasswordPolicy(newPassword, currentUser?.username);
    if (!policy.valid) {
      setErrorMessage(policy.error);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await sqliteService.changeUserPassword(currentUser.id, newPassword);
      if (res.success) {
        onPasswordChanged();
      } else {
        setErrorMessage(res.error || 'فشل تحديث كلمة المرور.');
      }
    } catch (err) {
      setErrorMessage('حدث خطأ أثناء حفظ كلمة المرور.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0B1220] flex items-center justify-center p-4 select-none font-cairo overflow-y-auto" dir="rtl">
      <div className="w-full max-w-[500px] bg-[#111A2B] border border-[#23324D] rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 bg-gradient-to-b from-[#17233A] to-[#111A2B] border-b border-[#23324D] text-center flex flex-col items-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center mb-3">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-black text-white">تغيير كلمة المرور إجباري</h1>
          <p className="text-xs text-slate-400 mt-1">
            مرحباً {currentUser?.full_name || currentUser?.username}، كلمة مرور حسابك حالياً افتراضية أو تحتاج للتحديث لحماية صيدليتك.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-300">
              كلمة المرور الجديدة:
            </label>
            <div className="relative">
              <Lock className="absolute right-3.5 top-3 w-4 h-4 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                dir="ltr"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl pr-10 pl-10 py-2.5 text-sm text-white font-mono focus:outline-none"
                autoFocus
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
              يجب ألا تقل عن 4 خانات (أرقام فقط، حروف فقط، أو حروف وأرقام بدون رموز خاصة).
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-300">
              تأكيد كلمة المرور الجديدة:
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

          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-teal-500/20 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50 mt-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isSubmitting ? 'جارٍ التحديث...' : 'تحديث كلمة المرور والمتابعة'}</span>
          </button>
        </form>

      </div>
    </div>
  );
}
