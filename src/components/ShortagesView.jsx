import React, { useState, useMemo, useEffect } from 'react';
import {
  ClipboardList,
  AlertTriangle,
  AlertOctagon,
  TrendingDown,
  DollarSign,
  Search,
  Filter,
  Share2,
  Printer,
  Truck,
  Plus,
  Minus,
  CheckCircle2,
  XCircle,
  Copy,
  ExternalLink,
  MessageSquare,
  Sparkles,
  RefreshCw,
  Phone,
  User,
  ArrowUpDown,
  Trash2
} from 'lucide-react';
import { AddCustomShortageModal } from './AddCustomShortageModal';
import { WhatsAppPreviewModal } from './WhatsAppPreviewModal';
import { PrintShortagesModal } from './PrintShortagesModal';
import { playBarcodeSuccessSound } from '../utils/sound';

export function ShortagesView({
  medicines,
  suppliers,
  onConvertToPurchase
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState('ALL');
  const [activeTabFilter, setActiveTabFilter] = useState('ALL'); // 'ALL', 'OUT_OF_STOCK', 'NEAR_EMPTY', 'CUSTOM'

  // Selected item IDs for batch actions (Print, WhatsApp, Convert to Purchase)
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Interactive Order Quantities map: { [id]: number }
  const [orderQuantities, setOrderQuantities] = useState({});

  // Dismissed item IDs (temporarily ignored for this session)
  const [dismissedIds, setDismissedIds] = useState(new Set());

  // Custom Shortage items
  const [customShortages, setCustomShortages] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('PHARMACY_CUSTOM_SHORTAGES') || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch (e) {
      return [];
    }
  });

  // Rendering window (avoid painting tens of thousands of shortage rows at once)
  const PAGE_SIZE = 100;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    try {
      if (customShortages.length > 0) {
        localStorage.setItem('PHARMACY_CUSTOM_SHORTAGES', JSON.stringify(customShortages));
      } else {
        localStorage.removeItem('PHARMACY_CUSTOM_SHORTAGES');
      }
    } catch (e) {}
  }, [customShortages]);

  // Modals state
  const [showAddCustomModal, setShowAddCustomModal] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Determine standard shortages from master medicines catalog
  const catalogShortages = useMemo(() => {
    return medicines
      .filter((m) => {
        if (dismissedIds.has(m.id)) return false;
        const reorder = m.reorder_level || 5;
        // Item is short if stock_boxes <= reorder
        return m.stock_boxes <= reorder;
      })
      .map((m) => {
        const reorder = m.reorder_level || 5;
        // Smart suggested order quantity: (reorder * 2) - current_stock, minimum 5 boxes
        const suggestedQty = Math.max(5, reorder * 2 - m.stock_boxes);
        const preferredSupplier =
          m.preferred_supplier ||
          (m.category === 'أدوية الضغط والقلب'
            ? 'الشركة المتحدة للصيادلة (UCP)'
            : m.category === 'مضادات حيوية'
            ? 'فارما أوفرسيز'
            : m.category === 'مسكنات وخافض حرارة'
            ? 'ابن سينا فارما'
            : m.category === 'دوار وأذن داخلية'
            ? 'رامكو فارما'
            : 'أوفيس فارما');

        return {
          id: m.id,
          isCustom: false,
          trade_name: m.trade_name,
          trade_name_ar: m.trade_name_ar,
          generic_name: m.generic_name,
          stock_boxes: m.stock_boxes,
          stock_strips: m.stock_strips,
          reorder_level: reorder,
          suggested_quantity: suggestedQty,
          order_quantity: orderQuantities[m.id] !== undefined ? orderQuantities[m.id] : suggestedQty,
          shelf: m.shelf || 'A-01',
          preferred_supplier: preferredSupplier,
          price_box: m.price_box,
          type: m.stock_boxes === 0 ? 'OUT_OF_STOCK' : 'NEAR_EMPTY',
          isUrgent: m.stock_boxes === 0
        };
      });
  }, [medicines, dismissedIds, orderQuantities]);

  // Combine custom shortages with catalog shortages
  const allShortages = useMemo(() => {
    const activeCustom = customShortages
      .filter((item) => !dismissedIds.has(item.id))
      .map((item) => ({
        ...item,
        order_quantity:
          orderQuantities[item.id] !== undefined ? orderQuantities[item.id] : item.order_quantity || item.reorder_level || 5
      }));

    return [...activeCustom, ...catalogShortages];
  }, [catalogShortages, customShortages, dismissedIds, orderQuantities]);

  // 1. Statistics Calculation
  const stats = useMemo(() => {
    const totalShortages = allShortages.length;
    let outOfStockCount = 0;
    let nearEmptyCount = 0;
    let estimatedOrderCost = 0;

    allShortages.forEach((item) => {
      if (item.stock_boxes === 0) {
        outOfStockCount++;
      } else {
        nearEmptyCount++;
      }

      const qty = item.order_quantity || 1;
      const unitCost = (item.price_box || 40) * 0.75; // Approx 25% discount
      estimatedOrderCost += qty * unitCost;
    });

    return {
      totalShortages,
      outOfStockCount,
      nearEmptyCount,
      estimatedOrderCost
    };
  }, [allShortages]);

  // 2. Filter & Search Logic
  const filteredShortages = useMemo(() => {
    return allShortages.filter((item) => {
      // Search
      const q = searchQuery.trim().toLowerCase();
      if (q) {
        const matchesName =
          String(item.trade_name || '').toLowerCase().includes(q) ||
          String(item.trade_name_ar || '').includes(q) ||
          String(item.generic_name || '').toLowerCase().includes(q) ||
          String(item.shelf || '').toLowerCase().includes(q) ||
          String(item.customerName || '').toLowerCase().includes(q);

        if (!matchesName) return false;
      }

      // Supplier filter
      if (selectedSupplierFilter !== 'ALL') {
        if (!item.preferred_supplier?.includes(selectedSupplierFilter)) {
          return false;
        }
      }

      // Status Tab filter
      if (activeTabFilter === 'OUT_OF_STOCK') {
        return item.stock_boxes === 0;
      }
      if (activeTabFilter === 'NEAR_EMPTY') {
        return item.stock_boxes > 0 && !item.isCustom;
      }
      if (activeTabFilter === 'CUSTOM') {
        return item.isCustom;
      }

      return true;
    });
  }, [allShortages, searchQuery, selectedSupplierFilter, activeTabFilter]);

  // Reset the render window whenever the filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, selectedSupplierFilter, activeTabFilter]);

  const visibleShortages = useMemo(
    () => filteredShortages.slice(0, visibleCount),
    [filteredShortages, visibleCount]
  );

  // Adjust order quantity for an item
  const handleUpdateQuantity = (id, delta) => {
    const current =
      orderQuantities[id] !== undefined
        ? orderQuantities[id]
        : allShortages.find((i) => i.id === id)?.order_quantity || 5;

    const next = Math.max(1, current + delta);
    setOrderQuantities((prev) => ({ ...prev, [id]: next }));
  };

  const handleSetExactQuantity = (id, val) => {
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed >= 1) {
      setOrderQuantities((prev) => ({ ...prev, [id]: parsed }));
    }
  };

  // Selection toggle
  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
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
    if (selectedIds.size === filteredShortages.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredShortages.map((i) => i.id)));
    }
  };

  // Dismiss item temporarily
  const handleDismiss = (id) => {
    setDismissedIds((prev) => new Set([...prev, id]));
    showToast('تم استبعاد الصنف مؤقتاً من الكشكول');
  };

  // Delete custom shortage permanently
  const handleDeleteCustom = (id) => {
    setCustomShortages((prev) => prev.filter((i) => i.id !== id));
    showToast('تم حذف الطلب الخاص بنجاح');
  };

  // Add custom item
  const handleAddCustomItem = (newItem) => {
    setCustomShortages((prev) => [newItem, ...prev]);
    showToast('تمت إضافة الصنف لكشكول النواقص بنجاح');
    playBarcodeSuccessSound();
  };

  // Generate WhatsApp formatted text message
  const generateWhatsAppMessage = () => {
    const targetItems =
      selectedIds.size > 0
        ? filteredShortages.filter((i) => selectedIds.has(i.id))
        : filteredShortages;

    if (targetItems.length === 0) return '';

    const companyName =
      selectedSupplierFilter !== 'ALL' ? selectedSupplierFilter : 'الموزع المعتمد';
    const dateStr = new Date().toLocaleDateString('ar-EG', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    let lines = [
      `*📋 طلبيـة نواقـص - صيدلية النخبة الحديثة*`,
      `📅 التاريخ: ${dateStr}`,
      `🏢 موجهة إلى: *${companyName}*`,
      `-----------------------------------------`
    ];

    targetItems.forEach((item, idx) => {
      const num = idx + 1;
      const arabicName = item.trade_name_ar || item.trade_name;
      const engName = item.trade_name;
      const qty = item.order_quantity || 1;
      const note = item.customerName ? ` (طلب زبون: ${item.customerName})` : item.notes ? ` (${item.notes})` : '';

      lines.push(`${num}. *${arabicName}* [${engName}]`);
      lines.push(`   ← المطلوب: *${qty} علبة*${note}`);
    });

    const totalBoxes = targetItems.reduce((sum, i) => sum + (i.order_quantity || 1), 0);
    lines.push(`-----------------------------------------`);
    lines.push(`📦 *إجمالي الأصناف:* ${targetItems.length} صنف`);
    lines.push(`📦 *إجمالي العلب المطلوبة:* ${totalBoxes} علبة`);
    lines.push(`\nبرجاء التأكيد وإرسال الفاتورة مع أقرب خط سير. شكراً لكم.`);

    return lines.join('\n');
  };

  // Direct 1-Click WhatsApp Copy
  const handleQuickCopyWhatsApp = async () => {
    const text = generateWhatsAppMessage();
    if (!text) {
      showToast('لا توجد أصناف لنسخها');
      return;
    }

    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch (e) {
      copied = false;
    }

    if (!copied) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        copied = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (e) {
        copied = false;
      }
    }

    if (copied) {
      showToast('تم نسخ رسالة الواتساب المنسقة للحافظة بنجاح!');
      playBarcodeSuccessSound();
    } else {
      showToast('تعذر النسخ التلقائي، يمكنك فتح معاينة الواتساب ونسخ الرسالة يدوياً');
    }
  };

  // Convert Selected to Purchase Invoice
  const handleTriggerConvertToPurchase = () => {
    const targetItems =
      selectedIds.size > 0
        ? filteredShortages.filter((i) => selectedIds.has(i.id))
        : filteredShortages;

    if (targetItems.length === 0) {
      showToast('يرجى تحديد صنف واحد على الأقل لتحويله لفاتورة شراء');
      return;
    }

    if (onConvertToPurchase) {
      onConvertToPurchase(targetItems, selectedSupplierFilter);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0B1220] overflow-hidden select-none p-4 space-y-4">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-r from-teal-600 to-emerald-600 text-white px-5 py-2.5 rounded-xl shadow-2xl border border-teal-400/30 flex items-center gap-2 text-xs font-bold animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-white" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. Top Stat Cards (Shortages Stat Cards) */}
      <div className="grid grid-cols-4 gap-4 shrink-0">
        
        {/* Card 1: Total Shortages */}
        <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl p-4 flex items-center justify-between shadow-lg relative overflow-hidden group hover:border-teal-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/5 rounded-full blur-xl pointer-events-none"></div>
          <div>
            <div className="text-xs font-bold text-slate-400 mb-1">إجمالي الأصناف الناقصة</div>
            <div className="text-2xl font-black text-white flex items-baseline gap-1.5 font-cairo">
              <span>{stats.totalShortages}</span>
              <span className="text-xs font-medium text-slate-400">صنف مطلوب</span>
            </div>
            <div className="text-[11px] text-teal-400 font-medium mt-1">
              جاهزة للإرسال في طلبيات التوريد
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-teal-500/15 border border-teal-500/30 text-teal-400 flex items-center justify-center shrink-0">
            <ClipboardList className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2: Out of Stock (Red) */}
        <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl p-4 flex items-center justify-between shadow-lg relative overflow-hidden group hover:border-rose-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-xl pointer-events-none"></div>
          <div>
            <div className="text-xs font-bold text-slate-400 mb-1">أصناف رصيدها صفر (نافدة)</div>
            <div className="text-2xl font-black text-rose-400 flex items-baseline gap-1.5 font-cairo">
              <span>{stats.outOfStockCount}</span>
              <span className="text-xs font-medium text-slate-400">صنف نفد تماماً</span>
            </div>
            <div className="text-[11px] text-rose-400 font-bold mt-1 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
              أولوية قصوى عاجلة لطلبها
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
            <AlertOctagon className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: Near Empty (Yellow) */}
        <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl p-4 flex items-center justify-between shadow-lg relative overflow-hidden group hover:border-amber-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl pointer-events-none"></div>
          <div>
            <div className="text-xs font-bold text-slate-400 mb-1">أصناف بلغت حد الطلب</div>
            <div className="text-2xl font-black text-amber-400 flex items-baseline gap-1.5 font-cairo">
              <span>{stats.nearEmptyCount}</span>
              <span className="text-xs font-medium text-slate-400">صنف رصيد منخفض</span>
            </div>
            <div className="text-[11px] text-amber-400 font-medium mt-1">
              أوشكت على النفاد من الأرفف
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
            <TrendingDown className="w-6 h-6" />
          </div>
        </div>

        {/* Card 4: Estimated Order Cost */}
        <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl p-4 flex items-center justify-between shadow-lg relative overflow-hidden group hover:border-emerald-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl pointer-events-none"></div>
          <div>
            <div className="text-xs font-bold text-slate-400 mb-1">القيمة التقديرية للطلبية</div>
            <div className="text-2xl font-black text-emerald-400 flex items-baseline gap-1.5 font-cairo">
              <span>
                {stats.estimatedOrderCost.toLocaleString('en-US', {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0
                })}
              </span>
              <span className="text-xs font-medium text-slate-400">ج.م تقريبياً</span>
            </div>
            <div className="text-[11px] text-emerald-400/80 font-medium mt-1">
              سعر الشراء المتوقع بعد الخصم
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* 2. Smart Actions Bar (Search, Filters & Magic Action Buttons) */}
      <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl p-3 flex items-center justify-between gap-3 shrink-0 shadow-lg flex-wrap">
        
        {/* Left Side: Search & Distributor Filter */}
        <div className="flex items-center gap-2.5 flex-1 min-w-[320px]">
          
          {/* Quick Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث بالاسم التجاري، العلمي، مكان الرف، أو اسم العميل..."
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

          {/* Distributor Filter Dropdown */}
          <div className="w-56 shrink-0">
            <select
              value={selectedSupplierFilter}
              onChange={(e) => setSelectedSupplierFilter(e.target.value)}
              className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none cursor-pointer"
            >
              <option value="ALL">🏢 كافة شركات التوزيع</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Center: Quick Status Tabs */}
        <div className="flex items-center gap-1 bg-[#0B1220] p-1 rounded-xl border border-[#23324D] shrink-0">
          <button
            onClick={() => setActiveTabFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTabFilter === 'ALL'
                ? 'bg-teal-500 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            الكل ({allShortages.length})
          </button>
          <button
            onClick={() => setActiveTabFilter('OUT_OF_STOCK')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTabFilter === 'OUT_OF_STOCK'
                ? 'bg-rose-600 text-white shadow-md'
                : 'text-rose-400 hover:text-rose-300'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
            رصيد صفر ({stats.outOfStockCount})
          </button>
          <button
            onClick={() => setActiveTabFilter('NEAR_EMPTY')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTabFilter === 'NEAR_EMPTY'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-amber-400 hover:text-amber-300'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            أوشكت على النفاد ({stats.nearEmptyCount})
          </button>
          <button
            onClick={() => setActiveTabFilter('CUSTOM')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTabFilter === 'CUSTOM'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-purple-400 hover:text-purple-300'
            }`}
          >
            <User className="w-3 h-3" />
            طلبات خاصة ({customShortages.length})
          </button>
        </div>

        {/* Right Side: Magic Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          
          {/* Add Custom Shortage */}
          <button
            onClick={() => setShowAddCustomModal(true)}
            className="px-3.5 py-2 rounded-xl bg-[#17233A] hover:bg-[#23324D] border border-[#23324D] hover:border-purple-500/50 text-purple-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4 text-purple-400" />
            <span>إضافة صنف يدوي</span>
          </button>

          {/* 1-Click WhatsApp Copy */}
          <button
            onClick={handleQuickCopyWhatsApp}
            title="نسخ رسالة منسقة للحافظة لإرسالها لمندوب الشركة عبر واتساب"
            className="px-3.5 py-2 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/40 text-emerald-300 hover:text-emerald-200 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm group"
          >
            <MessageSquare className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
            <span>نسخ للواتساب</span>
          </button>

          {/* WhatsApp Preview Modal */}
          <button
            onClick={() => setShowWhatsAppModal(true)}
            title="معاينة رسالة الواتساب وتحديد رقم المندوب"
            className="p-2 rounded-xl bg-[#17233A] hover:bg-[#23324D] border border-[#23324D] text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
          </button>

          {/* Print Shortages Sheet */}
          <button
            onClick={() => setShowPrintModal(true)}
            className="px-3.5 py-2 rounded-xl bg-[#17233A] hover:bg-[#23324D] border border-[#23324D] hover:border-teal-500/50 text-slate-200 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
          >
            <Printer className="w-4 h-4 text-teal-400" />
            <span>طباعة الكشكول</span>
          </button>

          {/* Convert to Purchase Invoice */}
          <button
            onClick={handleTriggerConvertToPurchase}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white text-xs font-bold shadow-lg shadow-teal-500/20 flex items-center gap-1.5 transition-all group"
          >
            <Truck className="w-4 h-4 text-white group-hover:translate-x-0.5 transition-transform" />
            <span>تحويل لفاتورة شراء</span>
            {selectedIds.size > 0 && (
              <span className="bg-white/20 text-white px-1.5 py-0.5 rounded-full text-[10px]">
                {selectedIds.size}
              </span>
            )}
          </button>
        </div>

      </div>

      {/* 3. Interactive Shortages Table */}
      <div className="flex-1 bg-[#111A2B] border border-[#23324D] rounded-2xl overflow-hidden shadow-xl flex flex-col">
        
        {/* Table Header Bar */}
        <div className="bg-[#17233A]/80 border-b border-[#23324D] px-4 py-3 flex items-center justify-between text-xs font-bold text-slate-300">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={
                  filteredShortages.length > 0 &&
                  selectedIds.size === filteredShortages.length
                }
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded text-teal-500 bg-[#0B1220] border-[#23324D] focus:ring-teal-400"
              />
              <span className="text-slate-300">
                {selectedIds.size > 0
                  ? `محدد (${selectedIds.size} من ${filteredShortages.length})`
                  : `تحديد الكل (${filteredShortages.length})`}
              </span>
            </label>
          </div>

          <div className="text-slate-400 text-[11px] flex items-center gap-2">
            <span>💡 نصيحة: يمكنك تعديل كمية العلب المطلوبة لكل دواء مباشرة قبل إرسال الطلبية</span>
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-y-auto">
          {filteredShortages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400">
              <div className="w-16 h-16 rounded-2xl bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center justify-center mb-3">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h4 className="text-base font-bold text-white mb-1">
                لا توجد نواقص مطابقة للفلتر المحدد
              </h4>
              <p className="text-xs text-slate-500 max-w-sm">
                المخزن في حالة ممتازة، أو تم استبعاد الأصناف مؤقتاً. يمكنك إضافة أصناف يدوياً أو اختيار شركة توزيع أخرى.
              </p>
            </div>
          ) : (
            <table className="w-full text-right text-xs">
              <thead className="bg-[#17233A]/40 text-slate-400 sticky top-0 z-10 border-b border-[#23324D]">
                <tr>
                  <th className="py-2.5 px-4 w-10 text-center">#</th>
                  <th className="py-2.5 px-4">الدواء والصنف</th>
                  <th className="py-2.5 px-4 text-center w-28">الرصيد الحالي</th>
                  <th className="py-2.5 px-4 text-center w-24">حد الطلب</th>
                  <th className="py-2.5 px-4 text-center w-40">الكمية المقترحة للطلب</th>
                  <th className="py-2.5 px-4 w-44">المورد المفضل</th>
                  <th className="py-2.5 px-4 text-center w-28">التكلفة التقديرية</th>
                  <th className="py-2.5 px-4 text-center w-36">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#23324D]/60">
                {visibleShortages.map((item, index) => {
                  const isSelected = selectedIds.has(item.id);
                  const isOutOfStock = item.stock_boxes === 0;
                  const estimatedCost = (item.price_box || 40) * 0.75 * (item.order_quantity || 1);

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors group ${
                        isSelected
                          ? 'bg-teal-500/10 hover:bg-teal-500/15'
                          : isOutOfStock
                          ? 'bg-rose-500/[0.03] hover:bg-[#17233A]/70'
                          : 'hover:bg-[#17233A]/50'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(item.id)}
                          className="w-4 h-4 rounded text-teal-500 bg-[#0B1220] border-[#23324D] focus:ring-teal-400 cursor-pointer"
                        />
                      </td>

                      {/* Medicine Info */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div>
                            <div className="font-bold text-white text-sm flex items-center gap-2">
                              <span>{item.trade_name_ar || item.trade_name}</span>
                              {item.isCustom && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold flex items-center gap-1">
                                  <User className="w-2.5 h-2.5" />
                                  طلب عميل
                                </span>
                              )}
                              {isOutOfStock && !item.isCustom && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold animate-pulse">
                                  نفد
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                              <span>{item.trade_name}</span>
                              <span className="text-slate-600">•</span>
                              <span className="text-slate-400">{item.generic_name}</span>
                            </div>
                            {item.customerName && (
                              <div className="text-[11px] text-purple-300 font-medium mt-1 flex items-center gap-2">
                                <span>العميل: {item.customerName}</span>
                                {item.customerPhone && (
                                  <span className="text-slate-400 font-mono">({item.customerPhone})</span>
                                )}
                                {item.notes && <span className="text-slate-400">- {item.notes}</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Current Stock */}
                      <td className="py-3 px-4 text-center">
                        {item.isCustom ? (
                          <span className="px-2.5 py-1 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-300 font-bold text-xs inline-flex items-center gap-1">
                            غير مسجل
                          </span>
                        ) : isOutOfStock ? (
                          <span className="px-2.5 py-1 rounded-lg bg-rose-500/20 border border-rose-500/30 text-rose-300 font-bold text-xs inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping"></span>
                            🔴 رصيد 0
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold text-xs inline-flex items-center gap-1">
                            🟡 {item.stock_boxes} علبة
                            {item.stock_strips > 0 && ` (+${item.stock_strips} شريط)`}
                          </span>
                        )}
                        <div className="text-[10px] text-slate-500 mt-1 font-mono">
                          الرف: <span className="text-slate-300 font-bold">{item.shelf}</span>
                        </div>
                      </td>

                      {/* Min Alert (Reorder Level) */}
                      <td className="py-3 px-4 text-center font-bold text-slate-300 font-mono">
                        {item.reorder_level || 5} علب
                      </td>

                      {/* Smart Suggested Order Quantity Counter */}
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex items-center gap-1 bg-[#0B1220] border border-[#23324D] rounded-xl p-1">
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(item.id, -1)}
                            className="w-7 h-7 rounded-lg bg-[#17233A] hover:bg-[#23324D] text-slate-300 hover:text-white flex items-center justify-center transition-colors font-bold"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          
                          <input
                            type="number"
                            min="1"
                            value={item.order_quantity || 1}
                            onChange={(e) => handleSetExactQuantity(item.id, e.target.value)}
                            className="w-12 text-center bg-transparent font-bold text-teal-300 text-sm focus:outline-none"
                          />

                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(item.id, 1)}
                            className="w-7 h-7 rounded-lg bg-[#17233A] hover:bg-[#23324D] text-slate-300 hover:text-white flex items-center justify-center transition-colors font-bold"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <span className="text-[10px] text-slate-500 block mt-0.5">علبة للطلب</span>
                      </td>

                      {/* Preferred Supplier */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2.5 py-1 rounded-lg bg-[#17233A] border border-[#23324D] text-slate-200 text-xs font-medium">
                            {item.preferred_supplier || 'الشركة المتحدة'}
                          </span>
                        </div>
                      </td>

                      {/* Estimated Cost */}
                      <td className="py-3 px-4 text-center">
                        <div className="font-bold text-emerald-400 font-mono text-sm">
                          {estimatedCost.toFixed(1)} ج.م
                        </div>
                        <div className="text-[10px] text-slate-500">
                          ~{(item.price_box * 0.75).toFixed(1)} /علبة
                        </div>
                      </td>

                      {/* Row Actions */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Quick Select / Order Toggle */}
                          <button
                            type="button"
                            onClick={() => toggleSelect(item.id)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                              isSelected
                                ? 'bg-teal-500 text-white'
                                : 'bg-[#17233A] text-teal-300 hover:bg-teal-500/20 border border-[#23324D]'
                            }`}
                          >
                            {isSelected ? 'محدد ✓' : 'طلب فوري'}
                          </button>

                          {/* Dismiss Temporarily or Delete Custom */}
                          {item.isCustom ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteCustom(item.id)}
                              title="حذف الطلب الخاص"
                              className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 flex items-center justify-center transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleDismiss(item.id)}
                              title="استبعاد مؤقت من الكشكول لليوم"
                              className="w-8 h-8 rounded-lg bg-[#17233A] text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 border border-[#23324D] flex items-center justify-center transition-colors"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
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
          <div className="flex items-center gap-3">
            <span>
              عرض <span className="font-bold text-white">{Math.min(visibleCount, filteredShortages.length)}</span> من{' '}
              <span className="font-bold text-white">{filteredShortages.length}</span> صنف ناقص
            </span>
            {visibleCount < filteredShortages.length && (
              <button
                type="button"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="px-3 py-1 rounded-lg bg-teal-500/15 hover:bg-teal-500/25 text-teal-300 border border-teal-500/30 text-[11px] font-bold transition-colors"
              >
                عرض المزيد
              </button>
            )}
            {selectedIds.size > 0 && (
              <span className="text-teal-300 font-bold">
                • تم تحديد {selectedIds.size} صنف
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div>
              إجمالي العلب للطلب: <span className="font-bold text-white">
                {filteredShortages.reduce((sum, i) => sum + (i.order_quantity || 1), 0)}
              </span> علبة
            </div>
            <div>
              التكلفة الإجمالية: <span className="font-bold text-emerald-400 font-mono">
                {stats.estimatedOrderCost.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ج.م
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Helper Modals */}
      <AddCustomShortageModal
        isOpen={showAddCustomModal}
        onClose={() => setShowAddCustomModal(false)}
        suppliers={suppliers}
        onAddCustomItem={handleAddCustomItem}
      />

      <WhatsAppPreviewModal
        isOpen={showWhatsAppModal}
        onClose={() => setShowWhatsAppModal(false)}
        messageText={generateWhatsAppMessage()}
        supplierName={selectedSupplierFilter !== 'ALL' ? selectedSupplierFilter : 'مندوب شركة التوزيع'}
      />

      <PrintShortagesModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        items={
          selectedIds.size > 0
            ? filteredShortages.filter((i) => selectedIds.has(i.id))
            : filteredShortages
        }
        supplierFilter={selectedSupplierFilter}
      />

    </div>
  );
}
