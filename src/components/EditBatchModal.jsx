import React, { useState, useEffect } from 'react';
import { X, Calendar, Edit3, Package, Building2, AlertCircle, Sparkles } from 'lucide-react';

export function EditBatchModal({ isOpen, onClose, batch, onSaveBatch, suppliers }) {
  const [batchNo, setBatchNo] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [quantityBoxes, setQuantityBoxes] = useState(0);
  const [quantityStrips, setQuantityStrips] = useState(0);
  const [supplierName, setSupplierName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (batch) {
      setBatchNo(batch.batch_no || '');
      setExpiryDate(batch.expiry_date || '');
      setQuantityBoxes(batch.quantity_boxes || 0);
      setQuantityStrips(batch.quantity_strips || 0);
      setSupplierName(batch.supplier_name || (suppliers && suppliers[0]?.name) || '');
      setError('');
    }
  }, [batch, suppliers]);

  if (!isOpen || !batch) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!batchNo.trim()) {
      setError('يرجى إدخال رقم التشغيلة');
      return;
    }
    if (!expiryDate) {
      setError('يرجى تحديد تاريخ انتهاء الصلاحية');
      return;
    }

    const qBoxes = parseInt(quantityBoxes, 10);
    const qStrips = parseInt(quantityStrips, 10) || 0;

    if (isNaN(qBoxes) || qBoxes < 0) {
      setError('يرجى إدخال كمية صحيحة بالعلب');
      return;
    }

    // Format month/year
    const d = new Date(expiryDate);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const expiryMonthYear = `${month}/${year}`;

    const updatedBatch = {
      ...batch,
      batch_no: batchNo.trim(),
      expiry_date: expiryDate,
      expiry_month_year: expiryMonthYear,
      quantity_boxes: qBoxes,
      quantity_strips: qStrips,
      supplier_name: supplierName
    };

    onSaveBatch(updatedBatch);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#23324D] bg-[#17233A]/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                تعديل بيانات التشغيلة والصلاحية
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                {batch.trade_name_ar || batch.trade_name}
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

          {/* Batch Number */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              رقم التشغيلة (Batch Number) <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={batchNo}
              onChange={(e) => setBatchNo(e.target.value)}
              placeholder="مثال: BCH-9214 أو EG-2023"
              className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none"
            />
          </div>

          {/* Expiry Date */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              تاريخ الانتهاء المحدد <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <input
                type="date"
                required
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none"
              />
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
            </div>
          </div>

          {/* Quantities (Boxes & Strips) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                الكمية المتبقية (علب) <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                min="0"
                required
                value={quantityBoxes}
                onChange={(e) => setQuantityBoxes(e.target.value)}
                className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl px-3.5 py-2.5 text-sm font-bold text-teal-300 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                الكمية المتبقية (شرائط)
              </label>
              <input
                type="number"
                min="0"
                value={quantityStrips}
                onChange={(e) => setQuantityStrips(e.target.value)}
                className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl px-3.5 py-2.5 text-sm font-bold text-teal-300 focus:outline-none"
              />
            </div>
          </div>

          {/* Supplier Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              شركة التوزيع الموردة
            </label>
            <select
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 py-2.5 text-xs font-medium text-white focus:outline-none"
            >
              {suppliers && suppliers.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
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
              حفظ التعديلات
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
