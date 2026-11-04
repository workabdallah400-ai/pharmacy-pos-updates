import React, { useState, useMemo, useEffect } from 'react';
import {
  Hourglass,
  AlertOctagon,
  AlertTriangle,
  Clock,
  Calendar,
  DollarSign,
  Search,
  Filter,
  Printer,
  Truck,
  Edit3,
  Trash2,
  CheckCircle2,
  XCircle,
  Eye,
  Sparkles,
  ShieldAlert,
  Flame,
  ArrowUpDown
} from 'lucide-react';
import { EditBatchModal } from './EditBatchModal';
import { ExpiryReportModal } from './ExpiryReportModal';
import { playBarcodeBeep, playCashDrawerSound } from '../utils/sound';
import { sqliteService } from '../db/sqliteService';

export function ExpiryView({
  suppliers,
  onReturnToSupplier, // optional callback to reduce debt
  onDeductMedicineStock // optional callback
}) {
  const [batches, setBatches] = useState([]);

  // Load real batches from received purchase invoices
  useEffect(() => {
    let cancelled = false;
    sqliteService.getExpiryBatches()
      .then((rows) => {
        if (!cancelled) setBatches(rows || []);
      })
      .catch((e) => console.warn('Failed to load expiry batches:', e));
    return () => { cancelled = true; };
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('ALL');
  const [periodFilter, setPeriodFilter] = useState('ALL'); // 'ALL', 'EXPIRED', 'MONTH_1', 'MONTH_3', 'MONTH_6'

  // Selected batches for return
  const [selectedBatchIds, setSelectedBatchIds] = useState(new Set());

  // Modals state
  const [editingBatch, setEditingBatch] = useState(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Helper to calculate days remaining from current date
  const getDaysRemaining = (expiryDateStr) => {
    if (!expiryDateStr) return 999;
    const now = new Date();
    const exp = new Date(expiryDateStr);
    const diffTime = exp.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  // 1. Calculate Expiry Statistics
  const stats = useMemo(() => {
    let expiredCount = 0;
    let month1Count = 0;
    let month3Count = 0;
    let month6Count = 0;

    let totalAtRiskCost = 0;
    let totalAtRiskRetail = 0;

    batches.forEach((b) => {
      const days = getDaysRemaining(b.expiry_date);
      const boxes = b.quantity_boxes || 0;
      const unitCost = b.cost_box || (b.price_box * 0.75);
      const unitRetail = b.price_box || 0;

      if (days < 0) {
        expiredCount++;
        totalAtRiskCost += boxes * unitCost;
        totalAtRiskRetail += boxes * unitRetail;
      } else if (days <= 30) {
        month1Count++;
        totalAtRiskCost += boxes * unitCost;
        totalAtRiskRetail += boxes * unitRetail;
      } else if (days <= 90) {
        month3Count++;
        totalAtRiskCost += boxes * unitCost;
        totalAtRiskRetail += boxes * unitRetail;
      } else if (days <= 180) {
        month6Count++;
        totalAtRiskCost += boxes * unitCost;
        totalAtRiskRetail += boxes * unitRetail;
      }
    });

    return {
      expiredCount,
      month1Count,
      month3Count,
      month6Count,
      totalAtRiskCost,
      totalAtRiskRetail
    };
  }, [batches]);

  // 2. Filter & Search Logic
  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      // Search
      const q = searchQuery.trim().toLowerCase();
      if (q) {
        const matchesName =
          String(b.trade_name || '').toLowerCase().includes(q) ||
          String(b.trade_name_ar || '').includes(q) ||
          String(b.generic_name || '').toLowerCase().includes(q) ||
          String(b.batch_no || '').toLowerCase().includes(q) ||
          String(b.shelf || '').toLowerCase().includes(q);

        if (!matchesName) return false;
      }

      // Supplier
      if (supplierFilter !== 'ALL') {
        if (!b.supplier_name?.includes(supplierFilter)) {
          return false;
        }
      }

      // Period Filter
      const days = getDaysRemaining(b.expiry_date);
      if (periodFilter === 'EXPIRED') {
        return days < 0;
      }
      if (periodFilter === 'MONTH_1') {
        return days >= 0 && days <= 30;
      }
      if (periodFilter === 'MONTH_3') {
        return days > 30 && days <= 90;
      }
      if (periodFilter === 'MONTH_6') {
        return days > 90 && days <= 180;
      }

      return true;
    });
  }, [batches, searchQuery, supplierFilter, periodFilter]);

  // Selection toggle
  const toggleSelect = (id) => {
    setSelectedBatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedBatchIds.size === filteredBatches.length) {
      setSelectedBatchIds(new Set());
    } else {
      setSelectedBatchIds(new Set(filteredBatches.map((b) => b.id)));
    }
  };

  // Save edited batch
  const handleSaveBatch = async (updated) => {
    try {
      await sqliteService.updatePurchaseItemBatch(updated.id, updated);
    } catch (e) {
      console.warn('Failed to update batch:', e);
      showToast('تعذر حفظ تعديلات التشغيلة في قاعدة البيانات');
      return;
    }
    setBatches((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    showToast(`تم تحديث بيانات التشغيلة (${updated.batch_no}) بنجاح`);
    playBarcodeBeep();
  };

  // Destroy / Dispose of Batch (إتلاف وإعدام)
  const handleDisposeBatch = async (batch) => {
    const confirm = window.confirm(
      `هل أنت متأكد من رغبتك في إتلاف وإعدام تشغيلة (${batch.trade_name_ar || batch.trade_name}) رقم (${batch.batch_no}) وإخراجها من رصيد المخزن نهائياً؟`
    );
    if (!confirm) return;

    try {
      await sqliteService.deletePurchaseItem(batch.id);
    } catch (e) {
      console.warn('Failed to dispose batch:', e);
      showToast('تعذر إتلاف التشغيلة من قاعدة البيانات');
      return;
    }

    setBatches((prev) => prev.filter((b) => b.id !== batch.id));
    if (onDeductMedicineStock) {
      onDeductMedicineStock(batch.medicine_id, batch.quantity_boxes);
    }
    try {
      await sqliteService.recordSupplierReturn({
        supplierName: batch.supplier_name || 'مخزن الصيدلية',
        amount: (Number(batch.cost_box) || Number(batch.price_box) || 0) * (Number(batch.quantity_boxes) || 0),
        itemsCount: Number(batch.quantity_boxes) || 0,
        kind: 'DISPOSAL',
        details: `إتلاف تشغيلة ${batch.batch_no || ''} - ${batch.trade_name_ar || batch.trade_name || ''}`
      });
    } catch (e) {}
    showToast(`تم إتلاف التشغيلة وإخراجها من رصيد المخزن بنجاح 🗑️`);
    playBarcodeBeep();
  };

  // Convert Selected to Supplier Return Note (تحويل إلى مرتجع مورد)
  const handleConvertToSupplierReturn = async () => {
    const targetBatches =
      selectedBatchIds.size > 0
        ? batches.filter((b) => selectedBatchIds.has(b.id))
        : filteredBatches;

    if (targetBatches.length === 0) {
      showToast('يرجى تحديد تشغيلة واحدة على الأقل لعمل مرتجع');
      return;
    }

    const totalReturnAmount = targetBatches.reduce((sum, b) => {
      const cost = (b.cost_box || b.price_box * 0.75) * (b.quantity_boxes || 0);
      return sum + cost;
    }, 0);

    const supName = targetBatches[0]?.supplier_name || 'شركة التوزيع';

    const confirm = window.confirm(
      `تأكيد تحويل (${targetBatches.length}) تشغيلة بإجمالي قيمة (${totalReturnAmount.toFixed(
        2
      )} ج.م) كمرتجع رسمي لـ [${supName}] وخصمها من المديونية؟`
    );
    if (!confirm) return;

    // Remove returned batches from active inventory (and from persisted purchase items)
    const returnedIds = new Set(targetBatches.map((b) => b.id));
    try {
      await Promise.all(targetBatches.map((b) => sqliteService.deletePurchaseItem(b.id)));
    } catch (e) {
      console.warn('Failed to delete returned batches:', e);
      showToast('تعذر حذف بعض التشغيلات المرتجعة من قاعدة البيانات');
    }

    if (onDeductMedicineStock) {
      targetBatches.forEach((b) => {
        onDeductMedicineStock(b.medicine_id, b.quantity_boxes);
      });
    }

    setBatches((prev) => prev.filter((b) => !returnedIds.has(b.id)));
    setSelectedBatchIds(new Set());

    try {
      await sqliteService.recordSupplierReturn({
        supplierName: supName,
        amount: totalReturnAmount,
        itemsCount: targetBatches.length,
        kind: 'SUPPLIER_RETURN',
        details: targetBatches
          .map((b) => `${b.trade_name_ar || b.trade_name || ''} (${b.batch_no || ''}) × ${b.quantity_boxes || 0}`)
          .join('، ')
      });
    } catch (e) {
      console.warn('Failed to record supplier return in audit:', e);
    }

    if (onReturnToSupplier) {
      onReturnToSupplier(supName, totalReturnAmount);
    }

    playCashDrawerSound();
    showToast(`تم تحويل المرتجع وقيد خصم ${totalReturnAmount.toFixed(2)} ج.م بنجاح! 🚚`);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0B1220] overflow-hidden select-none p-4 space-y-4 font-cairo">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-r from-teal-600 to-emerald-600 text-white px-5 py-2.5 rounded-xl shadow-2xl border border-teal-400/30 flex items-center gap-2 text-xs font-bold animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-white" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. Expiry Stat Cards */}
      <div className="grid grid-cols-5 gap-3 shrink-0">
        
        {/* Card 1: Expired (Red) */}
        <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl p-3.5 flex items-center justify-between shadow-lg relative overflow-hidden group hover:border-rose-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 rounded-full blur-xl pointer-events-none"></div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 mb-0.5">منتهي الصلاحية فوراً</div>
            <div className="text-2xl font-black text-rose-400 flex items-baseline gap-1">
              <span>{stats.expiredCount}</span>
              <span className="text-xs font-medium text-slate-400">تشغيلة</span>
            </div>
            <div className="text-[10px] text-rose-400 font-bold mt-1 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
              ممنوع بيعها بالكاشير
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
            <AlertOctagon className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: < 30 Days (Orange) */}
        <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl p-3.5 flex items-center justify-between shadow-lg relative overflow-hidden group hover:border-orange-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/10 rounded-full blur-xl pointer-events-none"></div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 mb-0.5">ينتهي خلال شهر (&lt; 30 يوم)</div>
            <div className="text-2xl font-black text-orange-400 flex items-baseline gap-1">
              <span>{stats.month1Count}</span>
              <span className="text-xs font-medium text-slate-400">تشغيلة</span>
            </div>
            <div className="text-[10px] text-orange-400 font-medium mt-1">
              طوارئ إرجاع فوري للشركات
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: 1 - 3 Months (Yellow) */}
        <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl p-3.5 flex items-center justify-between shadow-lg relative overflow-hidden group hover:border-amber-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-xl pointer-events-none"></div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 mb-0.5">ينتهي خلال 3 أشهر</div>
            <div className="text-2xl font-black text-amber-400 flex items-baseline gap-1">
              <span>{stats.month3Count}</span>
              <span className="text-xs font-medium text-slate-400">تشغيلة</span>
            </div>
            <div className="text-[10px] text-amber-400 font-medium mt-1">
              التوقيت القياسي لطلبية المرتجع
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: 3 - 6 Months (Slate/White) */}
        <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl p-3.5 flex items-center justify-between shadow-lg relative overflow-hidden group hover:border-slate-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-slate-500/10 rounded-full blur-xl pointer-events-none"></div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 mb-0.5">ينتهي خلال 6 أشهر</div>
            <div className="text-2xl font-black text-slate-200 flex items-baseline gap-1">
              <span>{stats.month6Count}</span>
              <span className="text-xs font-medium text-slate-400">تشغيلة</span>
            </div>
            <div className="text-[10px] text-slate-400 font-medium mt-1">
              أصناف راكدة تحت الملاحظة
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-500/15 border border-slate-500/30 text-slate-300 flex items-center justify-center shrink-0">
            <Eye className="w-5 h-5" />
          </div>
        </div>

        {/* Card 5: Total Value at Risk (Cost & Retail) */}
        <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl p-3.5 flex items-center justify-between shadow-lg relative overflow-hidden group hover:border-emerald-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl pointer-events-none"></div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 mb-0.5">القيمة المعرضة للتلف</div>
            <div className="text-xl font-black text-emerald-400 flex items-baseline gap-1">
              <span>
                {stats.totalAtRiskCost.toLocaleString('en-US', {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0
                })}
              </span>
              <span className="text-[11px] font-bold text-slate-400">ج.م تكلفة</span>
            </div>
            <div className="text-[10px] text-slate-400 font-medium mt-1">
              سعر الجمهور: {stats.totalAtRiskRetail.toLocaleString('en-US', { maximumFractionDigits: 0 })} ج.م
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

      </div>

      {/* 2. Actions & Filters Bar */}
      <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl p-3 flex items-center justify-between gap-3 shrink-0 shadow-lg flex-wrap">
        
        {/* Left Side: Search & Distributor Filter */}
        <div className="flex items-center gap-2.5 flex-1 min-w-[300px]">
          
          {/* Quick Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث باسم الدواء، المادة الفعالة، أو رقم التشغيلة (Batch No)..."
              className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl pr-9 pl-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute left-2.5 top-2.5 text-slate-400 hover:text-white"
              >
                <XCircle className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Supplier Filter Dropdown */}
          <div className="w-52 shrink-0">
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none cursor-pointer"
            >
              <option value="ALL">🏢 كافة شركات التوزيع</option>
              {suppliers && suppliers.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Center: Period Tabs */}
        <div className="flex items-center gap-1 bg-[#0B1220] p-1 rounded-xl border border-[#23324D] shrink-0">
          <button
            onClick={() => setPeriodFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              periodFilter === 'ALL'
                ? 'bg-teal-500 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            كل التنبيهات ({batches.length})
          </button>
          <button
            onClick={() => setPeriodFilter('EXPIRED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              periodFilter === 'EXPIRED'
                ? 'bg-rose-600 text-white shadow-md'
                : 'text-rose-400 hover:text-rose-300'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
            منتهي ({stats.expiredCount})
          </button>
          <button
            onClick={() => setPeriodFilter('MONTH_1')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              periodFilter === 'MONTH_1'
                ? 'bg-orange-600 text-white shadow-md'
                : 'text-orange-400 hover:text-orange-300'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400"></span>
            &lt; شهر ({stats.month1Count})
          </button>
          <button
            onClick={() => setPeriodFilter('MONTH_3')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              periodFilter === 'MONTH_3'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-amber-400 hover:text-amber-300'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            1 - 3 أشهر ({stats.month3Count})
          </button>
          <button
            onClick={() => setPeriodFilter('MONTH_6')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              periodFilter === 'MONTH_6'
                ? 'bg-slate-700 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            3 - 6 أشهر ({stats.month6Count})
          </button>
        </div>

        {/* Right Side: Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          
          {/* Print Return Sheet */}
          <button
            onClick={() => setShowPrintModal(true)}
            className="px-3.5 py-2 rounded-xl bg-[#17233A] hover:bg-[#23324D] border border-[#23324D] hover:border-amber-500/50 text-amber-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
          >
            <Printer className="w-4 h-4 text-amber-400" />
            <span>طباعة كشف المرتجع (A4)</span>
          </button>

          {/* Convert to Supplier Return Credit */}
          <button
            onClick={handleConvertToSupplierReturn}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-black shadow-lg shadow-amber-500/20 flex items-center gap-1.5 transition-all group"
          >
            <Truck className="w-4 h-4 text-slate-950 group-hover:translate-x-0.5 transition-transform" />
            <span>تحويل إلى مرتجع مورد</span>
            {selectedBatchIds.size > 0 && (
              <span className="bg-slate-950 text-amber-300 px-1.5 py-0.5 rounded-full text-[10px]">
                {selectedBatchIds.size}
              </span>
            )}
          </button>
        </div>

      </div>

      {/* 3. Batches Data Table */}
      <div className="flex-1 bg-[#111A2B] border border-[#23324D] rounded-2xl overflow-hidden shadow-xl flex flex-col">
        
        {/* Table Top Header Bar */}
        <div className="bg-[#17233A]/80 border-b border-[#23324D] px-4 py-2.5 flex items-center justify-between text-xs font-bold text-slate-300">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={
                  filteredBatches.length > 0 &&
                  selectedBatchIds.size === filteredBatches.length
                }
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded text-teal-500 bg-[#0B1220] border-[#23324D] focus:ring-teal-400"
              />
              <span className="text-slate-300">
                {selectedBatchIds.size > 0
                  ? `محدد (${selectedBatchIds.size} من ${filteredBatches.length})`
                  : `تحديد الكل لعمل المرتجع (${filteredBatches.length})`}
              </span>
            </label>
          </div>

          <div className="text-slate-400 text-[11px] flex items-center gap-2">
            <span>🛡️ نظام فحص وتنبيه الصلاحية يعمل تلقائياً لمنع خروج أي دواء منتهي الصلاحية بالكاشير</span>
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-y-auto">
          {filteredBatches.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400">
              <div className="w-16 h-16 rounded-2xl bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center justify-center mb-3">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h4 className="text-base font-bold text-white mb-1">
                لا توجد تشغيلات تطابق الفلتر المختار
              </h4>
              <p className="text-xs text-slate-500 max-w-sm">
                كافة الأصناف المسجلة صالحة وآمنة، أو يمكنك تبديل شركة التوزيع لمراجعة أدوية أخرى.
              </p>
            </div>
          ) : (
            <table className="w-full text-right text-xs">
              <thead className="bg-[#17233A]/40 text-slate-400 sticky top-0 z-10 border-b border-[#23324D]">
                <tr>
                  <th className="py-2.5 px-4 w-10 text-center">#</th>
                  <th className="py-2.5 px-4">الدواء والصنف</th>
                  <th className="py-2.5 px-4 text-center w-32">رقم التشغيلة (Batch)</th>
                  <th className="py-2.5 px-4 text-center w-44">تاريخ الصلاحية</th>
                  <th className="py-2.5 px-4 text-center w-32">الكمية المتبقية</th>
                  <th className="py-2.5 px-4 w-44">شركة التوزيع الموردة</th>
                  <th className="py-2.5 px-4 text-center w-36">القيمة المعرضة للخسارة</th>
                  <th className="py-2.5 px-4 text-center w-36">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#23324D]/60">
                {filteredBatches.map((batch) => {
                  const isSelected = selectedBatchIds.has(batch.id);
                  const days = getDaysRemaining(batch.expiry_date);
                  const isExpired = days < 0;
                  const isUrgent = days >= 0 && days <= 30;
                  const isReturn3M = days > 30 && days <= 90;

                  const costTotal = (batch.cost_box || batch.price_box * 0.75) * (batch.quantity_boxes || 0);
                  const retailTotal = (batch.price_box || 0) * (batch.quantity_boxes || 0);

                  return (
                    <tr
                      key={batch.id}
                      className={`transition-colors group ${
                        isSelected
                          ? 'bg-amber-500/10 hover:bg-amber-500/15'
                          : isExpired
                          ? 'bg-rose-500/[0.04] hover:bg-[#17233A]/70'
                          : isUrgent
                          ? 'bg-orange-500/[0.03] hover:bg-[#17233A]/70'
                          : 'hover:bg-[#17233A]/50'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(batch.id)}
                          className="w-4 h-4 rounded text-amber-500 bg-[#0B1220] border-[#23324D] focus:ring-amber-400 cursor-pointer"
                        />
                      </td>

                      {/* Medicine Info */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="font-bold text-white text-sm flex items-center gap-2">
                              <span>{batch.trade_name_ar || batch.trade_name}</span>
                              {isExpired && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold animate-pulse">
                                  منتهي
                                </span>
                              )}
                              {isUrgent && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30 font-bold">
                                  طوارئ مرتجع
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                              <span>{batch.trade_name}</span>
                              <span className="text-slate-600">•</span>
                              <span className="text-slate-400">{batch.generic_name}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Batch No & Shelf */}
                      <td className="py-3 px-4 text-center">
                        <span className="px-2.5 py-1 rounded-lg bg-[#0B1220] border border-[#23324D] text-slate-200 font-mono font-bold text-xs inline-block">
                          {batch.batch_no}
                        </span>
                        <div className="text-[10px] text-slate-500 mt-1">
                          الرف: <span className="text-slate-300 font-bold">{batch.shelf || 'A-01'}</span>
                        </div>
                      </td>

                      {/* Expiry Date & Days Remaining Badge */}
                      <td className="py-3 px-4 text-center">
                        <div className="font-bold font-mono text-sm text-white">
                          {batch.expiry_month_year || batch.expiry_date?.slice(0, 7)}
                        </div>
                        <div className="mt-1">
                          {isExpired ? (
                            <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold inline-flex items-center gap-1">
                              ⛔ منتهي منذ {Math.abs(days)} يوماً
                            </span>
                          ) : isUrgent ? (
                            <span className="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 text-[10px] font-bold inline-flex items-center gap-1">
                              ⚠️ متبقي {days} يوماً
                            </span>
                          ) : isReturn3M ? (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold inline-flex items-center gap-1">
                              🟡 متبقي {days} يوماً
                            </span>
                          ) : days <= 180 ? (
                            <span className="px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-300 border border-slate-600/40 text-[10px] font-medium inline-flex items-center gap-1">
                              ⚪ متبقي {days} يوماً
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-300 border border-teal-500/30 text-[10px] font-medium inline-flex items-center gap-1">
                              ✓ آمن ({days} يوم)
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Remaining Quantity */}
                      <td className="py-3 px-4 text-center">
                        <div className="font-bold text-sm text-white font-cairo">
                          {batch.quantity_boxes} علبة
                        </div>
                        {batch.quantity_strips > 0 && (
                          <div className="text-[10px] text-slate-400 font-cairo">
                            + {batch.quantity_strips} شريط
                          </div>
                        )}
                      </td>

                      {/* Distributor */}
                      <td className="py-3 px-4">
                        <span className="px-2.5 py-1 rounded-lg bg-[#17233A] border border-[#23324D] text-slate-200 text-xs font-medium">
                          {batch.supplier_name || 'ابن سينا فارما'}
                        </span>
                      </td>

                      {/* Value at Risk (Cost & Retail) */}
                      <td className="py-3 px-4 text-center">
                        <div className="font-bold text-amber-400 font-mono text-sm">
                          {costTotal.toFixed(1)} ج.م
                        </div>
                        <div className="text-[10px] text-slate-500">
                          الجمهور: {retailTotal.toFixed(0)} ج.م
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Edit Batch */}
                          <button
                            type="button"
                            onClick={() => setEditingBatch(batch)}
                            title="تعديل بيانات التشغيلة والصلاحية"
                            className="w-8 h-8 rounded-lg bg-[#17233A] text-slate-300 hover:text-white hover:bg-teal-500/20 border border-[#23324D] flex items-center justify-center transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {/* Toggle Select */}
                          <button
                            type="button"
                            onClick={() => toggleSelect(batch.id)}
                            title="تحديد لإضافتها لمحضر المرتجع"
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                              isSelected
                                ? 'bg-amber-500 text-slate-950 font-black'
                                : 'bg-[#17233A] text-amber-300 hover:bg-amber-500/20 border border-[#23324D]'
                            }`}
                          >
                            {isSelected ? 'محدد ✓' : 'إرجاع'}
                          </button>

                          {/* Dispose Batch */}
                          <button
                            type="button"
                            onClick={() => handleDisposeBatch(batch)}
                            title="إتلاف وإعدام التشغيلة من المخزن"
                            className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 flex items-center justify-center transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Table Footer Bar */}
        <div className="bg-[#17233A]/60 border-t border-[#23324D] px-4 py-2.5 flex items-center justify-between text-xs text-slate-400">
          <div>
            عرض <span className="font-bold text-white">{filteredBatches.length}</span> تشغيلة مسجلة
            {selectedBatchIds.size > 0 && (
              <span className="text-amber-300 font-bold mr-2">
                • تم تحديد {selectedBatchIds.size} تشغيلة للإرجاع
              </span>
            )}
          </div>
          <div className="flex items-center gap-6">
            <div>
              إجمالي العلب: <span className="font-bold text-white">
                {filteredBatches.reduce((sum, b) => sum + (b.quantity_boxes || 0), 0)}
              </span> علبة
            </div>
            <div>
              قيمة التكلفة المعرضة للخسارة: <span className="font-bold text-amber-400 font-mono">
                {stats.totalAtRiskCost.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ج.م
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Helper Modals */}
      <EditBatchModal
        isOpen={!!editingBatch}
        onClose={() => setEditingBatch(null)}
        batch={editingBatch}
        onSaveBatch={handleSaveBatch}
        suppliers={suppliers}
      />

      <ExpiryReportModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        batches={
          selectedBatchIds.size > 0
            ? batches.filter((b) => selectedBatchIds.has(b.id))
            : filteredBatches
        }
        supplierFilter={supplierFilter}
      />

    </div>
  );
}
