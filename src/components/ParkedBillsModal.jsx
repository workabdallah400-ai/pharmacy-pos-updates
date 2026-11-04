import React from 'react';
import { X, PauseCircle, PlayCircle, Trash2, Clock, AlertCircle } from 'lucide-react';

export function ParkedBillsModal({ isOpen, onClose, parkedBills, onResumeBill, onDeleteBill }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-lg bg-[#111A2B] border border-[#23324D] rounded-3xl shadow-card-dark overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#23324D] flex items-center justify-between bg-[#17233A]/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300">
              <PauseCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">الفواتير المعلقة (Parked Carts)</h3>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                  F3
                </span>
              </div>
              <p className="text-xs text-slate-400">الفواتير المحفوظة مؤقتاً لخدمة عملاء آخرين</p>
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
          {parkedBills.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <AlertCircle className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="font-semibold text-sm">لا توجد فواتير معلقة حالياً.</p>
              <p className="text-xs text-slate-500 mt-1">يمكنك تعليق أي فاتورة جارية بالضغط على F2.</p>
            </div>
          ) : (
            parkedBills.map((bill, index) => (
              <div
                key={bill.id}
                className="p-3.5 rounded-2xl bg-[#17233A] border border-[#23324D] flex items-center justify-between hover:border-amber-500/40 transition-all"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">فاتورة #{bill.id}</span>
                    <span className="text-xs text-slate-400">({bill.items.length} أصناف)</span>
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-1">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span>{bill.time}</span>
                    <span>•</span>
                    <span className="text-teal-300 font-bold">{bill.total.toFixed(2)} EGP</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onResumeBill(bill);
                      onClose();
                    }}
                    className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-bold border border-amber-500/30 flex items-center gap-1.5 transition-colors"
                  >
                    <PlayCircle className="w-3.5 h-3.5" />
                    <span>استدعاء للسلة</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteBill(bill.id)}
                    className="w-8 h-8 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 flex items-center justify-center transition-colors"
                    title="حذف"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#23324D] bg-[#0E1524] flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-[#17233A] hover:bg-[#202E4C] text-white text-xs font-semibold border border-[#23324D]"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
}
