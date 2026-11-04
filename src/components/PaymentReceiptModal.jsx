import React, { useState } from 'react';
import { X, DollarSign, Printer, CheckCircle2, AlertCircle, CreditCard, Wallet, Smartphone, Sparkles } from 'lucide-react';
import { playCashDrawerSound } from '../utils/sound';

export function PaymentReceiptModal({
  isOpen,
  onClose,
  customer,
  onCollectPayment,
  pharmacyName = 'صيدلية النخبة الحديثة'
}) {
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('كاش');
  const [notes, setNotes] = useState('');
  const [showThermalPreview, setShowThermalPreview] = useState(false);
  const [createdReceipt, setCreatedReceipt] = useState(null);
  const [error, setError] = useState('');

  if (!isOpen || !customer) return null;

  const currentDebt = customer.balance || 0;
  const parsedAmount = parseFloat(amount) || 0;
  const remainingAfterPayment = Math.max(0, currentDebt - parsedAmount);

  const handleQuickAmount = (val) => {
    setAmount(String(val));
    setError('');
  };

  const handleConfirmPayment = (e) => {
    e.preventDefault();
    if (!parsedAmount || parsedAmount <= 0) {
      setError('يرجى إدخال مبلغ صحيح للتحصيل');
      return;
    }
    if (parsedAmount > currentDebt && currentDebt > 0) {
      const confirmOverpay = window.confirm(
        `المبلغ المدخل (${parsedAmount} ج.م) أكبر من إجمالي المديونية (${currentDebt} ج.م)، هل تريد المتابعة وقيد الرصيد المتبقي كرصيد دائن لصالح العميل؟`
      );
      if (!confirmOverpay) return;
    }

    const receiptNo = `REC-${Math.floor(10000 + Math.random() * 90000)}`;
    const dateStr = new Date().toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    const timeStr = new Date().toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const receiptData = {
      receiptNo,
      dateStr,
      timeStr,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      previousBalance: currentDebt,
      amountPaid: parsedAmount,
      remainingBalance: remainingAfterPayment,
      paymentMethod,
      notes: notes.trim()
    };

    setCreatedReceipt(receiptData);
    setShowThermalPreview(true);

    // Play cash drawer sound
    playCashDrawerSound();

    // Trigger update in master customer list
    onCollectPayment(customer.id, parsedAmount, receiptData);
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn font-cairo">
      <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden max-h-[92vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#23324D] bg-[#17233A]/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                سداد دفعة نقدية وسند قبض
              </h3>
              <p className="text-xs text-slate-400">
                العميل: <span className="text-white font-bold">{customer.name}</span>
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

        {/* Content Body */}
        {!showThermalPreview ? (
          <form onSubmit={handleConfirmPayment} className="p-6 space-y-4 overflow-y-auto">
            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Current Debt Banner */}
            <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-400 block mb-0.5">المديونية الحالية المستحقة:</span>
                <span className="text-2xl font-black text-amber-400 font-mono">
                  {currentDebt.toFixed(2)} <span className="text-xs font-bold font-cairo">ج.م</span>
                </span>
              </div>
              <div className="text-left">
                <span className="text-[11px] text-slate-400 block mb-0.5">سقف الائتمان:</span>
                <span className="text-xs font-bold text-slate-300 font-mono">
                  {customer.credit_limit} ج.م
                </span>
              </div>
            </div>

            {/* Amount Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                المبلغ المراد تحصيله وتوريده للدرج <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  required
                  autoFocus
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setError('');
                  }}
                  placeholder="0.00"
                  className="w-full bg-[#0B1220] border border-[#23324D] focus:border-emerald-400 rounded-xl pl-14 pr-4 py-3 text-xl font-mono font-bold text-emerald-400 placeholder-slate-600 focus:outline-none"
                />
                <span className="absolute left-4 top-3.5 text-xs font-bold text-slate-400">ج.م</span>
              </div>
            </div>

            {/* Quick Amount Chips */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-slate-400 font-bold">مبالغ سريعة:</span>
              {currentDebt > 0 && (
                <button
                  type="button"
                  onClick={() => handleQuickAmount(currentDebt)}
                  className="px-2.5 py-1 rounded-lg bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/30 text-teal-300 text-xs font-bold transition-all"
                >
                  كامل المبلغ ({currentDebt} ج.م)
                </button>
              )}
              {currentDebt > 100 && (
                <button
                  type="button"
                  onClick={() => handleQuickAmount(Math.round(currentDebt / 2))}
                  className="px-2.5 py-1 rounded-lg bg-[#17233A] hover:bg-[#23324D] border border-[#23324D] text-slate-300 text-xs font-bold transition-all"
                >
                  نصف الحساب ({Math.round(currentDebt / 2)} ج.م)
                </button>
              )}
              <button
                type="button"
                onClick={() => handleQuickAmount(500)}
                className="px-2.5 py-1 rounded-lg bg-[#17233A] hover:bg-[#23324D] border border-[#23324D] text-slate-300 text-xs font-bold transition-all"
              >
                500 ج.م
              </button>
              <button
                type="button"
                onClick={() => handleQuickAmount(200)}
                className="px-2.5 py-1 rounded-lg bg-[#17233A] hover:bg-[#23324D] border border-[#23324D] text-slate-300 text-xs font-bold transition-all"
              >
                200 ج.م
              </button>
            </div>

            {/* Payment Method */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">طريقة الدفع والتحصيل</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('كاش')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    paymentMethod === 'كاش'
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/30'
                      : 'bg-[#0B1220] border-[#23324D] text-slate-400 hover:text-white'
                  }`}
                >
                  <Wallet className="w-3.5 h-3.5" />
                  نقداً (كاش)
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('فيزا')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    paymentMethod === 'فيزا'
                      ? 'bg-teal-600 text-white border-teal-500 shadow-md shadow-teal-600/30'
                      : 'bg-[#0B1220] border-[#23324D] text-slate-400 hover:text-white'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  بطاقة (فيزا)
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('إنستاباي')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    paymentMethod === 'إنستاباي'
                      ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/30'
                      : 'bg-[#0B1220] border-[#23324D] text-slate-400 hover:text-white'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  إنستاباي (InstaPay)
                </button>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">ملاحظات التحصيل (اختياري)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="مثال: سداد مع صيدلي الوردية، أو رقم تحويل إنستاباي..."
                className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-600 focus:outline-none"
              />
            </div>

            {/* Remaining Preview */}
            <div className="bg-[#0B1220] p-3 rounded-xl border border-[#23324D] flex items-center justify-between text-xs">
              <span className="text-slate-400">الرصيد المتبقي على العميل بعد السداد:</span>
              <span className="font-mono font-bold text-white text-sm">
                {remainingAfterPayment.toFixed(2)} ج.م
              </span>
            </div>

            {/* Submit Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#23324D]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-[#23324D] text-xs font-bold transition-colors"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition-all"
              >
                <Sparkles className="w-4 h-4" />
                تأكيد التحصيل وإصدار سند القبض
              </button>
            </div>
          </form>
        ) : (
          /* Thermal Receipt Preview View */
          <div className="p-6 space-y-4 overflow-y-auto flex-1 flex flex-col items-center">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
              <CheckCircle2 className="w-4 h-4" />
              <span>تم توريد المبلغ بنجاح وقيده بحساب العميل ودرج النقدية!</span>
            </div>

            {/* 80mm Thermal Receipt Preview Card */}
            <div
              id="printable-payment-receipt"
              className="w-72 bg-white text-slate-900 rounded-lg p-4 font-mono text-[11px] shadow-2xl border border-slate-300 text-center space-y-2 select-text"
            >
              <div className="border-b border-dashed border-slate-400 pb-2">
                <div className="font-black text-sm">{pharmacyName}</div>
                <div className="text-[10px] text-slate-600">سند قبض نقدي رسمي (إيصال استلام)</div>
                <div className="text-[9px] text-slate-500 mt-1">
                  رقم الإيصال: <span className="font-bold text-slate-900">{createdReceipt.receiptNo}</span>
                </div>
                <div className="text-[9px] text-slate-500">
                  التاريخ: {createdReceipt.dateStr} - {createdReceipt.timeStr}
                </div>
              </div>

              <div className="text-right py-2 space-y-1 border-b border-dashed border-slate-400 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-slate-600">اسم العميل:</span>
                  <span className="font-bold text-slate-900">{createdReceipt.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">الهاتف:</span>
                  <span className="font-bold">{createdReceipt.customerPhone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">طريقة الدفع:</span>
                  <span className="font-bold">{createdReceipt.paymentMethod}</span>
                </div>
                {createdReceipt.notes && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">بيان:</span>
                    <span>{createdReceipt.notes}</span>
                  </div>
                )}
              </div>

              {/* Financial Box */}
              <div className="py-2 space-y-1.5 text-right border-b border-dashed border-slate-400">
                <div className="flex justify-between text-slate-600">
                  <span>المديونية السابقة:</span>
                  <span className="font-bold">{createdReceipt.previousBalance.toFixed(2)} ج.م</span>
                </div>
                <div className="flex justify-between text-emerald-700 font-bold text-xs bg-emerald-50 p-1 rounded">
                  <span>المبلغ المسدد:</span>
                  <span>{createdReceipt.amountPaid.toFixed(2)} ج.م</span>
                </div>
                <div className="flex justify-between font-black text-xs text-slate-900">
                  <span>الرصيد المتبقي:</span>
                  <span>{createdReceipt.remainingBalance.toFixed(2)} ج.م</span>
                </div>
              </div>

              {/* Receipt Footer */}
              <div className="pt-2 text-[9px] text-slate-500 leading-tight">
                <div>شكراً لتعاملكم مع صيدليتنا • نتمنى لكم دوام الصحة</div>
                <div className="mt-2 pt-2 border-t border-slate-200 flex justify-between px-2 text-[8px]">
                  <span>توقيع المستلم: ....................</span>
                  <span>الختم: [معتمد]</span>
                </div>
              </div>
            </div>

            {/* Print & Close Actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handlePrintReceipt}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white text-xs font-bold shadow-lg shadow-teal-500/20 flex items-center gap-2 transition-all"
              >
                <Printer className="w-4 h-4" />
                طباعة إيصال حراري (80mm)
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-[#17233A] hover:bg-[#23324D] text-slate-300 hover:text-white text-xs font-bold transition-colors"
              >
                تم الإغلاق
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
