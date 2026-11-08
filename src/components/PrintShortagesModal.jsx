import React, { useRef } from 'react';
import { X, Printer, FileText, CheckCircle2 } from 'lucide-react';
import { getPharmacyName } from '../utils/pharmacyIdentity';

export function PrintShortagesModal({
  isOpen,
  onClose,
  items,
  supplierFilter,
  pharmacyName = getPharmacyName()
}) {
  const printRef = useRef(null);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const totalBoxes = items.reduce((sum, item) => sum + (item.order_quantity || 1), 0);
  const totalCost = items.reduce((sum, item) => {
    const cost = (item.price_box || 0) * 0.75 * (item.order_quantity || 1);
    return sum + cost;
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
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                معاينة وطباعة كشكول النواقص
                <span className="text-xs px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 font-medium">
                  {items.length} صنف مطلوب
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                تقرير رسمي بطلبية الأدوية جاهز للطباعة والتسليم لمندوب التوزيع
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white text-xs font-bold shadow-lg shadow-teal-500/20 flex items-center gap-2 transition-all"
            >
              <Printer className="w-4 h-4" />
              طباعة التقرير (Print)
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#23324D] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Area */}
        <div className="p-8 overflow-y-auto flex-1 bg-white text-slate-900 print:p-0 print:m-0" id="printable-shortages">
          <div className="max-w-3xl mx-auto space-y-6">
            
            {/* Pharmacy Header */}
            <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">{pharmacyName}</h1>
                <p className="text-xs font-semibold text-slate-600 mt-1">
                  نظام إدارة الصيدليات ونقاط البيع • تقرير طلبيات التوريد والنواقص
                </p>
                <div className="text-xs font-medium text-slate-500 mt-1">
                  تاريخ استخراج الطلبية: <span className="font-bold text-slate-800">{currentDate}</span>
                </div>
              </div>
              <div className="text-left">
                <div className="inline-block px-3 py-1 bg-slate-100 border border-slate-300 rounded text-xs font-bold text-slate-800">
                  {supplierFilter === 'ALL' ? 'كافة شركات التوزيع' : `طلبية: ${supplierFilter}`}
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  عدد البنود: <span className="font-bold text-slate-800">{items.length}</span> صنف
                </div>
              </div>
            </div>

            {/* Items Table */}
            <table className="w-full text-right text-xs border border-slate-300">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                  <th className="p-2 border-l border-slate-300 text-center w-8">#</th>
                  <th className="p-2 border-l border-slate-300">اسم الصنف / الدواء</th>
                  <th className="p-2 border-l border-slate-300 text-center w-16">مكان الرف</th>
                  <th className="p-2 border-l border-slate-300 text-center w-16">الرصيد</th>
                  <th className="p-2 border-l border-slate-300 text-center w-24">الكمية المطلوبة</th>
                  <th className="p-2 border-l border-slate-300">شركة التوزيع</th>
                  <th className="p-2">ملاحظات الطلب</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {items.map((item, idx) => (
                  <tr key={item.id || idx} className="hover:bg-slate-50">
                    <td className="p-2 border-l border-slate-200 text-center font-bold text-slate-600">
                      {idx + 1}
                    </td>
                    <td className="p-2 border-l border-slate-200">
                      <div className="font-bold text-slate-900">{item.trade_name_ar || item.trade_name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{item.trade_name}</div>
                    </td>
                    <td className="p-2 border-l border-slate-200 text-center font-mono font-bold text-slate-700">
                      {item.shelf || '-'}
                    </td>
                    <td className="p-2 border-l border-slate-200 text-center font-bold">
                      {item.stock_boxes === 0 ? (
                        <span className="text-red-600">صفر</span>
                      ) : (
                        <span>{item.stock_boxes} ع</span>
                      )}
                    </td>
                    <td className="p-2 border-l border-slate-200 text-center font-bold text-base text-slate-900 bg-slate-50">
                      {item.order_quantity || 1} علبة
                    </td>
                    <td className="p-2 border-l border-slate-200 text-slate-700 font-medium">
                      {item.preferred_supplier || 'غير محدد'}
                    </td>
                    <td className="p-2 text-slate-600 text-[11px]">
                      {item.customerName
                        ? `طلب زبون: ${item.customerName} (${item.customerPhone || ''})`
                        : item.notes || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals Summary */}
            <div className="flex justify-between items-center bg-slate-100 p-3 rounded-lg border border-slate-300 text-xs">
              <div className="flex items-center gap-6">
                <div>
                  <span className="text-slate-500">إجمالي الأصناف: </span>
                  <span className="font-bold text-slate-800">{items.length} صنف</span>
                </div>
                <div>
                  <span className="text-slate-500">إجمالي العلب المطلوبة: </span>
                  <span className="font-black text-slate-900 text-sm">{totalBoxes} علبة</span>
                </div>
              </div>
              <div>
                <span className="text-slate-500">التكلفة التقديرية للشراء: </span>
                <span className="font-black text-slate-900 text-sm">
                  {totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
                </span>
              </div>
            </div>

            {/* Signature Box */}
            <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-300 text-center text-xs">
              <div>
                <div className="font-bold text-slate-700 mb-8">توقيع الصيدلي المسؤول / الكاشير</div>
                <div className="border-b border-dashed border-slate-400 w-48 mx-auto"></div>
              </div>
              <div>
                <div className="font-bold text-slate-700 mb-8">توقيع مندوب شركة التوزيع بالاستلام</div>
                <div className="border-b border-dashed border-slate-400 w-48 mx-auto"></div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
