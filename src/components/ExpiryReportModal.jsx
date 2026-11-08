import React from 'react';
import { X, Printer, FileText, CheckCircle2 } from 'lucide-react';
import { getPharmacyName } from '../utils/pharmacyIdentity';

export function ExpiryReportModal({
  isOpen,
  onClose,
  batches,
  supplierFilter,
  pharmacyName = getPharmacyName()
}) {
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const totalBoxes = batches.reduce((sum, b) => sum + (b.quantity_boxes || 0), 0);
  const totalCost = batches.reduce((sum, b) => {
    const cost = (b.cost_box || b.price_box * 0.75 || 0) * (b.quantity_boxes || 0);
    return sum + cost;
  }, 0);
  const totalRetail = batches.reduce((sum, b) => {
    const ret = (b.price_box || 0) * (b.quantity_boxes || 0);
    return sum + ret;
  }, 0);

  const currentDate = new Date().toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh]">
        
        {/* Header (No-print) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#23324D] bg-[#17233A]/70 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                معاينة وطباعة محضر مرتجع الرواكد والإكسباير
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium">
                  {batches.length} تشغيلة
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                إذن مرتجع رسمي معتمد لتسليم الأصناف لمندوب التوزيع وخصم قيمتها من الحساب
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-black shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-all"
            >
              <Printer className="w-4 h-4" />
              طباعة المحضر الرسمي (A4)
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#23324D] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Paper Document (A4 Styling) */}
        <div className="p-8 overflow-y-auto flex-1 bg-white text-slate-900 print:p-0 print:m-0" id="printable-expiry-report">
          <div className="max-w-3xl mx-auto space-y-6">
            
            {/* Pharmacy Official Header */}
            <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">{pharmacyName}</h1>
                <p className="text-xs font-bold text-slate-700 mt-1">
                  إدارة الصيدلية • قسم مراقبة المخزون وضمان الجودة الصيدلية
                </p>
                <div className="text-xs text-slate-500 mt-1">
                  تاريخ تحرير المحضر: <span className="font-bold text-slate-800">{currentDate}</span>
                </div>
              </div>
              <div className="text-left">
                <div className="inline-block px-3 py-1 bg-slate-900 text-white rounded text-xs font-bold">
                  محضر مرتجع أصناف قريبة الصلاحية
                </div>
                <div className="text-xs text-slate-700 mt-2 font-medium">
                  موجه لشركة: <span className="font-bold text-slate-900">{supplierFilter === 'ALL' ? 'شركات التوزيع المعتمدة' : supplierFilter}</span>
                </div>
              </div>
            </div>

            {/* Explanatory Legal Notice */}
            <div className="bg-slate-50 border border-slate-200 rounded p-2.5 text-[11px] text-slate-600 leading-relaxed">
              إقرار استلام أصناف دوائية مرتجعة وفق تعليمات هيئة الدواء المصرية وسياسات الإرجاع المنظمة لشركات التوزيع لتسوية رصيد الصيدلية الدائن.
            </div>

            {/* Batches Table */}
            <table className="w-full text-right text-xs border border-slate-300">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                  <th className="p-2 border-l border-slate-300 text-center w-8">#</th>
                  <th className="p-2 border-l border-slate-300">اسم الصنف الدوائي</th>
                  <th className="p-2 border-l border-slate-300 text-center w-24">رقم التشغيلة</th>
                  <th className="p-2 border-l border-slate-300 text-center w-20">الصلاحية</th>
                  <th className="p-2 border-l border-slate-300 text-center w-16">الكمية</th>
                  <th className="p-2 border-l border-slate-300 text-center w-20">سعر التكلفة</th>
                  <th className="p-2 text-center w-24">إجمالي المرتجع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {batches.map((batch, idx) => {
                  const costPerBox = batch.cost_box || (batch.price_box * 0.75);
                  const totalLine = costPerBox * (batch.quantity_boxes || 0);

                  return (
                    <tr key={batch.id || idx} className="hover:bg-slate-50">
                      <td className="p-2 border-l border-slate-200 text-center font-bold text-slate-600">
                        {idx + 1}
                      </td>
                      <td className="p-2 border-l border-slate-200">
                        <div className="font-bold text-slate-900">{batch.trade_name_ar || batch.trade_name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{batch.trade_name}</div>
                      </td>
                      <td className="p-2 border-l border-slate-200 text-center font-mono font-bold text-slate-800">
                        {batch.batch_no}
                      </td>
                      <td className="p-2 border-l border-slate-200 text-center font-bold font-mono text-red-600">
                        {batch.expiry_month_year || batch.expiry_date?.slice(0, 7)}
                      </td>
                      <td className="p-2 border-l border-slate-200 text-center font-bold text-slate-900 bg-slate-50">
                        {batch.quantity_boxes} علبة
                      </td>
                      <td className="p-2 border-l border-slate-200 text-center font-mono text-slate-700">
                        {costPerBox.toFixed(2)} ج.م
                      </td>
                      <td className="p-2 text-center font-mono font-bold text-slate-900">
                        {totalLine.toFixed(2)} ج.م
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Totals Summary */}
            <div className="flex justify-between items-center bg-slate-100 p-3 rounded-lg border border-slate-300 text-xs">
              <div className="flex items-center gap-6">
                <div>
                  <span className="text-slate-600">عدد الأصناف: </span>
                  <span className="font-bold text-slate-900">{batches.length} تشغيلة</span>
                </div>
                <div>
                  <span className="text-slate-600">إجمالي العلب المرتجعة: </span>
                  <span className="font-black text-slate-900 text-sm">{totalBoxes} علبة</span>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div>
                  <span className="text-slate-600">سعر الجمهور: </span>
                  <span className="font-bold text-slate-700">
                    {totalRetail.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
                  </span>
                </div>
                <div>
                  <span className="text-slate-600">صافي المستحق للصيدلية: </span>
                  <span className="font-black text-slate-900 text-base">
                    {totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
                  </span>
                </div>
              </div>
            </div>

            {/* Official Signatures */}
            <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-300 text-center text-xs">
              <div>
                <div className="font-bold text-slate-800 mb-8">توقيع الصيدلي المسؤول وختم الصيدلية</div>
                <div className="border-b border-dashed border-slate-400 w-48 mx-auto"></div>
              </div>
              <div>
                <div className="font-bold text-slate-800 mb-8">توقيع مندوب شركة التوزيع بالاستلام</div>
                <div className="border-b border-dashed border-slate-400 w-48 mx-auto"></div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
