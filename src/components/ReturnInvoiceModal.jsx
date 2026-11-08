import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  Calendar,
  Clock,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  FileText,
  Filter,
  Layers,
  ChevronDown,
  Printer,
  Undo2,
  PackageCheck
} from 'lucide-react';
import { sqliteService } from '../db/sqliteService';
import { confirmDialog } from './ConfirmDialog';

export function ReturnInvoiceModal({
  isOpen,
  onClose,
  currentUser,
  currentShift,
  onRefundCompleted
}) {
  // Date and Time Range State (defaults to current day from 00:00 to 23:59)
  const todayStr = new Date().toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(todayStr);
  const [fromTime, setFromTime] = useState('00:00');
  const [toDate, setToDate] = useState(todayStr);
  const [toTime, setToTime] = useState('23:59');

  const [searchQuery, setSearchQuery] = useState('');
  const [invoices, setInvoices] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  // Selected Invoice for Refund Inspection
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [invoiceItems, setInvoiceItems] = useState([]);
  const [existingRefunds, setExistingRefunds] = useState([]);

  // Per-item refund quantities: { [itemId]: number }
  const [refundQuantities, setRefundQuantities] = useState({});
  const [refundReason, setRefundReason] = useState('طلب العميل (استرجاع)');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Search Invoices according to Date/Time and Query
  const fetchInvoices = async () => {
    setIsLoading(true);
    setError('');
    try {
      const fromDateTime = `${fromDate}T${fromTime}:00`;
      const toDateTime = `${toDate}T${toTime}:59`;

      const results = await sqliteService.searchInvoicesByDateRange({
        fromDateTime,
        toDateTime,
        searchQuery: searchQuery.trim(),
        limit: 100
      });
      setInvoices(results || []);
    } catch (err) {
      console.warn('Error fetching invoices for refund:', err);
      setError('تعذر تحميل الفواتير للفترة المحددة.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchInvoices();
    } else {
      setSelectedInvoice(null);
      setInvoiceItems([]);
      setExistingRefunds([]);
      setRefundQuantities({});
      setError('');
    }
  }, [isOpen]);

  // When an invoice is clicked to inspect/refund
  const handleSelectInvoice = async (inv) => {
    setSelectedInvoice(inv);
    setError('');
    try {
      const [items, allRefunds] = await Promise.all([
        sqliteService.getInvoiceItems(inv.id),
        sqliteService.getAllRefunds(300)
      ]);
      setInvoiceItems(items || []);

      const relatedRefunds = (allRefunds || []).filter(
        (r) => String(r.invoice_id) === String(inv.id)
      );
      setExistingRefunds(relatedRefunds);

      // Pre-calculate remaining quantities per item
      const previouslyRefundedMap = new Map();
      for (const ref of relatedRefunds) {
        let parsed = [];
        try { parsed = JSON.parse(ref.items_json || '[]'); } catch (e) {}
        for (const pi of parsed) {
          const uType = pi.unit_type || (pi.is_strip ? 'strip' : 'box');
          const key = `${Number(pi.medicine_id)}_${uType}`;
          previouslyRefundedMap.set(key, (previouslyRefundedMap.get(key) || 0) + (Number(pi.quantity) || 0));
        }
      }

      // Initialize refund quantities to 0 by default so user can choose 1 item or multiple
      const initialQtyMap = {};
      (items || []).forEach((it) => {
        const uType = it.unit_type || (it.is_strip ? 'strip' : 'box');
        const key = `${Number(it.medicine_id)}_${uType}`;
        const alreadyReturned = previouslyRefundedMap.get(key) || 0;
        const remaining = Math.max(0, (Number(it.quantity) || 0) - alreadyReturned);
        it._maxReturnable = remaining;
        it._alreadyReturned = alreadyReturned;
        initialQtyMap[it.id] = 0;
      });

      setRefundQuantities(initialQtyMap);
    } catch (e) {
      console.warn('Failed to load invoice items for refund:', e);
      setError('تعذر تحميل تفاصيل بنود الفاتورة.');
    }
  };

  // Quick action: Select ALL remaining items to refund entire invoice
  const handleSelectAllRemaining = () => {
    const updated = {};
    invoiceItems.forEach((it) => {
      updated[it.id] = it._maxReturnable || 0;
    });
    setRefundQuantities(updated);
  };

  // Quick action: Clear all selections
  const handleClearSelections = () => {
    const updated = {};
    invoiceItems.forEach((it) => {
      updated[it.id] = 0;
    });
    setRefundQuantities(updated);
  };

  // Change quantity for a single item
  const handleItemQtyChange = (itemId, val, max) => {
    const parsed = Math.max(0, Math.min(max, parseInt(val, 10) || 0));
    setRefundQuantities((prev) => ({
      ...prev,
      [itemId]: parsed
    }));
  };

  // Calculate current refund financial summary
  let totalRefundValue = 0;
  const itemsToSubmit = [];
  invoiceItems.forEach((it) => {
    const qty = refundQuantities[it.id] || 0;
    if (qty > 0) {
      const unitP = Number(it.unit_price) || 0;
      const lineTotal = unitP * qty;
      totalRefundValue += lineTotal;
      itemsToSubmit.push({
        medicine_id: it.medicine_id,
        is_strip: it.is_strip,
        unit_type: it.unit_type || (it.is_strip ? 'strip' : 'box'),
        quantity: qty,
        trade_name: it.trade_name,
        trade_name_ar: it.trade_name_ar,
        unit_price: unitP
      });
    }
  });

  // Calculate discount adjustment if the invoice had a discount
  const invoiceOrigTotal = Number(selectedInvoice?.total_retail || selectedInvoice?.total || 0);
  const invoiceOrigDiscount = Number(selectedInvoice?.discount || 0);
  let effectiveRefundAmount = totalRefundValue;
  if (invoiceOrigTotal > 0 && invoiceOrigDiscount > 0) {
    const discountRatio = invoiceOrigDiscount / (invoiceOrigTotal + invoiceOrigDiscount);
    effectiveRefundAmount = Math.max(0, totalRefundValue * (1 - discountRatio));
  }
  effectiveRefundAmount = Math.round(effectiveRefundAmount * 100) / 100;

  // Process Refund Submission
  const handleExecuteRefund = async () => {
    if (!selectedInvoice) return;
    if (itemsToSubmit.length === 0 || effectiveRefundAmount <= 0) {
      setError('يرجى تحديد كمية صنف واحد على الأقل لإرجاعه.');
      return;
    }

    if (!(await confirmDialog({
      title: 'تأكيد استرجاع الأصناف',
      message: `تأكيد استرجاع (${itemsToSubmit.length}) صنف بقيمة صافية (${effectiveRefundAmount.toFixed(2)} ج.م) ورد الأصناف للمخزن؟`,
      confirmLabel: 'استرجاع الأصناف',
      danger: true
    }))) {
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const res = await sqliteService.refundInvoice({
        invoice_id: selectedInvoice.id,
        items: itemsToSubmit,
        refund_amount: effectiveRefundAmount,
        reason: refundReason.trim() || 'طلب العميل (استرجاع)',
        cashier_name: currentUser?.full_name || currentUser?.name || 'الكاشير'
      });

      if (res && res.success) {
        setToastMessage(`✅ تم بنجاح استرجاع الأصناف وردها للمخزن (إيصال #${res.refundId})`);
        if (typeof onRefundCompleted === 'function') {
          await onRefundCompleted();
        }
        setTimeout(() => {
          setSelectedInvoice(null);
          fetchInvoices();
          setToastMessage('');
        }, 1200);
      }
    } catch (err) {
      console.error('Refund execution error:', err);
      setError(err?.message || 'حدث خطأ أثناء تسجيل المرتجع.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 select-none font-cairo">
      <div className="w-full max-w-5xl bg-[#111A2B] border border-[#23324D] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Top Header */}
        <div className="p-4 bg-[#141E30] border-b border-[#23324D] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-white text-base">استرجاع المبيعات والمرتجع المتقدم (بالتاريخ والوقت)</h3>
              <p className="text-xs text-slate-400">
                ابحث عن الفاتورة بالتاريخ الدقيق والساعة، واختر إرجاع صنف واحد، عدة أصناف، أو الفاتورة كاملة.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[#17233A] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-[#23324D] flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Date, Time & Search Filter Controls */}
        <div className="p-3 bg-[#111A2B] border-b border-[#23324D] flex flex-wrap items-center gap-2.5 text-xs">
          {/* From Date & Time */}
          <div className="flex items-center gap-1.5 bg-[#17233A] px-2.5 py-1.5 rounded-xl border border-[#23324D]">
            <span className="text-slate-400 font-bold">من:</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="bg-transparent text-white font-mono outline-none cursor-pointer"
            />
            <input
              type="time"
              value={fromTime}
              onChange={(e) => setFromTime(e.target.value)}
              className="bg-transparent text-teal-300 font-mono outline-none cursor-pointer border-r border-[#23324D] pr-2 mr-1"
            />
          </div>

          {/* To Date & Time */}
          <div className="flex items-center gap-1.5 bg-[#17233A] px-2.5 py-1.5 rounded-xl border border-[#23324D]">
            <span className="text-slate-400 font-bold">إلى:</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="bg-transparent text-white font-mono outline-none cursor-pointer"
            />
            <input
              type="time"
              value={toTime}
              onChange={(e) => setToTime(e.target.value)}
              className="bg-transparent text-teal-300 font-mono outline-none cursor-pointer border-r border-[#23324D] pr-2 mr-1"
            />
          </div>

          {/* Search by Invoice #, Medicine Name, Customer, etc. */}
          <div className="flex-1 min-w-[200px] relative">
            <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-teal-400 pointer-events-none" />
            <input
              type="text"
              placeholder="ابحث برقم الفاتورة، اسم الدواء، أو العميل..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') fetchInvoices(); }}
              className="w-full h-9 bg-[#17233A] border border-[#23324D] focus:border-teal-400 rounded-xl pr-9 pl-3 text-white outline-none font-semibold text-xs"
            />
          </div>

          {/* Filter Action Button */}
          <button
            type="button"
            onClick={fetchInvoices}
            className="h-9 px-4 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>بحث الفواتير</span>
          </button>
        </div>

        {/* Modal Main Body: 2 Columns (Invoices List on Right | Selected Invoice Items on Left) */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden divide-y md:divide-y-0 md:divide-x md:divide-x-reverse divide-[#23324D]">
          
          {/* Column 1: Found Invoices List */}
          <div className="w-full md:w-[42%] flex flex-col overflow-hidden bg-[#0E1524]">
            <div className="p-2.5 bg-[#141E30] border-b border-[#23324D] text-[11px] font-bold text-slate-300 flex items-center justify-between">
              <span>الفواتير المطابقة ({invoices.length})</span>
              <span className="text-slate-500">اضغط على الفاتورة لتحديد أصناف المرتجع</span>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {isLoading ? (
                <div className="py-16 text-center text-slate-400 text-xs animate-pulse">
                  جارٍ تحميل الفواتير...
                </div>
              ) : invoices.length === 0 ? (
                <div className="py-16 text-center text-slate-500 text-xs">
                  لا توجد فواتير مسجلة في هذا النطاق الزمني.
                </div>
              ) : (
                invoices.map((inv) => {
                  const isSelected = selectedInvoice?.id === inv.id;
                  const isFullyRefunded = inv.status === 'REFUNDED';
                  const dateStr = inv.date_time ? new Date(inv.date_time).toLocaleString('ar-EG', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  }) : '-';

                  return (
                    <div
                      key={inv.id}
                      onClick={() => handleSelectInvoice(inv)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer text-xs ${
                        isSelected
                          ? 'bg-rose-500/15 border-rose-500/50 shadow-md'
                          : isFullyRefunded
                          ? 'bg-[#141E30]/50 border-rose-900/30 opacity-60'
                          : 'bg-[#141E30] border-[#23324D] hover:border-slate-500'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold text-white text-xs font-mono">#{inv.id}</span>
                          <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono">
                            {inv.payment_method || 'كاش'}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-emerald-400 text-xs" dir="ltr">
                          {Number(inv.total_retail || inv.total || 0).toFixed(2)} EGP
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>العميل: <strong className="text-slate-300">{inv.customer_name || 'عميل نقدي'}</strong></span>
                        <span className="font-mono text-slate-500">{dateStr}</span>
                      </div>

                      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                        <span className="text-teal-300 font-medium">البائع: {inv.cashier_name || 'الكاشير'}</span>
                        <span>{inv.items_count ?? (inv.items ? inv.items.length : '-')} صنف</span>
                      </div>

                      {isFullyRefunded && (
                        <div className="mt-1 text-[10px] font-bold text-rose-400 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          <span>تم استرجاع كامل الفاتورة مسبقاً</span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Column 2: Detailed Items Selection & Refund Execution */}
          <div className="flex-1 flex flex-col overflow-hidden bg-[#111A2B]">
            {selectedInvoice ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                
                {/* Selected Invoice Banner */}
                <div className="p-3 bg-[#17233A] border-b border-[#23324D] flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div>
                    <span className="text-slate-400">الفاتورة المحددة: </span>
                    <strong className="text-white font-mono text-sm">#{selectedInvoice.id}</strong>
                    <span className="mx-2 text-slate-500">•</span>
                    <span className="text-slate-400">البائع (الكاشير): </span>
                    <strong className="text-teal-300 font-bold">👤 {selectedInvoice.cashier_name || 'الكاشير'}</strong>
                    <span className="mx-2 text-slate-500">•</span>
                    <span className="text-slate-400">العميل: </span>
                    <strong className="text-white">{selectedInvoice.customer_name || 'نقدي'}</strong>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllRemaining}
                      className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                    >
                      إرجاع الفاتورة بالكامل
                    </button>
                    <button
                      type="button"
                      onClick={handleClearSelections}
                      className="px-2.5 py-1 bg-[#141E30] hover:bg-slate-700 text-slate-400 rounded-lg text-[11px] transition-colors cursor-pointer"
                    >
                      تصفير التحديد
                    </button>
                  </div>
                </div>

                {/* Items Table for Returning */}
                <div className="flex-1 overflow-y-auto p-3">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-[#141E30] text-slate-300 border-b border-[#23324D] font-bold sticky top-0 z-10">
                      <tr>
                        <th className="p-2.5">اسم الصنف</th>
                        <th className="p-2.5 text-center">الوحدة</th>
                        <th className="p-2.5 text-center">الكمية المباعة</th>
                        <th className="p-2.5 text-center">المسترجع سابقاً</th>
                        <th className="p-2.5 text-center">المتاح للإرجاع</th>
                        <th className="p-2.5 text-center">سعر الوحدة</th>
                        <th className="p-2.5 text-center w-24">الكمية المرتجعة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#23324D]/60 font-medium">
                      {invoiceItems.length === 0 ? (
                        <tr>
                          <td colSpan="7" className="py-12 text-center text-slate-500">
                            لا توجد بنود متاحة في هذه الفاتورة.
                          </td>
                        </tr>
                      ) : (
                        invoiceItems.map((it) => {
                          const maxRet = it._maxReturnable || 0;
                          const currentQty = refundQuantities[it.id] || 0;
                          const uType = it.unit_type || (it.is_strip ? 'strip' : 'box');
                          const unitLabel = uType === 'box' ? 'علبة' : uType === 'strip' ? 'شريط' : 'وحدة/قرص';

                          return (
                            <tr key={it.id} className={currentQty > 0 ? 'bg-rose-500/10' : 'hover:bg-[#17233A]/50'}>
                              <td className="p-2.5">
                                <div className="font-bold text-white text-xs">{it.trade_name_ar || it.trade_name}</div>
                                <div className="text-[10px] text-slate-400 font-mono">{it.trade_name}</div>
                              </td>
                              <td className="p-2.5 text-center font-bold text-teal-300">{unitLabel}</td>
                              <td className="p-2.5 text-center font-mono font-bold text-slate-300">{it.quantity}</td>
                              <td className="p-2.5 text-center font-mono text-slate-500">{it._alreadyReturned || 0}</td>
                              <td className="p-2.5 text-center font-mono font-bold text-emerald-400">{maxRet}</td>
                              <td className="p-2.5 text-center font-mono text-white" dir="ltr">
                                {Number(it.unit_price || 0).toFixed(2)}
                              </td>
                              <td className="p-2.5 text-center">
                                {maxRet > 0 ? (
                                  <div className="flex items-center justify-center gap-1">
                                    <input
                                      type="number"
                                      min="0"
                                      max={maxRet}
                                      value={currentQty}
                                      onChange={(e) => handleItemQtyChange(it.id, e.target.value, maxRet)}
                                      className="w-16 h-8 bg-[#17233A] border border-rose-500/40 focus:border-rose-400 rounded-lg text-center font-mono font-bold text-white outline-none"
                                    />
                                    {currentQty < maxRet && (
                                      <button
                                        type="button"
                                        onClick={() => handleItemQtyChange(it.id, maxRet, maxRet)}
                                        className="text-[10px] text-teal-400 hover:text-teal-300 underline font-bold"
                                        title="إرجاع الكل"
                                      >
                                        الكل
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-slate-500 font-bold">مسترجع بالكامل</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Refund Execution Bar */}
                <div className="p-3.5 bg-[#141E30] border-t border-[#23324D] space-y-3">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <label className="text-slate-400 font-bold shrink-0">سبب المرتجع:</label>
                      <input
                        type="text"
                        value={refundReason}
                        onChange={(e) => setRefundReason(e.target.value)}
                        placeholder="اكتب سبب المرتجع..."
                        className="flex-1 sm:w-64 h-9 bg-[#17233A] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 text-white outline-none text-xs"
                      />
                    </div>

                    <div className="flex items-center gap-4 font-mono">
                      <div className="text-slate-400">
                        الأصناف المحددة: <strong className="text-white font-bold">{itemsToSubmit.length}</strong>
                      </div>
                      <div className="text-slate-400">
                        صافي قيمة المرتجع المستردة: <strong className="text-rose-400 font-black text-sm" dir="ltr">{effectiveRefundAmount.toFixed(2)} EGP</strong>
                      </div>
                    </div>
                  </div>

                  {error && (
                    <div className="text-xs font-bold text-rose-400 flex items-center gap-1.5 animate-in fade-in">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  {toastMessage && (
                    <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 animate-in fade-in">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{toastMessage}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setSelectedInvoice(null)}
                      className="px-4 py-2.5 rounded-xl bg-[#17233A] hover:bg-[#202E4C] text-white text-xs font-semibold cursor-pointer"
                    >
                      إلغاء التحديد
                    </button>

                    <button
                      type="button"
                      onClick={handleExecuteRefund}
                      disabled={isSubmitting || itemsToSubmit.length === 0}
                      className={`px-6 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
                        itemsToSubmit.length > 0 && !isSubmitting
                          ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/50'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>تأكيد المرتجع ورد البضاعة للمخزن ({itemsToSubmit.length} صنف)</span>
                    </button>
                  </div>
                </div>

              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500">
                <FileText className="w-12 h-12 text-slate-600 mb-3" />
                <h4 className="font-bold text-slate-300 text-sm mb-1">لم يتم اختيار فاتورة بعد</h4>
                <p className="text-xs max-w-sm text-slate-500">
                  حدد نطاق التاريخ والوقت واضغط [بحث الفواتير]، ثم انقر على أي فاتورة من القائمة لإرجاع صنف منها أو إرجاعها كلها.
                </p>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
