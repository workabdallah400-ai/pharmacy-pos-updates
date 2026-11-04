import React from 'react';
import { X, Printer, CheckCircle2, Receipt } from 'lucide-react';

export function ReceiptModal({ isOpen, onClose, invoice, pharmacyName = 'صيدلية النخبة الحديثة', cashierName = 'د. أحمد' }) {
  if (!isOpen || !invoice) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-md bg-[#111A2B] border border-[#23324D] rounded-3xl shadow-card-dark overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 border-b border-[#23324D] flex items-center justify-between bg-[#17233A]/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">تم إتمام الفاتورة بنجاح</h3>
              <p className="text-[11px] text-slate-400">رقم الفاتورة: {invoice.invoiceNumber}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[#17233A] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-[#23324D] flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Paper Thermal Receipt Container */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-900/60 flex justify-center">
          <div className="w-full max-w-xs bg-white text-slate-950 p-4 rounded-xl shadow-lg font-mono text-xs leading-relaxed text-right border border-slate-200">
            
            {/* Pharmacy Branding Header */}
            <div className="text-center pb-3 border-b border-dashed border-slate-300">
              <div className="text-base font-black text-slate-900">{pharmacyName}</div>
              <div className="text-[11px] text-slate-600 mt-0.5">فرع وسط البلد • دليفري: 01012345678</div>
              <div className="text-[10px] text-slate-500 mt-1">فاتورة بيع ضريبية مبسطة</div>
            </div>

            {/* Invoice Meta */}
            <div className="py-2.5 border-b border-dashed border-slate-300 text-[11px] space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-600">رقم الفاتورة:</span>
                <span className="font-bold">{invoice.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">التاريخ والوقت:</span>
                <span>{new Date().toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">الكاشير:</span>
                <span className="font-bold">{cashierName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">العميل:</span>
                <span>{invoice.customerName || 'عميل نقدي'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">طريقة الدفع:</span>
                <span className="font-bold text-emerald-700">{invoice.paymentMethod}</span>
              </div>
            </div>

            {/* Items Table */}
            <div className="py-2.5 border-b border-dashed border-slate-300">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600 font-bold">
                    <th className="text-right pb-1">الصنف</th>
                    <th className="text-center pb-1">الكمية</th>
                    <th className="text-left pb-1">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoice.items.map((item, idx) => (
                    <tr key={idx} className="py-1">
                      <td className="pt-1.5 font-bold">
                        <div>{item.trade_name_ar || item.trade_name}</div>
                        <div className="text-[9px] text-slate-500 font-normal">
                          {item.unitType === 'strip' ? 'شريط' : 'علبة'} @ {item.unitPrice.toFixed(2)}
                        </div>
                      </td>
                      <td className="text-center font-bold">{item.quantity}</td>
                      <td className="text-left font-bold" dir="ltr">{(item.unitPrice * item.quantity).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Financial Summary */}
            <div className="py-2.5 border-b border-dashed border-slate-300 space-y-1 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>المجموع الفرعي:</span>
                <span dir="ltr">{invoice.subtotal.toFixed(2)} EGP</span>
              </div>
              {invoice.discount > 0 && (
                <div className="flex justify-between text-rose-600">
                  <span>الخصم:</span>
                  <span dir="ltr">-{invoice.discount.toFixed(2)} EGP</span>
                </div>
              )}
              <div className="flex justify-between font-black text-sm text-slate-900 pt-1 border-t border-slate-200">
                <span>الصافي المطلوب:</span>
                <span dir="ltr" className="text-emerald-700">{invoice.total.toFixed(2)} EGP</span>
              </div>
              <div className="flex justify-between text-slate-600 pt-1">
                <span>المدفوع:</span>
                <span dir="ltr">{(invoice.paidAmount || invoice.total).toFixed(2)} EGP</span>
              </div>
              {invoice.changeAmount > 0 && (
                <div className="flex justify-between font-bold text-slate-800">
                  <span>الباقي للعميل:</span>
                  <span dir="ltr">{invoice.changeAmount.toFixed(2)} EGP</span>
                </div>
              )}
            </div>

            {/* Footer Greeting */}
            <div className="text-center pt-3 text-[10px] text-slate-600 space-y-1">
              <div>نتمنى لكم الشفاء العاجل دائمًا 💚</div>
              <div className="text-[9px] text-slate-500">البضاعة المباعة ترد وتستبدل بالفاتورة خلال 14 يومًا</div>
              <div className="font-bold text-[8px] tracking-widest text-slate-400 pt-1">* EGYPT PHARMACY POS *</div>
            </div>

          </div>
        </div>

        {/* Modal Actions */}
        <div className="p-4 border-t border-[#23324D] bg-[#111A2B] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-[#17233A] hover:bg-[#202E4C] text-white text-xs font-bold border border-[#23324D] transition-colors"
          >
            إغلاق ومتابعة البيع (Esc)
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 active:scale-95 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-glow-teal transition-all"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة الفاتورة (Enter)</span>
          </button>
        </div>

      </div>
    </div>
  );
}
