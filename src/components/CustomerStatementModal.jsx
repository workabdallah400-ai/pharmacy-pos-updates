import React from 'react';
import { X, Printer, FileText, ArrowDownLeft, ArrowUpRight, User, Phone, MapPin, Calendar, DollarSign } from 'lucide-react';

export function CustomerStatementModal({
  isOpen,
  onClose,
  customer,
  pharmacyName = 'صيدلية النخبة الحديثة'
}) {
  if (!isOpen || !customer) return null;

  const handlePrint = () => {
    window.print();
  };

  const history = customer.history || [];
  const totalDebit = history.reduce((sum, tx) => sum + (tx.debit || 0), 0);
  const totalCredit = history.reduce((sum, tx) => sum + (tx.credit || 0), 0);
  const currentBalance = customer.balance || 0;

  const currentDate = new Date().toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn font-cairo">
      <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh]">
        
        {/* Header (No-print) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#23324D] bg-[#17233A]/70 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                كشف حساب تفصيلي للعميل
                <span className="text-xs px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 font-medium">
                  {customer.name}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                سجل كافة الفواتير الآجلة وسندات السداد النقدية السابقة
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white text-xs font-bold shadow-lg shadow-teal-500/20 flex items-center gap-2 transition-all"
            >
              <Printer className="w-4 h-4" />
              طباعة كشف الحساب (A4)
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#23324D] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Statement Sheet (A4 Styling) */}
        <div className="p-8 overflow-y-auto flex-1 bg-white text-slate-900 print:p-0 print:m-0" id="printable-customer-statement">
          <div className="max-w-3xl mx-auto space-y-6">
            
            {/* Pharmacy Official Header */}
            <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">{pharmacyName}</h1>
                <p className="text-xs font-bold text-slate-700 mt-1">
                  نظام إدارة الحسابات والعملاء • تقرير كشف حساب تفصيلي
                </p>
                <div className="text-xs text-slate-500 mt-1">
                  تاريخ استخراج التقرير: <span className="font-bold text-slate-800">{currentDate}</span>
                </div>
              </div>
              <div className="text-left">
                <div className="inline-block px-3 py-1 bg-slate-900 text-white rounded text-xs font-bold">
                  كشف حساب عميل
                </div>
                <div className="text-xs text-slate-700 mt-2 font-medium">
                  سقف الائتمان: <span className="font-bold text-slate-900">{customer.credit_limit} ج.م</span>
                </div>
              </div>
            </div>

            {/* Customer Details Box */}
            <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-500 block mb-0.5">اسم العميل:</span>
                <span className="font-bold text-slate-900 text-sm">{customer.name}</span>
              </div>
              <div>
                <span className="text-slate-500 block mb-0.5">رقم الهاتف:</span>
                <span className="font-bold text-slate-900 font-mono text-sm">{customer.phone}</span>
              </div>
              <div>
                <span className="text-slate-500 block mb-0.5">العنوان:</span>
                <span className="font-medium text-slate-800">{customer.address || '-'}</span>
              </div>
            </div>

            {/* Financial Summary Badges */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-slate-100 p-2.5 rounded-lg border border-slate-300">
                <div className="text-[11px] text-slate-500">إجمالي المسحوبات (مدين)</div>
                <div className="font-black text-slate-900 text-sm font-mono mt-0.5">
                  {totalDebit.toFixed(2)} ج.م
                </div>
              </div>
              <div className="bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
                <div className="text-[11px] text-emerald-700">إجمالي السدادات (دائن)</div>
                <div className="font-black text-emerald-800 text-sm font-mono mt-0.5">
                  {totalCredit.toFixed(2)} ج.م
                </div>
              </div>
              <div className="bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                <div className="text-[11px] text-amber-700 font-bold">الرصيد المستحق الحالي</div>
                <div className="font-black text-amber-900 text-base font-mono mt-0.5">
                  {currentBalance.toFixed(2)} ج.م
                </div>
              </div>
            </div>

            {/* Ledger Transactions Table */}
            <table className="w-full text-right text-xs border border-slate-300">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                  <th className="p-2 border-l border-slate-300 text-center w-8">#</th>
                  <th className="p-2 border-l border-slate-300 text-center w-24">التاريخ</th>
                  <th className="p-2 border-l border-slate-300 text-center w-24">رقم المرجع</th>
                  <th className="p-2 border-l border-slate-300">البيان / تفاصيل الحركة</th>
                  <th className="p-2 border-l border-slate-300 text-center w-24 text-rose-800">مدين (+)</th>
                  <th className="p-2 border-l border-slate-300 text-center w-24 text-emerald-800">دائن (-)</th>
                  <th className="p-2 text-center w-28 bg-slate-200/50">الرصيد التراكمي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {history.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="p-4 text-center text-slate-500">
                      لا توجد حركات مسجلة لهذا العميل حتى الآن.
                    </td>
                  </tr>
                ) : (
                  history.map((tx, idx) => (
                    <tr key={tx.id || idx} className="hover:bg-slate-50">
                      <td className="p-2 border-l border-slate-200 text-center font-bold text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="p-2 border-l border-slate-200 text-center font-mono text-slate-700">
                        {tx.date}
                      </td>
                      <td className="p-2 border-l border-slate-200 text-center font-mono font-bold text-slate-800">
                        {tx.ref}
                      </td>
                      <td className="p-2 border-l border-slate-200 text-slate-900 font-medium">
                        {tx.desc}
                      </td>
                      <td className="p-2 border-l border-slate-200 text-center font-mono font-bold text-rose-700">
                        {tx.debit > 0 ? `${tx.debit.toFixed(2)}` : '-'}
                      </td>
                      <td className="p-2 border-l border-slate-200 text-center font-mono font-bold text-emerald-700">
                        {tx.credit > 0 ? `${tx.credit.toFixed(2)}` : '-'}
                      </td>
                      <td className="p-2 text-center font-mono font-black text-slate-900 bg-slate-50">
                        {Number(tx.balance || 0).toFixed(2)} ج.م
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Statement Footer & Signatures */}
            <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-300 text-center text-xs">
              <div>
                <div className="font-bold text-slate-800 mb-8">ختم وتوقيع الصيدلية المسؤول</div>
                <div className="border-b border-dashed border-slate-400 w-48 mx-auto"></div>
              </div>
              <div>
                <div className="font-bold text-slate-800 mb-8">توقيع العميل بالمصادقة على الرصيد</div>
                <div className="border-b border-dashed border-slate-400 w-48 mx-auto"></div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
