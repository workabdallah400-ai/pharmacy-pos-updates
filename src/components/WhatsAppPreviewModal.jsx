import React, { useState } from 'react';
import { X, Copy, Check, ExternalLink, MessageSquare, Send, Phone, Sparkles } from 'lucide-react';

export function WhatsAppPreviewModal({ isOpen, onClose, messageText, supplierName, repPhone = '' }) {
  const [copied, setCopied] = useState(false);
  const [targetPhone, setTargetPhone] = useState(repPhone);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(messageText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSendWhatsApp = () => {
    // Format phone number: remove non-digits
    const cleanPhone = targetPhone.replace(/\D/g, '');
    let url = '';
    const encodedText = encodeURIComponent(messageText);
    
    if (cleanPhone) {
      // Add Egyptian 20 prefix if starting with 01
      const formatted = cleanPhone.startsWith('01') ? `2${cleanPhone}` : cleanPhone;
      url = `https://wa.me/${formatted}?text=${encodedText}`;
    } else {
      url = `https://wa.me/?text=${encodedText}`;
    }
    
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl w-full max-w-xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#23324D] bg-[#17233A]/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                إرسال طلبية النواقص عبر واتساب
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
                  {supplierName || 'مندوب التوزيع'}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                رسالة منسقة وجاهزة للإرسال الفوري لمندوب شركة التوزيع
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#23324D] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          
          {/* Target Rep Phone Input */}
          <div className="flex items-center gap-3 bg-[#0B1220] p-3 rounded-xl border border-[#23324D]">
            <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center shrink-0">
              <Phone className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-bold text-slate-400 mb-0.5">
                رقم واتساب المندوب (اختياري - لفتح شاته مباشرة)
              </label>
              <input
                type="text"
                value={targetPhone}
                onChange={(e) => setTargetPhone(e.target.value)}
                placeholder="مثال: 01012345678 أو اتركه فارغاً لاختيار المحادثة"
                className="w-full bg-transparent text-xs text-white placeholder-slate-600 focus:outline-none"
              />
            </div>
          </div>

          {/* WhatsApp Chat Preview Bubble */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-slate-300">معاينة نص الرسالة:</span>
              <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
                <Sparkles className="w-3 h-3" />
                تنسيق تلقائي مع بولد وعلامات
              </span>
            </div>
            <div className="bg-[#0b141a] border border-[#202c33] rounded-2xl p-4 text-xs font-mono text-emerald-100 whitespace-pre-wrap leading-relaxed shadow-inner max-h-72 overflow-y-auto select-all">
              {messageText}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#23324D] bg-[#17233A]/40">
          <button
            type="button"
            onClick={handleCopy}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
              copied
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-500/20'
                : 'bg-[#17233A] text-slate-200 border-[#23324D] hover:bg-[#23324D] hover:text-white'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-200" />
                <span>تم النسخ للحافظة بنجاح!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>نسخ الرسالة للحافظة</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-[#23324D] transition-colors"
            >
              إغلاق
            </button>
            <button
              type="button"
              onClick={handleSendWhatsApp}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition-all"
            >
              <Send className="w-4 h-4" />
              <span>إرسال عبر واتساب الآن</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
