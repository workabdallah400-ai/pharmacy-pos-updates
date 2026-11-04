import React, { useState } from 'react';
import { X, Plus, User, Phone, Package, Building2, AlertCircle, FileText, Sparkles } from 'lucide-react';

export function AddCustomShortageModal({ isOpen, onClose, suppliers, onAddCustomItem }) {
  const [tradeName, setTradeName] = useState('');
  const [genericName, setGenericName] = useState('');
  const [quantity, setQuantity] = useState('5');
  const [supplierName, setSupplierName] = useState(suppliers[0]?.name || 'الشركة المتحدة للصيادلة (UCP)');
  const [type, setType] = useState('CUSTOMER_REQUEST'); // 'CUSTOMER_REQUEST' or 'GENERAL_SHORTAGE'
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [isUrgent, setIsUrgent] = useState(true);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!tradeName.trim()) {
      setError('يرجى إدخال اسم الدواء أو الصنف المطلوب');
      return;
    }

    const qty = parseInt(quantity, 10);
    if (!qty || qty <= 0) {
      setError('يرجى تحديد كمية صحيحة بالعلب');
      return;
    }

    const customItem = {
      id: `custom-${Date.now()}`,
      isCustom: true,
      trade_name: tradeName.trim(),
      trade_name_ar: tradeName.trim(),
      generic_name: genericName.trim() || 'طلب خاص غير مسجل',
      stock_boxes: 0,
      stock_strips: 0,
      reorder_level: qty,
      order_quantity: qty,
      shelf: 'خاص',
      preferred_supplier: supplierName,
      price_box: 0, // Unlisted or to be priced
      type, // 'CUSTOMER_REQUEST' | 'GENERAL_SHORTAGE'
      customerName: type === 'CUSTOMER_REQUEST' ? customerName.trim() : '',
      customerPhone: type === 'CUSTOMER_REQUEST' ? customerPhone.trim() : '',
      notes: notes.trim(),
      isUrgent,
      date_added: new Date().toISOString()
    };

    onAddCustomItem(customItem);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden max-h-[92vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#23324D] bg-[#17233A]/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                إضافة صنف يدوي أو طلبية عميل
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-medium">
                  كشكول النواقص
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                تسجيل صنف ناقص غير متوفر بالدليل أو حجز دواء مخصص لزبون الصيدلية
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

          {/* Type Toggle: Customer Request vs General Shortage */}
          <div className="grid grid-cols-2 gap-2 bg-[#0B1220] p-1.5 rounded-xl border border-[#23324D]">
            <button
              type="button"
              onClick={() => setType('CUSTOMER_REQUEST')}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                type === 'CUSTOMER_REQUEST'
                  ? 'bg-purple-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              طلب عميل مخصص (زبون)
            </button>
            <button
              type="button"
              onClick={() => setType('GENERAL_SHORTAGE')}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                type === 'GENERAL_SHORTAGE'
                  ? 'bg-teal-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              نقص صيدلية عام (رف)
            </button>
          </div>

          {/* Medicine Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              اسم الصنف / الدواء المطلوب <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={tradeName}
              onChange={(e) => setTradeName(e.target.value)}
              placeholder="مثال: كلكسان 60 حقن، أو إيثرين 100، أو سيروم خاص..."
              className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none"
            />
          </div>

          {/* Generic or Concentration */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              المادة الفعالة أو التركيز (اختياري)
            </label>
            <input
              type="text"
              value={genericName}
              onChange={(e) => setGenericName(e.target.value)}
              placeholder="مثال: Enoxaparin Sodium 60mg / 0.6ml"
              className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none"
            />
          </div>

          {/* Quantity & Supplier */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                الكمية المطلوبة (بالعلبة) <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl px-3.5 py-2.5 text-sm font-bold text-teal-300 focus:outline-none"
                />
                <span className="absolute left-3 top-2.5 text-xs text-slate-500">علبة</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                شركة التوزيع المفضلة
              </label>
              <select
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 py-2.5 text-xs font-medium text-white focus:outline-none"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Customer Details if Type is CUSTOMER_REQUEST */}
          {type === 'CUSTOMER_REQUEST' && (
            <div className="p-4 rounded-xl bg-purple-500/5 border border-purple-500/20 space-y-3">
              <div className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />
                بيانات الزبون للحجز والتواصل فور الاستلام:
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">اسم العميل</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="مثال: أ. محمود الشناوي"
                    className="w-full bg-[#0B1220] border border-[#23324D] focus:border-purple-400 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">رقم الموبايل (واتساب)</label>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="01012345678"
                    className="w-full bg-[#0B1220] border border-[#23324D] focus:border-purple-400 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Notes & Urgent Priority */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              ملاحظات إضافية للصيدلي أو المندوب
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: تأكيد تاريخ صلاحية حديث، أو بديل مناسب مسموح به..."
              className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-600 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="isUrgentCheck"
              checked={isUrgent}
              onChange={(e) => setIsUrgent(e.target.checked)}
              className="w-4 h-4 rounded text-teal-500 bg-[#0B1220] border-[#23324D] focus:ring-teal-400 focus:ring-offset-[#111A2B]"
            />
            <label htmlFor="isUrgentCheck" className="text-xs font-semibold text-slate-300 cursor-pointer select-none">
              تصنيف كـ <span className="text-rose-400 font-bold">أولوية قصوى وعاجلة</span> في الكشكول
            </label>
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
              إضافة الصنف لكشكول النواقص
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
