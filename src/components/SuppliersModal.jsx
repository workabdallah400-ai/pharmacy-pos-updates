import React, { useState } from 'react';
import { X, Building2, Phone, User, MapPin, DollarSign, CheckCircle2, Search, ArrowUpRight } from 'lucide-react';

export function SuppliersModal({ isOpen, onClose, suppliers, onPaySupplier }) {
  const [search, setSearch] = useState('');
  const [payingSupplier, setPayingSupplier] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');

  if (!isOpen) return null;

  const filtered = suppliers.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      String(s.name || '').toLowerCase().includes(q) ||
      String(s.contact_person || '').toLowerCase().includes(q) ||
      String(s.phone || '').toLowerCase().includes(q) ||
      String(s.hotline || '').toLowerCase().includes(q) ||
      String(s.notes || '').toLowerCase().includes(q)
    );
  });

  const handleConfirmPayment = (e) => {
    e.preventDefault();
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0 || !payingSupplier) return;

    onPaySupplier(payingSupplier.id, amount);
    setPayingSupplier(null);
    setPaymentAmount('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-3xl bg-[#111A2B] border border-[#23324D] rounded-3xl shadow-card-dark overflow-hidden flex flex-col max-h-[88vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#23324D] flex items-center justify-between bg-[#17233A]/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-300 shadow-glow-teal">
              <Building2 className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">دليل شركات التوزيع والموردين</h3>
              <p className="text-xs text-slate-400">أرقام هواتف مندوبي الشركات ومتابعة المديونيات الآجلة</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[#17233A] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-[#23324D] flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="p-3.5 border-b border-[#23324D] bg-[#141E30]">
          <div className="relative">
            <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-teal-400" />
            <input
              type="text"
              placeholder="ابحث باسم شركة التوزيع، كود المورد، أو اسم المندوب..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 bg-[#17233A] border border-[#23324D] focus:border-teal-400 rounded-xl pr-10 pl-3 text-white text-xs outline-none"
            />
          </div>
        </div>

        {/* Content Cards */}
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((sup) => (
            <div
              key={sup.id}
              className="p-4 rounded-2xl bg-[#17233A] border border-[#23324D] hover:border-teal-500/40 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h4 className="font-bold text-white text-sm">{sup.name}</h4>
                    <span className="text-[10px] text-teal-400 font-mono font-semibold">كود: {sup.id}</span>
                  </div>
                  <span className="text-[11px] font-mono font-bold bg-[#111A2B] text-slate-300 border border-[#23324D] px-2 py-0.5 rounded-lg">
                    الخط الساخن: {sup.hotline || '-'}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-300 mb-3">
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span>المندوب: <strong className="text-white">{sup.contact_person || 'مسؤول التوريد'}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-teal-400" />
                    <span className="font-mono text-teal-300" dir="ltr">{sup.phone || '-'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <MapPin className="w-3.5 h-3.5 text-slate-500" />
                    <span>{sup.notes || 'موزع معتمد'}</span>
                  </div>
                </div>
              </div>

              {/* Financial Balance & Payment */}
              <div className="pt-2.5 border-t border-[#23324D] flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 block">المديونية المستحقة للشركة:</span>
                  <span className={`font-mono font-extrabold text-sm ${sup.balance > 0 ? 'text-amber-400' : 'text-emerald-400'}`} dir="ltr">
                    {Number(sup.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {sup.balance > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setPayingSupplier(sup);
                      setPaymentAmount(sup.balance.toString());
                    }}
                    className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-bold border border-amber-500/30 flex items-center gap-1 transition-colors"
                  >
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>سداد دفعة</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#23324D] bg-[#0E1524] flex items-center justify-between text-xs text-slate-400">
          <span>يمكنك الضغط على الخط الساخن أو رقم المندوب للتواصل المباشر مع شركات الأدوية.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-[#17233A] hover:bg-[#202E4C] text-white text-xs font-semibold border border-[#23324D]"
          >
            إغلاق
          </button>
        </div>

      </div>

      {/* Pay Supplier Modal Overlay */}
      {payingSupplier && (
        <div className="fixed inset-0 z-60 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmPayment}
            className="w-full max-w-sm bg-[#111A2B] border border-[#23324D] rounded-2xl p-5 shadow-2xl space-y-4"
          >
            <div className="flex justify-between items-center border-b border-[#23324D] pb-3">
              <h4 className="font-bold text-white text-sm">سداد دفعة لشركة [{payingSupplier.name}]</h4>
              <button
                type="button"
                onClick={() => setPayingSupplier(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                المبلغ المسدد (ج.م) *
              </label>
              <input
                type="number"
                step="0.5"
                required
                autoFocus
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="w-full h-11 bg-[#17233A] border border-[#23324D] focus:border-amber-400 rounded-xl px-3 text-amber-300 font-mono font-bold text-base outline-none"
                dir="ltr"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPayingSupplier(null)}
                className="flex-1 py-2 rounded-xl bg-[#17233A] hover:bg-[#202E4C] text-slate-300 text-xs font-semibold border border-[#23324D]"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1 shadow-sm transition-all"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>تأكيد السداد</span>
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
