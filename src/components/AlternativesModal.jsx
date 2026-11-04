import React from 'react';
import { X, Dna, PackageCheck, AlertCircle, ShoppingCart, CheckCircle2 } from 'lucide-react';

export function AlternativesModal({ isOpen, onClose, medicine, allMedicines, onSelectAlternative }) {
  if (!isOpen) return null;

  // Find alternatives sharing active ingredient (or same category if no exact generic match)
  const genericToMatch = medicine?.generic_name ? medicine.generic_name.split('+')[0].trim().toLowerCase() : '';
  
  const alternatives = allMedicines
    .filter((m) => {
      if (m.id === medicine?.id) return false;
      const mGeneric = m.generic_name?.toLowerCase() || '';
      return mGeneric.includes(genericToMatch) || (medicine?.category && m.category === medicine.category);
    })
    .sort((a, b) => {
      // Prioritize available in stock
      const stockA = a.stock_boxes > 0 ? 1 : 0;
      const stockB = b.stock_boxes > 0 ? 1 : 0;
      return stockB - stockA;
    });

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-2xl bg-[#111A2B] border border-[#23324D] rounded-3xl shadow-card-dark overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#23324D] flex items-center justify-between bg-[#17233A]/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-300 shadow-glow-teal">
              <Dna className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white">دليل البدائل والمثائل الذكي</h3>
                <span className="text-[10px] bg-teal-500/20 text-teal-300 border border-teal-500/30 px-2 py-0.5 rounded-full font-bold">
                  F6
                </span>
              </div>
              <p className="text-xs text-slate-400">
                بدائل للصنف: <span className="text-teal-300 font-semibold">{medicine?.trade_name_ar || medicine?.trade_name}</span> ({medicine?.generic_name})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[#17233A] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-[#23324D] flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {alternatives.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <AlertCircle className="w-12 h-12 text-amber-400/50 mx-auto mb-2" />
              <p className="font-semibold text-sm">لا توجد بدائل مباشرة مطابقة مسجلة لهذا الصنف حالياً.</p>
              <p className="text-xs text-slate-500 mt-1">تأكد من مطابقة الاسم العلمي في دليل الأدوية.</p>
            </div>
          ) : (
            alternatives.map((alt) => {
              const inStock = alt.stock_boxes > 0 || alt.stock_strips > 0;
              return (
                <div
                  key={alt.id}
                  className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between ${
                    inStock
                      ? 'bg-[#17233A] border-[#23324D] hover:border-teal-500/50 hover:bg-[#1A2844]'
                      : 'bg-[#141E30]/60 border-[#23324D]/40 opacity-75'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center border font-bold text-xs ${
                        inStock
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                          : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                      }`}
                    >
                      {inStock ? 'متوفر' : 'ناقص'}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-white flex items-center gap-2">
                        <span>{alt.trade_name_ar}</span>
                        <span className="text-xs text-slate-400 font-normal">({alt.trade_name})</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {alt.generic_name} • الرف: <span className="font-mono text-teal-300 font-bold">{alt.shelf}</span>
                      </div>
                      <div className="text-xs font-semibold mt-1">
                        الرصيد: <span className={inStock ? 'text-emerald-400' : 'text-rose-400'}>{alt.stock_boxes} علبة</span> ({alt.stock_strips} شريط)
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-left">
                      <div className="text-base font-extrabold text-teal-300 font-mono" dir="ltr">
                        {alt.price_box.toFixed(2)} EGP
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono" dir="ltr">
                        الشريط: {alt.price_strip.toFixed(2)} EGP
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!inStock}
                      onClick={() => {
                        onSelectAlternative(alt);
                        onClose();
                      }}
                      className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                        inStock
                          ? 'bg-teal-500 hover:bg-teal-400 active:scale-95 text-slate-950 shadow-glow-teal'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                      <span>اختيار البديل</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#23324D] bg-[#0E1524] flex items-center justify-between text-xs text-slate-400">
          <span>يتم فرز البدائل تلقائياً بتقديم الأصناف المتوفرة أولاً لمنع ضياع أي عميل.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-[#17233A] hover:bg-[#202E4C] text-white text-xs font-semibold border border-[#23324D]"
          >
            إغلاق (Esc)
          </button>
        </div>

      </div>
    </div>
  );
}
