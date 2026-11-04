import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  DollarSign,
  TrendingUp,
  CreditCard,
  ShoppingBag,
  Printer,
  Search,
  Download,
  Calendar,
  Sparkles,
  FileText,
  Eye,
  CheckCircle2,
  Smartphone,
  Wallet,
  Coins
} from 'lucide-react';
import { sqliteService } from '../db/sqliteService';

export function ReportsView() {
  const [invoices, setInvoices] = useState([]);
  const [topSellers, setTopSellers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('ALL');
  const [selectedInvoiceForModal, setSelectedInvoiceForModal] = useState(null);
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Load Invoices from SQLite on mount
  useEffect(() => {
    let isCurrent = true;
    const fetchInvoices = async () => {
      try {
        const dbInvoices = await sqliteService.getInvoices(100);
        if (isCurrent && dbInvoices && dbInvoices.length > 0) {
          setInvoices(dbInvoices);
        }
      } catch (err) {
        console.warn('SQLite invoices fetch error:', err);
      }
    };
    fetchInvoices();
    return () => { isCurrent = false; };
  }, []);

  // Financial Stats Computations
  // getInvoices() now aliases total/net_total/created_at for the UI.
  const getInvoiceTotal = (inv) => Number(inv.total_retail ?? inv.net_total ?? inv.total ?? 0) || 0;
  const getInvoiceCost = (inv) => {
    const explicit = Number(inv.total_cost ?? inv.cost_total);
    return Number.isFinite(explicit) && explicit > 0 ? explicit : getInvoiceTotal(inv) * 0.75;
  };
  const getInvoiceProfit = (inv) => {
    const explicit = Number(inv.total_profit);
    return Number.isFinite(explicit) && explicit !== 0 ? explicit : Math.max(0, getInvoiceTotal(inv) - getInvoiceCost(inv));
  };

  const totalSales = invoices.reduce((acc, inv) => acc + getInvoiceTotal(inv), 0);
  const totalCost = invoices.reduce((acc, inv) => acc + getInvoiceCost(inv), 0);
  const netProfit = Math.max(0, invoices.reduce((acc, inv) => acc + getInvoiceProfit(inv), 0));
  const invoicesCount = invoices.length;
  const avgInvoiceValue = invoicesCount > 0 ? totalSales / invoicesCount : 0;

  const cashSales = invoices.filter((i) => i.payment_method === 'كاش').reduce((acc, i) => acc + getInvoiceTotal(i), 0);
  const visaSales = invoices.filter((i) => i.payment_method === 'فيزا').reduce((acc, i) => acc + getInvoiceTotal(i), 0);
  const instapaySales = invoices.filter((i) => i.payment_method === 'إنستاباي').reduce((acc, i) => acc + getInvoiceTotal(i), 0);
  const creditSales = invoices.filter((i) => i.payment_method === 'آجل').reduce((acc, i) => acc + getInvoiceTotal(i), 0);

  // Filtered invoices
  const filteredInvoices = invoices.filter((inv) => {
    if (paymentFilter !== 'ALL' && inv.payment_method !== paymentFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const numMatch = String(inv.invoice_number || inv.id || '').includes(q);
      const custMatch = String(inv.customer_name || '').toLowerCase().includes(q);
      const cashierMatch = String(inv.cashier_name || '').toLowerCase().includes(q);
      return numMatch || custMatch || cashierMatch;
    }
    return true;
  });

  // Export Invoices Report to CSV
  const handleExportCSV = () => {
    try {
      const headers = ['رقم الفاتورة', 'الوقت', 'الكاشير', 'العميل', 'طريقة الدفع', 'الإجمالي', 'الصافي'];
      const rows = filteredInvoices.map((i) => [
        `"#${i.invoice_number || i.id}"`,
        `"${i.created_at || ''}"`,
        `"${i.cashier_name || ''}"`,
        `"${i.customer_name || 'نقدي'}"`,
        `"${i.payment_method || 'كاش'}"`,
        i.total || 0,
        i.net_total || i.total || 0
      ]);

      const csv = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const link = document.createElement('a');
      link.href = encodeURI(csv);
      link.download = `تقرير_المبيعات_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('تم تصدير تقرير المبيعات بنجاح 📥');
    } catch (e) {
      showToast('حدث خطأ أثناء تصدير التقرير');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0B1220] overflow-hidden select-none p-4 space-y-4 font-cairo">
      
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-r from-teal-600 to-emerald-600 text-white px-5 py-2.5 rounded-xl shadow-2xl border border-teal-400/30 flex items-center gap-2 text-xs font-bold animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-white" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl p-4 flex items-center justify-between shadow-lg shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/15 text-teal-400 border border-teal-500/30 flex items-center justify-center">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              تقارير المبيعات والأرباح وفواتير الكاشير
            </h3>
            <p className="text-xs text-slate-400">
              تحليل حركة المبيعات، سجل الفواتير الصادرة، الأصناف الأكثر طلباً، وصافي الأرباح
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleExportCSV}
          className="px-4 py-2 rounded-xl bg-[#17233A] hover:bg-[#202E4C] border border-[#23324D] text-slate-200 text-xs font-bold flex items-center gap-2 transition-all cursor-pointer"
        >
          <Download className="w-4 h-4 text-teal-400" />
          <span>تصدير تقرير المبيعات (CSV)</span>
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-y-auto space-y-4">
        
        {/* 1. Stat Cards (4 Cards) */}
        <div className="grid grid-cols-4 gap-3">
          {/* Total Sales */}
          <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl p-4 flex items-center justify-between shadow-sm">
            <div>
              <span className="text-xs text-slate-400 font-medium block mb-1">إجمالي مبيعات اليوم</span>
              <div className="text-2xl font-black text-white font-mono" dir="ltr">
                {totalSales.toFixed(2)} <span className="text-xs font-bold text-teal-300">ج.م</span>
              </div>
              <span className="text-[10px] text-teal-400 font-medium">عدد الفواتير الصادرة: {invoicesCount}</span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-300">
              <DollarSign className="w-6 h-6" />
            </div>
          </div>

          {/* Net Profit */}
          <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl p-4 flex items-center justify-between shadow-sm">
            <div>
              <span className="text-xs text-slate-400 font-medium block mb-1">صافي الأرباح المحققة</span>
              <div className="text-2xl font-black text-emerald-400 font-mono" dir="ltr">
                +{netProfit.toFixed(2)} <span className="text-xs font-bold text-emerald-300">ج.م</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                هامش الربح: {totalSales > 0 ? ((netProfit / totalSales) * 100).toFixed(1) : 0}%
              </span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-300">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>

          {/* Average Invoice */}
          <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl p-4 flex items-center justify-between shadow-sm">
            <div>
              <span className="text-xs text-slate-400 font-medium block mb-1">متوسط قيمة الفاتورة</span>
              <div className="text-2xl font-black text-teal-300 font-mono" dir="ltr">
                {avgInvoiceValue.toFixed(2)} <span className="text-xs font-normal text-slate-400">ج.م</span>
              </div>
              <span className="text-[10px] text-slate-400">سلة مشتريات العميل</span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-[#17233A] border border-[#23324D] flex items-center justify-center text-teal-300">
              <Coins className="w-6 h-6" />
            </div>
          </div>

          {/* Payment Methods Breakdown */}
          <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl p-4 flex flex-col justify-between shadow-sm text-xs font-mono">
            <span className="text-[11px] text-slate-400 font-sans block mb-1 font-bold">تقسيم طرق الدفع:</span>
            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              <div className="flex justify-between bg-[#0B1220] px-2 py-1 rounded">
                <span className="text-slate-400">كاش:</span>
                <span className="text-emerald-400 font-bold">{cashSales.toFixed(0)}</span>
              </div>
              <div className="flex justify-between bg-[#0B1220] px-2 py-1 rounded">
                <span className="text-slate-400">فيزا:</span>
                <span className="text-teal-300 font-bold">{visaSales.toFixed(0)}</span>
              </div>
              <div className="flex justify-between bg-[#0B1220] px-2 py-1 rounded">
                <span className="text-slate-400">إنستاباي:</span>
                <span className="text-purple-300 font-bold">{instapaySales.toFixed(0)}</span>
              </div>
              <div className="flex justify-between bg-[#0B1220] px-2 py-1 rounded">
                <span className="text-slate-400">آجل:</span>
                <span className="text-amber-400 font-bold">{creditSales.toFixed(0)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Search & Payment Filter Bar */}
        <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-sm">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-teal-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث برقم الفاتورة، اسم العميل، أو الكاشير..."
              className="w-full h-10 bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl pr-10 pl-4 text-xs text-white outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-400 text-[11px] ml-1">تصفية:</span>
            {['ALL', 'كاش', 'فيزا', 'إنستاباي', 'آجل'].map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => setPaymentFilter(method)}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                  paymentFilter === method
                    ? 'bg-teal-500 text-slate-950 shadow-glow-teal'
                    : 'bg-[#0B1220] text-slate-400 hover:text-white border border-[#23324D]'
                }`}
              >
                {method === 'ALL' ? 'كافة الفواتير' : method}
              </button>
            ))}
          </div>
        </div>

        {/* 3. Invoices Table */}
        <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl p-5 shadow-lg flex flex-col flex-1 overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#23324D] pb-3 mb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-teal-400" />
              <h4 className="text-sm font-bold text-white">سجل الفواتير الصادرة</h4>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              المعروض: <strong className="text-teal-300">{filteredInvoices.length}</strong> فاتورة
            </span>
          </div>

          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-[#141E30] text-slate-300 border-b border-[#23324D] font-bold">
                <tr>
                  <th className="p-3">رقم الفاتورة</th>
                  <th className="p-3">الوقت والتاريخ</th>
                  <th className="p-3">الكاشير</th>
                  <th className="p-3">العميل</th>
                  <th className="p-3">طريقة الدفع</th>
                  <th className="p-3">عدد الأصناف</th>
                  <th className="p-3">إجمالي القيمة</th>
                  <th className="p-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#23324D]/60 font-medium">
                {filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="text-center py-12 text-slate-400">
                      لا توجد فواتير مبيعات مسجلة حالياً. النظام على الزيرو وجاهز لبدء البيع.
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((inv, idx) => (
                    <tr key={inv.id || idx} className="hover:bg-[#17233A]/70 transition-colors">
                      <td className="p-3 font-mono font-bold text-teal-300">#{inv.invoice_number || inv.id}</td>
                      <td className="p-3 font-mono text-slate-400">
                        {inv.created_at ? new Date(inv.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '-'}
                      </td>
                      <td className="p-3 text-white font-bold">{inv.cashier_name || 'الكاشير'}</td>
                      <td className="p-3 text-slate-300">{inv.customer_name || 'عميل نقدي'}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          inv.payment_method === 'كاش'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : inv.payment_method === 'فيزا'
                            ? 'bg-blue-500/20 text-blue-300'
                            : inv.payment_method === 'إنستاباي'
                            ? 'bg-purple-500/20 text-purple-300'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}>
                          {inv.payment_method || 'كاش'}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-slate-300">{inv.items_count ?? (inv.items ? inv.items.length : 0)} صنف</td>
                      <td className="p-3 font-mono font-bold text-emerald-400" dir="ltr">
                        {(getInvoiceTotal(inv)).toFixed(2)} ج.م
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedInvoiceForModal(inv)}
                          className="px-2.5 py-1 rounded-lg bg-[#17233A] hover:bg-teal-500/20 text-teal-300 hover:text-white border border-[#23324D] text-[11px] font-bold flex items-center gap-1 mx-auto transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>معاينة الفاتورة</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Invoice Details Modal */}
      {selectedInvoiceForModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111A2B] border border-[#23324D] rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#23324D] pb-3">
              <div className="flex items-center gap-2 text-teal-400 font-bold text-sm">
                <FileText className="w-5 h-5" />
                <span>تفاصيل الفاتورة #{selectedInvoiceForModal.invoice_number || selectedInvoiceForModal.id}</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedInvoiceForModal(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-4 bg-[#0B1220] rounded-2xl border border-[#23324D] text-xs space-y-2 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">العميل:</span>
                <span className="text-white font-bold">{selectedInvoiceForModal.customer_name || 'عميل نقدي'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">الكاشير:</span>
                <span className="text-white font-bold">{selectedInvoiceForModal.cashier_name || 'الكاشير'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">طريقة الدفع:</span>
                <span className="text-teal-300 font-bold">{selectedInvoiceForModal.payment_method || 'كاش'}</span>
              </div>
              <div className="flex justify-between border-t border-[#23324D] pt-2">
                <span className="text-emerald-400 font-bold text-sm">صافي القيمة:</span>
                <span className="text-emerald-400 font-bold text-sm">{getInvoiceTotal(selectedInvoiceForModal).toFixed(2)} ج.م</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  window.print();
                  setSelectedInvoiceForModal(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-black flex items-center justify-center gap-2 cursor-pointer shadow-glow-teal"
              >
                <Printer className="w-4 h-4" />
                <span>إعادة طباعة الفاتورة</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedInvoiceForModal(null)}
                className="px-4 py-2.5 rounded-xl bg-[#17233A] text-slate-300 text-xs font-bold hover:bg-[#23324D]"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
