import React, { useState } from 'react';
import { X, DollarSign, Wallet, CheckCircle2 } from 'lucide-react';

export function QuickExpenseModal({ isOpen, onClose, onAddExpense }) {
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('نثريات');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) return;

    onAddExpense({
      id: Date.now(),
      title: title.trim() || 'مصروف نثريات سريع',
      amount: numAmount,
      category,
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
    });

    setAmount('');
    setTitle('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-md bg-[#111A2B] border border-[#23324D] rounded-3xl shadow-card-dark overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 border-b border-[#23324D] flex items-center justify-between bg-[#17233A]/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-300">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">تسجيل مصروف نثريات من الدرج</h3>
                <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-full font-bold">
                  F8
                </span>
              </div>
              <p className="text-xs text-slate-400">خصم نقدي مباشر من عهدة الكاشير</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[#17233A] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-[#23324D] flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              المبلغ المنصرف (ج.م) *
            </label>
            <input
              type="number"
              step="0.5"
              required
              autoFocus
              placeholder="مثال: 50"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full h-12 bg-[#17233A] border border-[#23324D] focus:border-rose-400 rounded-xl px-4 text-white text-lg font-bold font-mono outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              بيان المنصرف (السبب)
            </label>
            <input
              type="text"
              placeholder="مثال: شاي وسكر / أكياس صيدلية / أدوات نظافة"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full h-11 bg-[#17233A] border border-[#23324D] focus:border-rose-400 rounded-xl px-4 text-white text-xs outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              نوع البند
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full h-11 bg-[#17233A] border border-[#23324D] focus:border-rose-400 rounded-xl px-3 text-white text-xs outline-none"
            >
              <option value="نثريات">نثريات وبوفيه</option>
              <option value="مطبوعات">أكياس ومطبوعات</option>
              <option value="صيانة">صيانة ونظافة</option>
              <option value="دليفري">حساب طيار / دليفري</option>
              <option value="أخرى">أخرى</option>
            </select>
          </div>

          <div className="pt-2 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-[#17233A] hover:bg-[#202E4C] text-white text-xs font-semibold border border-[#23324D]"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>تأكيد الخصم من الدرج</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
