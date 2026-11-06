import React, { useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  AlertOctagon,
  AlertTriangle,
  Key,
  Copy,
  CheckCircle2,
  Sparkles,
  ClipboardPaste,
  MessageCircle,
  Lock,
  Clock
} from 'lucide-react';
import { activateLicenseKey } from '../utils/licenseManager.js';
import { playBarcodeBeep, playCashDrawerSound } from '../utils/sound.js';

export function ActivationScreen({
  machineId,
  initialStatus = 'UNLICENSED', // 'REVOKED', 'EXPIRED', 'CLOCK_TAMPER', 'UNLICENSED'
  expiresDate = '',
  onActivationSuccess,
  onRevoke
}) {
  const [currentStatus, setCurrentStatus] = useState(initialStatus);
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Clipboard helper with a safe fallback for file:// / non-secure Electron contexts
  const copyToClipboard = async (text) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {}
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  };

  // Copy Machine Code to Clipboard
  const handleCopyCode = async () => {
    await copyToClipboard(machineId);
    setCopiedCode(true);
    playBarcodeBeep();
    setTimeout(() => setCopiedCode(false), 2500);
  };

  // WhatsApp Contact with Eng. Abdullah Gamil (01201395243)
  const handleWhatsAppContact = async () => {
    await copyToClipboard(machineId);
    setCopiedCode(true);
    playBarcodeBeep();
    setTimeout(() => setCopiedCode(false), 2500);

    let statusNote = 'أود تفعيل النسخة الرسمية لبرنامج صيدليتي.';
    if (currentStatus === 'REVOKED') {
      statusNote = 'أرغب في إعادة تفعيل وتسوية ترخيص البرنامج بعد إيقافه.';
    } else if (currentStatus === 'EXPIRED') {
      statusNote = 'انتهت مدة اشتراكي وأود تجديد الترخيص.';
    }

    const message = `السلام عليكم ورحمة الله وبركاته،\nم/ عبد الله جميل\n\n${statusNote}\n\nكود جهازي هو:\n${machineId}\n\nيرجى التكرم بإرسال مفتاح التفعيل الرسمي لتنشيط النسخة على هذا الجهاز. شكراً جزيلاً!`;
    const whatsappUrl = `https://wa.me/201201395243?text=${encodeURIComponent(message)}`;
    try {
      window.open(whatsappUrl, '_blank');
    } catch (e) {}
  };

  // Paste License Key from Clipboard
  const handlePasteKey = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setLicenseKeyInput(text.trim().toUpperCase());
        setErrorMsg('');
        playBarcodeBeep();
      }
    } catch (e) {
      setErrorMsg('تعذر القراءة من الحافظة. الصق المفتاح يدوياً.');
    }
  };

  // Submit Activation or Revoke Key
  const handleActivate = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    const key = licenseKeyInput.trim().toUpperCase();

    if (!key) {
      setErrorMsg('يرجى إدخال مفتاح التفعيل أولاً.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await activateLicenseKey(key);

      // Check if this was an Admin PIN Reset Code
      if (res.isResetPin) {
        setIsSuccess(false);
        setSuccessMsg(res.message || 'تمت إعادة تعيين رمز المدير.');
        playCashDrawerSound();
        setLicenseKeyInput('');
        return;
      }

      // Check if this was a Revoke Code entered by developer
      if (res.isRevoked) {
        setCurrentStatus('REVOKED');
        setErrorMsg('🔴 تم إلغاء وإيقاف ترخيص هذا الجهاز بنجاح بناءً على كود الإلغاء الأمني!');
        playBarcodeBeep();
        if (onRevoke) onRevoke();
        return;
      }

      if (res.success) {
        setIsSuccess(true);
        setCurrentStatus(res.status || 'LIFETIME');
        setSuccessMsg(res.message || 'تم تفعيل النظام بنجاح! جارٍ فتح البرنامج...');
        playCashDrawerSound();
        setTimeout(() => {
          if (typeof onActivationSuccess === 'function') onActivationSuccess(res.status);
        }, 1200);
      } else {
        setErrorMsg(res.error || 'مفتاح التفعيل غير صحيح أو غير متطابق مع كود هذا الجهاز!');
        playBarcodeBeep();
      }
    } catch (err) {
      setErrorMsg('حدث خطأ أثناء فحص التفعيل. يرجى المحاولة ثانية.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Dynamic status-specific UI colors and icons
  const isRevoked = currentStatus === 'REVOKED';
  const isExpired = currentStatus === 'EXPIRED';
  const isClockTamper = currentStatus === 'CLOCK_TAMPER';

  let iconGradient = 'from-[#14B8A6] to-[#10B981]';
  let IconComponent = ShieldCheck;
  if (isRevoked || isClockTamper) {
    iconGradient = 'from-rose-500 to-red-600';
    IconComponent = ShieldAlert;
  } else if (isExpired) {
    iconGradient = 'from-amber-500 to-orange-600';
    IconComponent = Clock;
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0B1220] flex items-center justify-center p-4 select-none font-cairo overflow-y-auto">
      
      {/* Central Luxury Container (Exact 600px width) */}
      <div className="w-full max-w-[600px] bg-[#111A2B] border border-[#23324D] rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        
        {/* ======================================================== */}
        {/* HEADER: 80x80 Gradient Shield Icon & Title               */}
        {/* ======================================================== */}
        <div className="pt-8 pb-6 px-6 bg-gradient-to-b from-[#17233A] to-[#111A2B] border-b border-[#23324D] text-center flex flex-col items-center">
          
          {/* 80x80 Icon Square with Dynamic Gradient */}
          <div className={`w-20 h-20 rounded-3xl bg-gradient-to-br ${iconGradient} flex items-center justify-center text-slate-950 shadow-glow-teal mb-3.5 transform hover:scale-105 transition-transform duration-200`}>
            <IconComponent className="w-11 h-11 text-slate-950 stroke-[2.2]" />
          </div>

          {/* Main Title */}
          <h1 className="text-3xl font-black text-white tracking-tight mb-1">
            صيدليتي
          </h1>

          {/* Subtitle */}
          <p className="text-sm font-semibold text-slate-400">
            تفعيل ترخيص البرنامج لهذا الجهاز
          </p>
        </div>

        {/* ======================================================== */}
        {/* BODY: Warning Alert, Machine ID, WhatsApp & Activation    */}
        {/* ======================================================== */}
        <div className="p-6 sm:p-7 space-y-5">
          
          {/* Dynamic Security Alert Banner based on 4 States */}
          {isRevoked ? (
            <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/40 flex items-start gap-3 shadow-lg shadow-rose-950/30">
              <AlertOctagon className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <p className="text-xs font-bold text-rose-200 leading-relaxed text-right">
                🔴 تم إيقاف أو إلغاء ترخيص هذا الجهاز من قبل المطور (م/ عبد الله جميل). يرجى التواصل لتسوية الحساب وإعادة تفعيل النظام.
              </p>
            </div>
          ) : isExpired ? (
            <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-start gap-3 shadow-lg shadow-amber-950/30">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs font-bold text-amber-200 leading-relaxed text-right">
                🟠 انتهت مدة اشتراك وترخيص هذا الجهاز بتاريخ ({expiresDate || new Date().toISOString().slice(0, 10)}). يرجى التجديد مع المطور للمتابعة.
              </p>
            </div>
          ) : isClockTamper ? (
            <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/40 flex items-start gap-3 shadow-lg shadow-rose-950/30">
              <AlertOctagon className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <p className="text-xs font-bold text-rose-200 leading-relaxed text-right">
                ⛔ تنبيه أمني: تم اكتشاف تلاعب أو تقديم/تأخير في وقت وتاريخ الجهاز لتخطي الترخيص!
              </p>
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-amber-200 leading-relaxed text-right">
                ⚠️ البرنامج يحتاج إلى تفعيل ليعمل على هذا الجهاز. أرسل كود الجهاز للمطور للحصول على كود التفعيل.
              </p>
            </div>
          )}

          {/* 2. Machine Code Box */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-300 text-right">
              كود هذا الجهاز (Machine Code):
            </label>

            <div className="flex items-center gap-2">
              {/* Dark Monospace Box */}
              <div
                className="flex-1 bg-[#0B1220] border border-[#23324D] py-3 px-4 rounded-xl font-mono font-black text-lg text-teal-300 text-center tracking-widest select-all shadow-inner"
                dir="ltr"
              >
                {machineId}
              </div>

              {/* Copy Code Outlined Button */}
              <button
                type="button"
                onClick={handleCopyCode}
                className={`px-4 py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 border ${
                  copiedCode
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500 shadow-md'
                    : 'bg-[#17233A] hover:bg-[#202E4C] text-teal-300 border-teal-500/40 hover:border-teal-400'
                }`}
              >
                {copiedCode ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-300">✓ تم النسخ</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-teal-400" />
                    <span>نسخ الكود</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 3. Big WhatsApp Green Button (h-12 / 48px) */}
          <div>
            <button
              type="button"
              onClick={handleWhatsAppContact}
              className="w-full h-12 rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] active:scale-[0.99] text-white font-black text-sm flex items-center justify-center gap-2.5 shadow-lg shadow-[#25D366]/20 transition-all cursor-pointer"
            >
              <MessageCircle className="w-5 h-5 fill-white text-white" />
              <span>💬 طلب كود التفعيل عبر واتساب (م/ عبد الله جميل - 01201395243)</span>
            </button>
            <p className="text-[11px] text-slate-400 mt-2 text-center">
              💡 سيتم نسخ كود الجهاز تلقائياً وفتح محادثة واتساب مع المطور لتفعيل النظام فوراً.
            </p>
          </div>

            {/* Form: Activation Key Input & Submit */}
            <form onSubmit={handleActivate} className="space-y-4 pt-1">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-300 text-right">
                    رمز الترخيص الرسمي (License Token):
                  </label>
                  <button
                    type="button"
                    onClick={handlePasteKey}
                    className="px-2.5 py-1 rounded-lg bg-[#17233A] hover:bg-[#23324D] text-slate-300 hover:text-teal-300 text-[11px] font-bold border border-[#23324D] flex items-center gap-1 transition-all"
                    title="لصق من الحافظة"
                  >
                    <ClipboardPaste className="w-3.5 h-3.5" />
                    <span>لصق الرمز 📋</span>
                  </button>
                </div>

                <div className="relative">
                  <textarea
                    rows={4}
                    value={licenseKeyInput}
                    onChange={(e) => {
                      setLicenseKeyInput(e.target.value.trim());
                      setErrorMsg('');
                      setSuccessMsg('');
                      setIsSuccess(false);
                    }}
                    placeholder="الصق رمز الترخيص الرقمي الكامل هنا (يبدأ بـ LIC2.)..."
                    className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl p-3 text-xs text-teal-300 font-mono font-medium leading-relaxed placeholder:text-slate-600 placeholder:font-sans focus:outline-none focus:ring-1 focus:ring-teal-400 transition-all resize-none"
                    dir="ltr"
                    autoFocus
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span>يدعم رموز: ترخيص دائم / مدة محددة / استعادة PIN / إلغاء ترخيص</span>
                  {licenseKeyInput.startsWith('LIC2.') && (
                    <span className="text-teal-400 font-bold">✓ تنسيق LIC2 رقمي معتمد</span>
                  )}
                </div>
              </div>

              {/* Error Message */}
              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold text-center animate-shake">
                  {errorMsg}
                </div>
              )}

              {/* Success Message */}
              {successMsg && (
                <div className="p-3.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold text-center flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Submit Activation Button */}
              <button
                type="submit"
                disabled={isSubmitting || isSuccess}
                className={`w-full py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-xl transition-all ${
                  isSuccess
                    ? 'bg-emerald-500 text-slate-950 shadow-emerald-500/20'
                    : 'bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 active:scale-[0.99] text-slate-950 shadow-teal-500/20 cursor-pointer'
                } disabled:opacity-50`}
              >
                <Sparkles className="w-4 h-4" />
                <span>{isSubmitting ? 'جارٍ التحقق الرقمي...' : '🚀 تفعيل البرنامج الآن'}</span>
              </button>
            </form>

        </div>

        {/* ======================================================== */}
        {/* FOOTER: Developer & System Credit                        */}
        {/* ======================================================== */}
        <div className="py-4 px-6 bg-[#0B1220]/90 border-t border-[#23324D] text-center">
          <p className="text-[11px] text-slate-400 font-medium">
            نظام إدارة الصيدليات ونقاط البيع | تطوير: م/ عبد الله جميل — 01201395243
          </p>
        </div>

      </div>

    </div>
  );
}
