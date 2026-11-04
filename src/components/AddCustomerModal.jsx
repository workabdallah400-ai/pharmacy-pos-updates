import React, { useState, useEffect } from 'react';
import { X, UserPlus, User, Phone, MapPin, DollarSign, FileText, Sparkles, AlertCircle } from 'lucide-react';

export function AddCustomerModal({ isOpen, onClose, customerToEdit, onSaveCustomer }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [creditLimit, setCreditLimit] = useState('2000');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (customerToEdit) {
      setName(customerToEdit.name || '');
      setPhone(customerToEdit.phone || '');
      setAddress(customerToEdit.address || '');
      setCreditLimit(String(customerToEdit.credit_limit || 2000));
      setNotes(customerToEdit.notes || '');
      setError('');
    } else {
      setName('');
      setPhone('');
      setAddress('');
      setCreditLimit('2000');
      setNotes('');
      setError('');
    }
  }, [customerToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('يرجى إدخال اسم العميل بالكامل');
      return;
    }
    if (!phone.trim()) {
      setError('يرجى إدخال رقم هاتف العميل للتواصل');
      return;
    }

    const limit = parseFloat(creditLimit);
    if (isNaN(limit) || limit < 0) {
      setError('يرجى تحديد سقف ائتماني صحيح (ج.م)');
      return;
    }

    const customerData = {
      id: customerToEdit ? customerToEdit.id : Date.now(),
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim() || 'غير محدد',
      credit_limit: limit,
      balance: customerToEdit ? customerToEdit.balance : 0.0,
      notes: notes.trim(),
      last_payment_date: customerToEdit?.last_payment_date || null,
      last_payment_amount: customerToEdit?.last_payment_amount || null,
      history: customerToEdit?.history || []
    };

    onSaveCustomer(customerData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn font-cairo">
      <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden max-h-[92vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#23324D] bg-[#17233A]/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                {customerToEdit ? 'تعديل بيانات العميل وسقف الائتمان' : 'تسجيل عميل جديد وحساب آجل'}
              </h3>
              <p className="text-xs text-slate-400">
                إدارة ملفات ديون وحسابات عملاء الصيدلية
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Customer Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              اسم العميل بالكامل <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: أ. محمود الشناوي أو د. هاني يوسف"
                className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl pl-3 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none"
              />
              <User className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
            </div>
          </div>

          {/* Phone Number & Credit Limit */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                رقم الهاتف (واتساب) <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="010XXXXXXXX"
                  className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl pl-3 pr-10 py-2.5 text-sm text-white font-mono placeholder-slate-500 focus:outline-none"
                />
                <Phone className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                سقف الائتمان المسموح به <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="100"
                  required
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                  className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl pl-12 pr-3.5 py-2.5 text-sm font-bold text-teal-300 focus:outline-none"
                />
                <span className="absolute left-3.5 top-2.5 text-xs text-slate-400">ج.م</span>
              </div>
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              العنوان والمنطقة السكنية
            </label>
            <div className="relative">
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="مثال: شارع مصطفى النحاس - عمارة 12 - الدور 3"
                className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl pl-3 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none"
              />
              <MapPin className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              ملاحظات خاصة عن العميل أو نظام السداد
            </label>
            <textarea
              rows="2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: يسدد أول كل شهر مع المعاش، أو حساب عائلي مشترك..."
              className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-600 focus:outline-none resize-none"
            />
          </div>

          {/* Footer Buttons */}
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
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white text-xs font-bold shadow-lg shadow-teal-500/20 flex items-center gap-2 transition-all"
            >
              <Sparkles className="w-4 h-4" />
              {customerToEdit ? 'تحديث بيانات العميل' : 'حفظ وتسجيل العميل'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
