import React, { useEffect, useState } from 'react';
import { X, Printer, Truck, CheckCircle2, Calendar, FileText } from 'lucide-react';
import { sqliteService } from '../db/sqliteService';

export function PurchaseDetailsModal({ isOpen, onClose, invoice }) {
  const [items, setItems] = useState(invoice?.items || []);

  useEffect(() => {
    let cancelled = false;
    if (!isOpen || !invoice) return;

    if (invoice.items && invoice.items.length > 0) {
      setItems(invoice.items);
      return;
    }

    setItems([]);
    sqliteService.getPurchaseItems(invoice.invoice_id || invoice.id)
      .then((rows) => {
        if (!cancelled) setItems(rows || []);
      })
      .catch((e) => {
        console.warn('Failed to load purchase items:', e);
        if (!cancelled) setItems([]);
      });

    return () => { cancelled = true; };
  }, [isOpen, invoice]);

  if (!isOpen || !invoice) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-2xl bg-[#111A2B] border border-[#23324D] rounded-3xl shadow-card-dark overflow-hidden flex flex-col max-h-[88vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#23324D] flex items-center justify-between bg-[#17233A]/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-300">
              <FileText className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base">فاتورة توريد: {invoice.invoice_code}</h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  invoice.payment_method === 'نقدي'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                }`}>
                  {invoice.payment_method}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                شركة التوزيع: <strong className="text-white">{invoice.supplier_name}</strong> • رقم فاتورة الشركة: <span className="font-mono text-teal-300">{invoice.supplier_invoice_no}</span>
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

        {/* Invoice Summary Badges */}
        <div className="grid grid-cols-4 gap-2.5 p-3.5 bg-[#141E30] border-b border-[#23324D] text-xs">
          <div className="bg-[#111A2B] p-2 rounded-xl border border-[#23324D]">
            <span className="text-[10px] text-slate-400 block">تاريخ الاستلام:</span>
            <span className="font-mono font-bold text-white">{String(invoice.date || invoice.date_time || '').slice(0, 10) || '-'}</span>
          </div>
          <div className="bg-[#111A2B] p-2 rounded-xl border border-[#23324D]">
            <span className="text-[10px] text-slate-400 block">إجمالي الجمهور:</span>
            <span className="font-mono font-bold text-white" dir="ltr">{Number(invoice.total_retail || 0).toFixed(2)} EGP</span>
          </div>
          <div className="bg-[#111A2B] p-2 rounded-xl border border-[#23324D]">
            <span className="text-[10px] text-slate-400 block">إجمالي الخصم:</span>
            <span className="font-mono font-bold text-rose-300" dir="ltr">-{Number(invoice.total_discount || 0).toFixed(2)} EGP</span>
          </div>
          <div className="bg-[#111A2B] p-2 rounded-xl border border-teal-500/40">
            <span className="text-[10px] text-teal-400 font-bold block">الصافي المطلوب:</span>
            <span className="font-mono font-extrabold text-emerald-400" dir="ltr">{Number(invoice.net_total || 0).toFixed(2)} EGP</span>
          </div>
        </div>

        {/* Items Table */}
        <div className="flex-1 overflow-y-auto p-4">
          <table className="w-full text-right text-xs">
            <thead className="bg-[#141E30] text-slate-300 border-b border-[#23324D] font-bold">
              <tr>
                <th className="p-2.5">الصنف</th>
                <th className="p-2.5 text-center">الكمية</th>
                <th className="p-2.5 text-center">البونص</th>
                <th className="p-2.5 text-left">سعر الجمهور</th>
                <th className="p-2.5 text-center">الخصم %</th>
                <th className="p-2.5 text-left">صافي التكلفة</th>
                <th className="p-2.5 text-left">إجمالي البند</th>
                <th className="p-2.5 text-center">التشغيلة / الصلاحية</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#23324D]/60 font-medium">
              {items.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center py-8 text-slate-400 text-xs">
                    لا توجد بنود مسجلة لهذه الفاتورة.
                  </td>
                </tr>
              ) : items.map((it, idx) => (
                <tr key={idx} className="hover:bg-[#17233A]/60">
                  <td className="p-2.5">
                    <div className="font-bold text-white">{it.trade_name_ar}</div>
                    <div className="text-[10px] text-slate-400">{it.trade_name}</div>
                  </td>
                  <td className="p-2.5 text-center font-mono font-bold text-teal-300">{it.quantity}</td>
                  <td className="p-2.5 text-center font-mono font-bold text-emerald-400">+{it.bonus || 0}</td>
                  <td className="p-2.5 text-left font-mono" dir="ltr">{Number(it.price_box || 0).toFixed(2)}</td>
                  <td className="p-2.5 text-center font-mono font-bold text-amber-300">{it.discount_pct || 0}%</td>
                  <td className="p-2.5 text-left font-mono font-bold text-teal-300" dir="ltr">{Number(it.net_box_price || 0).toFixed(2)}</td>
                  <td className="p-2.5 text-left font-mono font-bold text-white" dir="ltr">{Number(it.total_net || 0).toFixed(2)}</td>
                  <td className="p-2.5 text-center font-mono text-[10px] text-slate-400">
                    <div>{it.batch_no || '-'}</div>
                    <div className="text-teal-400 font-bold">{it.expiry || '-'}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[#23324D] bg-[#111A2B] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#17233A] hover:bg-[#202E4C] text-white text-xs font-semibold border border-[#23324D]"
          >
            إغلاق
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-glow-teal transition-all active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة تقرير الفاتورة</span>
          </button>
        </div>

      </div>
    </div>
  );
}
