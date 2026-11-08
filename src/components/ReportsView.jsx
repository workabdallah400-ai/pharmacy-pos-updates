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
  Coins,
  RotateCcw
} from 'lucide-react';
import { hasPermission } from '../utils/permissions';
import { sqliteService } from '../db/sqliteService';
import { ReturnInvoiceModal } from './ReturnInvoiceModal';
import { confirmDialog } from './ConfirmDialog';

export function ReportsView({ currentUser }) {
  const [invoices, setInvoices] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [topSellers, setTopSellers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('ALL');

  // Date range filters for invoices log.
  // Default to TODAY so the headline "إجمالي مبيعات اليوم" really is today's
  // figure. It used to sum the last 200 invoices regardless of date, which made
  // the number cumulative on any pharmacy that had been running for a while.
  const todayKey = () => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  };
  const [fromDate, setFromDate] = useState(todayKey);
  const [toDate, setToDate] = useState(todayKey);

  const [selectedInvoiceForModal, setSelectedInvoiceForModal] = useState(null);
  const [modalInvoiceItems, setModalInvoiceItems] = useState([]);
  const [modalInvoiceRefunds, setModalInvoiceRefunds] = useState([]);
  const [isLoadingModalItems, setIsLoadingModalItems] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const canRefund = hasPermission(currentUser, 'canRefund');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const openInvoicePreview = async (inv) => {
    setSelectedInvoiceForModal(inv);
    setIsLoadingModalItems(true);
    setModalInvoiceItems([]);
    try {
      const [refs, items] = await Promise.all([
        sqliteService.getInvoiceRefunds(inv.id),
        sqliteService.getInvoiceItems(inv.id)
      ]);
      setModalInvoiceRefunds(refs || []);
      setModalInvoiceItems(items || []);
    } catch (e) {
      setModalInvoiceRefunds([]);
      setModalInvoiceItems([]);
    } finally {
      setIsLoadingModalItems(false);
    }
  };

  // Load Invoices and Refunds from SQLite on mount
  useEffect(() => {
    let isCurrent = true;
    const fetchData = async () => {
      try {
        const [dbInvoices, dbRefunds] = await Promise.all([
          sqliteService.getInvoices(200),
          sqliteService.getAllRefunds(300)
        ]);
        if (isCurrent) {
          if (dbInvoices) setInvoices(dbInvoices);
          if (dbRefunds) setRefunds(dbRefunds);
        }
      } catch (err) {
        console.warn('SQLite data fetch error:', err);
      }
    };
    fetchData();
    return () => { isCurrent = false; };
  }, []);

  // Financial Stats Computations
  const getInvoiceTotal = (inv) => Number(inv.total_retail ?? inv.net_total ?? inv.total ?? 0) || 0;
  const getInvoiceCost = (inv) => {
    const explicit = Number(inv.total_cost ?? inv.cost_total);
    return Number.isFinite(explicit) && explicit > 0 ? explicit : getInvoiceTotal(inv) * 0.75;
  };
  const getInvoiceProfit = (inv) => {
    const explicit = Number(inv.total_profit);
    return Number.isFinite(explicit) && explicit !== 0 ? explicit : Math.max(0, getInvoiceTotal(inv) - getInvoiceCost(inv));
  };

  // Invoices inside the selected range (defaults to today). Every headline
  // figure below is computed from this set, not from the whole history.
  const dayKeyOf = (row) => {
    const raw = row.created_at || row.date_time || row.date || '';
    return String(raw).slice(0, 10);
  };
  const inRange = (row) => {
    const key = dayKeyOf(row);
    if (!key) return false;
    if (fromDate && key < fromDate) return false;
    if (toDate && key > toDate) return false;
    return true;
  };

  const scopedInvoices = invoices.filter(inRange);
  const scopedRefunds = refunds.filter(inRange);

  // Compute refunds breakdown by payment method
  let totalRefundsAmount = 0;
  let cashRefunds = 0;
  let visaRefunds = 0;
  let instapayRefunds = 0;
  let creditRefunds = 0;

  for (const ref of scopedRefunds) {
    const refAmount = Number(ref.refund_amount) || 0;
    totalRefundsAmount += refAmount;
    const method = String(ref.payment_method || 'كاش');

    if (method === 'كاش') {
      cashRefunds += refAmount;
    } else if (method === 'فيزا') {
      visaRefunds += refAmount;
    } else if (method === 'إنستاباي') {
      instapayRefunds += refAmount;
    } else if (method === 'آجل') {
      creditRefunds += refAmount;
    } else if (method === 'مختلط') {
      const invPaidCash = Math.max(0, Number(ref.paid_cash) || 0);
      const invPaidCredit = Math.max(0, Number(ref.paid_credit) || 0);
      const invPaidCard = Math.max(0, Number(ref.paid_card) || 0);
      const denom = (invPaidCash + invPaidCredit + invPaidCard) || Number(ref.invoice_total) || 1;

      cashRefunds += refAmount * (invPaidCash / denom);
      creditRefunds += refAmount * (invPaidCredit / denom);
      visaRefunds += refAmount * (invPaidCard / denom);
    } else {
      cashRefunds += refAmount;
    }
  }

  // Gross invoice totals
  const grossSales = scopedInvoices.reduce((acc, inv) => acc + getInvoiceTotal(inv), 0);
  const totalCost = scopedInvoices.reduce((acc, inv) => acc + getInvoiceCost(inv), 0);
  const grossProfit = scopedInvoices.reduce((acc, inv) => acc + getInvoiceProfit(inv), 0);

  // Net totals (gross invoices minus all refunds)
  const totalSales = Math.max(0, grossSales - totalRefundsAmount);
  // Profit after deducting refunded profit proportion
  const profitMargin = grossSales > 0 ? (grossProfit / grossSales) : 0.25;
  const netProfit = grossProfit - (totalRefundsAmount * profitMargin);

  const invoicesCount = scopedInvoices.length;
  const avgInvoiceValue = invoicesCount > 0 ? totalSales / invoicesCount : 0;

  const grossCash = scopedInvoices.reduce((acc, i) => {
    if (i.payment_method === 'كاش') return acc + getInvoiceTotal(i);
    if (i.payment_method === 'مختلط') return acc + (Number(i.paid_cash) || 0);
    return acc;
  }, 0);
  const grossVisa = scopedInvoices.filter((i) => i.payment_method === 'فيزا').reduce((acc, i) => acc + getInvoiceTotal(i), 0);
  const grossInstapay = scopedInvoices.filter((i) => i.payment_method === 'إنستاباي').reduce((acc, i) => acc + getInvoiceTotal(i), 0);
  const grossCredit = scopedInvoices.reduce((acc, i) => {
    if (i.payment_method === 'آجل') return acc + getInvoiceTotal(i);
    if (i.payment_method === 'مختلط') return acc + (Number(i.paid_credit) || 0);
    return acc;
  }, 0);

  const cashSales = Math.max(0, grossCash - cashRefunds);
  const visaSales = Math.max(0, grossVisa - visaRefunds);
  const instapaySales = Math.max(0, grossInstapay - instapayRefunds);
  const creditSales = Math.max(0, grossCredit - creditRefunds);

  // Filtered invoices
  const filteredInvoices = invoices.filter((inv) => {
    if (paymentFilter !== 'ALL' && inv.payment_method !== paymentFilter) return false;

    // Filter by Date Range (e.g. from 2026-10-01 to 2026-10-02)
    const invDateStr = inv.created_at || inv.date_time || '';
    if (fromDate) {
      const invDay = invDateStr.slice(0, 10);
      if (invDay < fromDate) return false;
    }
    if (toDate) {
      const invDay = invDateStr.slice(0, 10);
      if (invDay > toDate) return false;
    }

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
              <span className="text-xs text-slate-400 font-medium block mb-1">
                {fromDate === toDate && fromDate === todayKey() ? 'إجمالي مبيعات اليوم' : 'إجمالي المبيعات (الفترة المحددة)'}
              </span>
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

        {/* 2. Search & Payment & Date Filter Bar */}
        <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl p-3.5 space-y-3 shadow-sm">
          <div className="flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-teal-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث برقم الفاتورة، اسم العميل، أو الكاشير..."
                className="w-full h-10 bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl pr-10 pl-4 text-xs text-white outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 text-xs flex-wrap w-full md:w-auto justify-end">
              <span className="text-slate-400 text-[11px] ml-1">تصفية:</span>
              {['ALL', 'كاش', 'فيزا', 'إنستاباي', 'آجل', 'مختلط'].map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentFilter(method)}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
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

          {/* Date Range Search Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#23324D]/60 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-teal-300 font-bold flex items-center gap-1 text-[11px]">
                <Calendar className="w-3.5 h-3.5 text-teal-400" />
                <span>بحث الفواتير بالتاريخ:</span>
              </span>

              <div className="flex items-center gap-1 bg-[#0B1220] px-2.5 py-1 rounded-xl border border-[#23324D]">
                <span className="text-slate-400 text-[11px]">من:</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="bg-transparent text-white font-mono text-xs outline-none cursor-pointer"
                />
              </div>

              <div className="flex items-center gap-1 bg-[#0B1220] px-2.5 py-1 rounded-xl border border-[#23324D]">
                <span className="text-slate-400 text-[11px]">إلى:</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="bg-transparent text-white font-mono text-xs outline-none cursor-pointer"
                />
              </div>

              {(fromDate || toDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setFromDate('');
                    setToDate('');
                  }}
                  className="text-[11px] text-rose-400 hover:text-rose-300 font-bold underline px-1 cursor-pointer"
                >
                  إلغاء تصفية التاريخ
                </button>
              )}
            </div>

            <div className="text-[11px] text-slate-400 font-mono">
              عثر على: <strong className="text-teal-300">{filteredInvoices.length}</strong> فاتورة
            </div>
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
            {canRefund && (
              <button
                type="button"
                onClick={() => setShowReturnModal(true)}
                className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>شاشة المرتجع بالتاريخ والوقت</span>
              </button>
            )}
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
                    <tr
                      key={inv.id || idx}
                      onClick={() => openInvoicePreview(inv)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openInvoicePreview(inv);
                        }
                      }}
                      tabIndex={0}
                      className="hover:bg-[#17233A]/70 transition-colors cursor-pointer focus:outline-none focus:bg-[#17233A]"
                    >
                      <td className="p-3 font-mono font-bold text-teal-300">#{inv.invoice_number || inv.id}</td>
                      <td className="p-3 font-mono text-slate-400">
                        {inv.created_at ? new Date(inv.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '-'}
                      </td>
                      <td className="p-3 text-white font-bold">{inv.cashier_name || 'الكاشير'}</td>
                      <td className="p-3 text-slate-300">{inv.customer_name || 'عميل نقدي'}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            inv.payment_method === 'كاش'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : inv.payment_method === 'فيزا'
                              ? 'bg-blue-500/20 text-blue-300'
                              : inv.payment_method === 'إنستاباي'
                              ? 'bg-purple-500/20 text-purple-300'
                              : inv.payment_method === 'مختلط'
                              ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}>
                            {inv.payment_method || 'كاش'}
                          </span>
                          {inv.status === 'REFUNDED' && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-rose-500/25 text-rose-300 border border-rose-500/40">
                              مرتجع
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 font-mono text-slate-300">{inv.items_count ?? (inv.items ? inv.items.length : 0)} صنف</td>
                      <td className="p-3 font-mono font-bold text-emerald-400" dir="ltr">
                        {(getInvoiceTotal(inv)).toFixed(2)} ج.م
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openInvoicePreview(inv);
                          }}
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 select-none animate-in fade-in duration-200">
          <div className="bg-[#111A2B] border border-[#23324D] rounded-3xl w-full max-w-2xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden">
            
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-[#23324D] flex items-center justify-between bg-[#17233A]/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">معاينة تفاصيل الفاتورة #{selectedInvoiceForModal.invoice_number || selectedInvoiceForModal.id}</h3>
                  <p className="text-xs text-slate-400">
                    تاريخ ووقت الفاتورة: {selectedInvoiceForModal.created_at ? new Date(selectedInvoiceForModal.created_at).toLocaleString('ar-EG') : '-'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedInvoiceForModal(null)}
                className="w-8 h-8 rounded-xl bg-[#17233A] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-[#23324D] flex items-center justify-center transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              
              {/* Meta Card: Who sold it, Customer, Payment */}
              <div className="p-3.5 bg-[#0B1220] rounded-2xl border border-[#23324D] text-xs grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
                <div className="bg-[#111A2B] p-2.5 rounded-xl border border-[#23324D]">
                  <span className="text-slate-400 block text-[11px] mb-1">المسؤول عن البيع (الكاشير):</span>
                  <span className="text-teal-300 font-bold text-sm block truncate">
                    👤 {selectedInvoiceForModal.cashier_name || 'الكاشير'}
                  </span>
                </div>

                <div className="bg-[#111A2B] p-2.5 rounded-xl border border-[#23324D]">
                  <span className="text-slate-400 block text-[11px] mb-1">العميل:</span>
                  <span className="text-white font-bold text-sm block truncate">
                    {selectedInvoiceForModal.customer_name || 'عميل نقدي'}
                  </span>
                </div>

                <div className="bg-[#111A2B] p-2.5 rounded-xl border border-[#23324D]">
                  <span className="text-slate-400 block text-[11px] mb-1">طريقة الدفع:</span>
                  <span className="text-emerald-400 font-bold text-sm block">
                    {selectedInvoiceForModal.payment_method || 'كاش'}
                  </span>
                </div>

                <div className="bg-[#111A2B] p-2.5 rounded-xl border border-[#23324D]">
                  <span className="text-slate-400 block text-[11px] mb-1">حالة الفاتورة:</span>
                  <span className={`font-bold text-sm block ${selectedInvoiceForModal.status === 'REFUNDED' ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {selectedInvoiceForModal.status === 'REFUNDED' ? 'تم استرجاعها' : 'مكتملة ومسددة'}
                  </span>
                </div>
              </div>

              {selectedInvoiceForModal.payment_method === 'مختلط' && (
                <div className="text-xs bg-[#111A2B] p-2.5 rounded-xl border border-teal-500/30 flex justify-between font-mono">
                  <span className="text-slate-400">تفصيل السداد المختلط:</span>
                  <span className="text-teal-300 font-bold">
                    كاش: {Number(selectedInvoiceForModal.paid_cash || 0).toFixed(2)} | آجل: {Number(selectedInvoiceForModal.paid_credit || 0).toFixed(2)}
                    {Number(selectedInvoiceForModal.paid_card || 0) > 0 ? ` | كارد: ${Number(selectedInvoiceForModal.paid_card).toFixed(2)}` : ''} ج.م
                  </span>
                </div>
              )}

              {/* Items List Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <ShoppingBag className="w-4 h-4 text-teal-400" />
                    <span>الأصناف المباعة في الفاتورة ({modalInvoiceItems.length} صنف):</span>
                  </span>
                  {selectedInvoiceForModal.discount > 0 && (
                    <span className="text-rose-400 font-mono text-[11px] font-bold">
                      خصم مطبق على الفاتورة: -{Number(selectedInvoiceForModal.discount).toFixed(2)} ج.م
                    </span>
                  )}
                </div>

                <div className="border border-[#23324D] rounded-2xl overflow-hidden bg-[#0B1220]">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-[#141E30] text-slate-300 border-b border-[#23324D] font-bold">
                      <tr>
                        <th className="p-2.5">اسم الصنف</th>
                        <th className="p-2.5 text-center">الوحدة</th>
                        <th className="p-2.5 text-center">الكمية</th>
                        <th className="p-2.5 text-center">سعر الوحدة</th>
                        <th className="p-2.5 text-left">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#23324D]/60 font-medium">
                      {isLoadingModalItems ? (
                        <tr>
                          <td colSpan="5" className="p-6 text-center text-slate-400 font-mono">
                            جاري تحميل بنود الفاتورة...
                          </td>
                        </tr>
                      ) : modalInvoiceItems.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="p-6 text-center text-slate-500">
                            لا توجد أصناف مسجلة لهذه الفاتورة
                          </td>
                        </tr>
                      ) : (
                        modalInvoiceItems.map((it, idx) => {
                          const uType = it.unit_type || (it.is_strip ? 'strip' : 'box');
                          const unitLabel = uType === 'box' ? 'علبة' : uType === 'strip' ? 'شريط' : 'وحدة/قرص';
                          return (
                            <tr key={it.id || idx} className="hover:bg-[#17233A]/50">
                              <td className="p-2.5">
                                <div className="font-bold text-white text-xs">{it.trade_name_ar || it.trade_name}</div>
                                {it.trade_name && it.trade_name !== it.trade_name_ar && (
                                  <div className="text-[10px] text-slate-400 font-mono" dir="ltr">{it.trade_name}</div>
                                )}
                              </td>
                              <td className="p-2.5 text-center">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#17233A] text-teal-300 border border-[#23324D]">
                                  {unitLabel}
                                </span>
                              </td>
                              <td className="p-2.5 text-center font-mono font-bold text-white">
                                {it.quantity}
                              </td>
                              <td className="p-2.5 text-center font-mono text-slate-300" dir="ltr">
                                {Number(it.unit_price || 0).toFixed(2)}
                              </td>
                              <td className="p-2.5 text-left font-mono font-bold text-emerald-400" dir="ltr">
                                {Number(it.total_price || (it.unit_price * it.quantity) || 0).toFixed(2)} ج.م
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Refunds if any */}
              {modalInvoiceRefunds.length > 0 && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl space-y-1.5 text-xs">
                  <div className="text-rose-400 font-bold flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>مرتجعات مسجلة لهذه الفاتورة:</span>
                  </div>
                  {modalInvoiceRefunds.map((ref, idx) => (
                    <div key={ref.id || idx} className="flex justify-between text-slate-300 font-mono text-[11px] bg-[#111A2B]/60 p-1.5 rounded-lg border border-rose-500/20">
                      <span>{new Date(ref.date_time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })} ({ref.reason})</span>
                      <span className="font-bold text-rose-300">-{Number(ref.refund_amount).toFixed(2)} ج.م</span>
                    </div>
                  ))}
                  <div className="border-t border-rose-500/20 pt-1 flex justify-between font-bold text-rose-400 text-xs">
                    <span>إجمالي المرتجع:</span>
                    <span>-{modalInvoiceRefunds.reduce((s, r) => s + (Number(r.refund_amount) || 0), 0).toFixed(2)} ج.م</span>
                  </div>
                </div>
              )}

              {/* Total Summary */}
              <div className="p-3 bg-[#0B1220] rounded-2xl border border-[#23324D] flex justify-between items-center font-mono">
                <span className="text-slate-400 font-bold text-xs">صافي قيمة الفاتورة:</span>
                <span className="text-emerald-400 font-black text-base" dir="ltr">
                  {getInvoiceTotal(selectedInvoiceForModal).toFixed(2)} ج.م
                </span>
              </div>

            </div>

            {/* Actions Footer */}
            <div className="p-4 bg-[#141E30] border-t border-[#23324D] flex gap-2">
              <button
                type="button"
                onClick={() => {
                  window.print();
                  setSelectedInvoiceForModal(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-black flex items-center justify-center gap-2 cursor-pointer shadow-glow-teal"
              >
                <Printer className="w-4 h-4" />
                <span>إعادة طباعة</span>
              </button>

              {canRefund && selectedInvoiceForModal.status !== 'REFUNDED' && (
                <button
                  type="button"
                  onClick={async () => {
                    const alreadyRefunded = modalInvoiceRefunds.reduce((s, r) => s + (Number(r.refund_amount) || 0), 0);
                    const remainingToRefund = Math.max(0, getInvoiceTotal(selectedInvoiceForModal) - alreadyRefunded);
                    if (remainingToRefund <= 0) {
                      alert('تم استرجاع هذه الفاتورة بالكامل مسبقاً.');
                      return;
                    }
                    if (!(await confirmDialog({
                      title: 'تأكيد استرجاع الفاتورة',
                      message: `هل أنت متأكد من استرجاع الفاتورة #${selectedInvoiceForModal.invoice_number || selectedInvoiceForModal.id} بقيمة ${remainingToRefund.toFixed(2)} ج.م ورد البضاعة للمخزن والمبلغ للعميل؟`,
                      confirmLabel: 'استرجاع الفاتورة',
                      danger: true
                    }))) return;
                    try {
                      const items = await sqliteService.getInvoiceItems(selectedInvoiceForModal.id);
                      await sqliteService.refundInvoice({
                        invoice_id: selectedInvoiceForModal.id,
                        items,
                        refund_amount: remainingToRefund,
                        reason: 'استرجاع الفاتورة من شاشة التقارير',
                        cashier_name: currentUser?.full_name || selectedInvoiceForModal.cashier_name || 'الكاشير'
                      });
                      showToast('تم استرجاع الفاتورة ورد الأصناف للمخزن وخصم القيمة بنجاح 🔄');
                      setSelectedInvoiceForModal(null);
                      const [freshInvoices, freshRefunds] = await Promise.all([
                        sqliteService.getInvoices(200),
                        sqliteService.getAllRefunds(300)
                      ]);
                      setInvoices(freshInvoices || []);
                      setRefunds(freshRefunds || []);
                    } catch (e) {
                      alert('خطأ في إتمام المرتجع: ' + (e.message || e));
                    }
                  }}
                  className="py-2.5 px-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                  title="استرجاع الفاتورة ورد المخزون والفلوس"
                >
                  <span>🔄 مرتجع بيع</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setSelectedInvoiceForModal(null)}
                className="px-5 py-2.5 rounded-xl bg-[#17233A] text-slate-300 text-xs font-bold hover:bg-[#23324D] cursor-pointer"
              >
                إغلاق
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Advanced Return / Refund Modal by Date & Time */}
      <ReturnInvoiceModal
        isOpen={showReturnModal}
        onClose={() => setShowReturnModal(false)}
        currentUser={currentUser}
        onRefundCompleted={async () => {
          const [freshInvoices, freshRefunds] = await Promise.all([
            sqliteService.getInvoices(200),
            sqliteService.getAllRefunds(300)
          ]);
          setInvoices(freshInvoices || []);
          setRefunds(freshRefunds || []);
        }}
      />

    </div>
  );
}
