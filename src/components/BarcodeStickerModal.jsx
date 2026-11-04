import React from 'react';
import { X, Printer, Barcode, CheckCircle2 } from 'lucide-react';

export function BarcodeStickerModal({ isOpen, onClose, medicine, pharmacyName = 'صيدلية النخبة الحديثة' }) {
  if (!isOpen || !medicine) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-sm bg-[#111A2B] border border-[#23324D] rounded-3xl shadow-card-dark overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 border-b border-[#23324D] flex items-center justify-between bg-[#17233A]/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400">
              <Barcode className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">استيكر الباركود اللاصق</h3>
              <p className="text-[10px] text-slate-400">مقاس قياسي 38x25mm لطابعات الباركود</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-xl bg-[#17233A] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-[#23324D] flex items-center justify-center transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Sticker Preview Box */}
        <div className="p-6 bg-slate-900/60 flex flex-col items-center justify-center">
          <div className="w-64 bg-white text-slate-950 p-3 rounded-xl shadow-lg border border-slate-300 text-center font-mono">
            {/* Pharmacy Name */}
            <div className="text-[10px] font-bold text-slate-700 tracking-tight mb-1 truncate">
              {pharmacyName}
            </div>

            {/* Medicine Name */}
            <div className="font-black text-xs text-slate-900 leading-tight truncate">
              {medicine.trade_name_ar}
            </div>
            <div className="text-[9px] text-slate-500 truncate mb-1">
              {medicine.trade_name}
            </div>

            {/* Simulated Barcode */}
            <div className="py-1 my-1 border-y border-dashed border-slate-200 flex flex-col items-center">
              <div className="flex items-center justify-center gap-0.5 h-10 w-full px-2">
                {[3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3, 2, 4, 1, 3, 1, 2, 4, 2, 1, 3, 2, 1].map((w, idx) => (
                  <div
                    key={idx}
                    className="h-full bg-slate-950"
                    style={{ width: `${w * 1.5}px` }}
                  ></div>
                ))}
              </div>
              <div className="text-[10px] font-bold tracking-widest text-slate-800 mt-0.5">
                {medicine.barcode}
              </div>
            </div>

            {/* Price & Shelf */}
            <div className="flex justify-between items-center text-[10px] font-black pt-1">
              <span className="text-slate-600 font-sans">الرف: {medicine.shelf}</span>
              <span className="text-emerald-700 font-sans font-bold text-xs" dir="ltr">
                {medicine.price_box.toFixed(2)} EGP
              </span>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="p-4 border-t border-[#23324D] bg-[#111A2B] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-xl bg-[#17233A] hover:bg-[#202E4C] text-white text-xs font-semibold border border-[#23324D]"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-glow-teal transition-all active:scale-95"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>طباعة الاستيكر</span>
          </button>
        </div>

      </div>
    </div>
  );
}
