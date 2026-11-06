import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Search,
  Plus,
  Download,
  Upload,
  FileSpreadsheet,
  Filter,
  Edit2,
  Trash2,
  Barcode,
  Zap,
  Package,
  AlertTriangle,
  XCircle,
  Coins,
  Pill,
  ChevronRight,
  ChevronLeft,
  Check,
  X,
  Sparkles,
  Layers,
  ArrowUpDown,
  RefreshCw
} from 'lucide-react';
import { ProductModal } from './ProductModal';
import { BarcodeStickerModal } from './BarcodeStickerModal';
import { StockTakeModal } from './StockTakeModal';
import { sqliteService } from '../db/sqliteService';
import { hasPermission } from '../utils/permissions';

export function ProductsView({ currentUser, medicines = [], onSaveMedicine, onDeleteMedicine }) {
  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('ALL'); // 'ALL', 'AVAILABLE', 'NEAR_EMPTY', 'OUT_OF_STOCK'
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  
  // SQLite Paginated State (Clean 0 items)
  const [sqliteItems, setSqliteItems] = useState([]);
  const [sqliteTotal, setSqliteTotal] = useState(0);
  const [sqliteStats, setSqliteStats] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Pagination State: 50 items per page as requested
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Modals State
  const [showProductModal, setShowProductModal] = useState(false);
  const [showStockTakeModal, setShowStockTakeModal] = useState(false);
  const [medicineToEdit, setMedicineToEdit] = useState(null);
  const [barcodeMedicine, setBarcodeMedicine] = useState(null);
  const fileInputRef = useRef(null);

  // Quick Inline Edit State
  const [quickEditingId, setQuickEditingId] = useState(null);
  const [quickPrice, setQuickPrice] = useState('');
  const [quickStock, setQuickStock] = useState('');

  // Toast
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // 1. Fetch Real Inventory Stats from SQLite
  useEffect(() => {
    let isCurrent = true;
    const fetchStats = async () => {
      try {
        const s = await sqliteService.getInventoryStats();
        if (isCurrent && s) {
          setSqliteStats(s);
        }
      } catch (e) {
        console.warn('SQLite stats error:', e);
      }
    };
    fetchStats();
    return () => { isCurrent = false; };
  }, []);

  // 2. Fetch Paginated Medicines directly from SQLite 30,000 Catalog (50 items per page)
  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    const fetchPage = async () => {
      try {
        const res = await sqliteService.getPaginatedMedicines({
          page: currentPage,
          pageSize: itemsPerPage,
          search: searchQuery,
          filter: activeFilter,
          category: selectedCategory
        });
        if (isCurrent && res) {
          setSqliteItems(res.items || []);
          setSqliteTotal(res.total != null ? res.total : 0);
        }
      } catch (err) {
        console.warn('SQLite paginated error:', err);
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    };

    const timer = setTimeout(fetchPage, 50);
    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [currentPage, searchQuery, activeFilter, selectedCategory]);

  // Inventory Statistics display
  const stats = sqliteStats || {
    totalItems: sqliteTotal || 0,
    totalRetailValue: 0,
    estimatedCostValue: 0,
    nearEmptyCount: 0,
    outOfStockCount: 0
  };

  // Pagination Calculations
  const totalPages = Math.max(1, Math.ceil((sqliteTotal || 0) / itemsPerPage));
  const displayMedicines = sqliteItems;

  // Distinct Categories List
  const categoriesList = useMemo(() => {
    const defaultCats = [
      'مسكنات وخافض حرارة',
      'مضادات حيوية',
      'أدوية الضغط والقلب',
      'أدوية السكر والغدد',
      'فيتامينات ومكملات غذائية',
      'أدوية الجهاز الهضمي والقولون',
      'أدوية الحساسية والجهاز التنفسي',
      'مستحضرات جلدية ومراهم'
    ];
    if (Array.isArray(medicines) && medicines.length > 0) {
      const set = new Set(medicines.map((m) => m?.category).filter(Boolean));
      return Array.from(set);
    }
    return defaultCats;
  }, [medicines]);

  // Export to CSV
  const handleExportCSV = () => {
    try {
      const headers = ['المعرف', 'الاسم التجاري', 'الاسم العربي', 'المادة الفعالة', 'الباركود', 'سعر العلبة', 'سعر الشريط', 'رصيد العلب', 'رصيد الشرائط', 'الرف'];
      const rows = (displayMedicines || []).map((m) => [
        m?.id || '',
        `"${m?.trade_name || ''}"`,
        `"${m?.trade_name_ar || ''}"`,
        `"${m?.generic_name || ''}"`,
        `'${m?.barcode || ''}`,
        m?.price_box || 0,
        m?.price_strip || 0,
        m?.stock_boxes || 0,
        m?.stock_strips || 0,
        `"${m?.shelf || ''}"`
      ]);

      const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `جرد_الأدوية_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showToast('تم تصدير ملف جرد المخزن (Excel / CSV) بنجاح 📥');
    } catch (e) {
      showToast('حدث خطأ أثناء تصدير الملف');
    }
  };

  // Download Ready-to-use Excel / CSV Template
  const handleDownloadTemplate = () => {
    try {
      const headers = [
        'الاسم العربي',
        'الاسم الإنجليزي',
        'المادة الفعالة',
        'الباركود',
        'سعر العلبة',
        'عدد الشرائط بالعلبة',
        'سعر الشريط',
        'رصيد العلب بالمخزن',
        'رصيد الشرائط',
        'مكان الرف',
        'القسم والتصنيف',
        'حد إعادة الطلب'
      ];

      const sampleRows = [
        ['بنادول أدفانس 500 مجم', 'Panadol Advance 500mg', 'Paracetamol 500mg', '6221234567890', '35.00', '2', '17.50', '20', '0', 'A-01', 'مسكنات وخافض حرارة', '5'],
        ['كتافلام 50 مجم', 'Cataflam 50mg', 'Diclofenac Potassium', '6229876543210', '62.00', '2', '31.00', '15', '0', 'A-02', 'مسكنات ومضاد التهاب', '3'],
        ['أوجمنتين 1 جم', 'Augmentin 1gm', 'Amoxicillin + Clavulanic Acid', '6224567890123', '115.00', '2', '57.50', '10', '0', 'B-01', 'مضادات حيوية', '4']
      ];

      const csvContent = '\uFEFF' + [headers.join(','), ...sampleRows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'نموذج_إدخال_الأدوية_صيدليتي.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('تم تحميل نموذج شيت الإكسيل الجاهز للملء 📥');
    } catch (e) {
      showToast('حدث خطأ أثناء تحميل النموذج');
    }
  };

  // Import Medicines from Excel / CSV file
  const handleImportCSV = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });

      // Find first sheet with actual data
      let worksheet = null;
      let rows = [];
      for (const name of workbook.SheetNames) {
        const sheet = workbook.Sheets[name];
        const parsed = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        if (parsed && parsed.length >= 2) {
          worksheet = sheet;
          rows = parsed;
          break;
        }
      }

      if (!rows || rows.length < 2) {
        showToast('الملف فارغ أو لا يحتوي على بيانات أدوية كافية!', 'warning');
        return;
      }

      const headerRow = rows[0].map((h) => String(h || '').trim());
      const dataRows = rows.slice(1);

      // Safe Number / Price cleaner
      const parsePrice = (val) => {
        if (val == null) return 0;
        if (typeof val === 'number') return isNaN(val) ? 0 : val;
        const cleaned = String(val).replace(/[^0-9.-]/g, '');
        const num = parseFloat(cleaned);
        return isNaN(num) ? 0 : num;
      };

      // Safe Integer cleaner
      const parseIntClean = (val, def = 0) => {
        if (val == null) return def;
        if (typeof val === 'number') return Math.floor(val);
        const cleaned = String(val).replace(/[^0-9-]/g, '');
        const num = parseInt(cleaned, 10);
        return isNaN(num) ? def : num;
      };

      // Safe Barcode cleaner
      const parseBarcode = (val, fallbackIndex) => {
        if (val == null || String(val).trim() === '') {
          return `622${String(1000000000 + fallbackIndex).padStart(10, '0')}`;
        }
        let str = String(val).trim().replace(/^'/, '');
        if (/^[0-9]+(\.[0-9]+)?[eE]\+[0-9]+$/.test(str)) {
          try {
            str = BigInt(Math.round(Number(str))).toString();
          } catch (e) {}
        }
        return str;
      };

      // Dynamic Column Mapping based on header names or fallback positions
      const findCol = (regex, fallbackIdx) => {
        const idx = headerRow.findIndex((h) => regex.test(h));
        return idx !== -1 ? idx : fallbackIdx;
      };

      const colNameAr = findCol(/عربي|اسم.*عرب|اسم.*تجاري.*عرب|trade.*name.*ar|name.*ar/i, 0);
      const colNameEn = findCol(/إنجليزي|انجليزي|اسم.*انجليز|اسم.*إنجليز|trade.*name.*en|trade.*name|name.*en/i, 1);
      const colGeneric = findCol(/مادة.*فعال|علمي|مادة|generic|active/i, 2);
      const colBarcode = findCol(/باركود|كود|barcode|code/i, 3);
      const colPriceBox = findCol(/سعر.*علبة|سعر.*جمهور|سعر.*بيع|price.*box|box.*price|retail|price/i, 4);
      const colStrips = findCol(/عدد.*شريط|شرائط|strips/i, 5);
      const colPriceStrip = findCol(/سعر.*شريط|strip.*price/i, 6);
      const colStockBoxes = findCol(/رصيد.*علب|مخزون.*علب|كمية.*علب|كمية|رصيد|stock.*box|quantity|stock/i, 7);
      const colStockStrips = findCol(/رصيد.*شريط|مخزون.*شريط|stock.*strip/i, 8);
      const colShelf = findCol(/رف|مكان|موقع|shelf|location/i, 9);
      const colCategory = findCol(/قسم|تصنيف|نوع|category|dept/i, 10);
      const colReorder = findCol(/حد.*طلب|حد.*إعادة|reorder/i, 11);

      const medicinesToImport = [];

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        if (!row || row.length === 0) continue;

        let nameAr = (row[colNameAr] != null ? String(row[colNameAr]) : '').trim();
        let nameEn = (row[colNameEn] != null ? String(row[colNameEn]) : '').trim();

        // If name column is shared or inverted
        if (!nameAr && !nameEn) {
          // Try col 0 or 1
          nameAr = String(row[0] || '').trim();
          nameEn = String(row[1] || '').trim();
        }
        if (!nameAr && !nameEn) continue;

        const generic = (row[colGeneric] != null ? String(row[colGeneric]) : '').trim();
        const barcode = parseBarcode(row[colBarcode], i + 1);
        const priceBox = parsePrice(row[colPriceBox]);
        const strips = parseIntClean(row[colStrips], 1) || 1;
        let priceStrip = parsePrice(row[colPriceStrip]);
        if (!priceStrip && strips > 0 && priceBox > 0) {
          priceStrip = parseFloat((priceBox / strips).toFixed(2));
        }

        const stockBoxes = parseIntClean(row[colStockBoxes], 0);
        const stockStrips = parseIntClean(row[colStockStrips], 0);
        const shelf = (row[colShelf] != null ? String(row[colShelf]) : 'A-01').trim() || 'A-01';
        const category = (row[colCategory] != null ? String(row[colCategory]) : 'أدوية عامة').trim() || 'أدوية عامة';
        const reorderLevel = parseIntClean(row[colReorder], 3) || 3;

        medicinesToImport.push({
          trade_name_ar: nameAr || nameEn,
          trade_name: nameEn || nameAr,
          generic_name: generic,
          barcode,
          price_box: priceBox,
          strips_per_box: strips,
          price_strip: priceStrip,
          stock_boxes: stockBoxes,
          stock_strips: stockStrips,
          shelf,
          category,
          reorder_level: reorderLevel
        });
      }

      if (medicinesToImport.length === 0) {
        showToast('لم يتم العثور على أدوية صالحة للإضافة في الملف!', 'warning');
        return;
      }

      const importedCount = await sqliteService.importMedicines(medicinesToImport);

      // Refresh table immediately
      const refreshed = await sqliteService.getPaginatedMedicines({
        page: 1,
        pageSize: itemsPerPage,
        search: '',
        filter: 'ALL',
        category: 'ALL'
      });
      if (refreshed) {
        setSqliteItems(refreshed.items || []);
        setSqliteTotal(refreshed.total || 0);
        setCurrentPage(1);
      }

      // Refresh stats
      const stats = await sqliteService.getInventoryStats();
      if (stats) setSqliteStats(stats);

      showToast(`تم استيراد ${importedCount} صنف دواء بنجاح وإضافتها للمخزن ✓`);
    } catch (err) {
      console.error('Import error:', err);
      const msg = err?.message || String(err);
      if (msg.includes('permission') || msg.includes('locked') || msg.includes('EBUSY') || msg.includes('NotReadable') || msg.includes('access')) {
        showToast('الملف مفتوح حالياً في برنامج Excel! يرجى إغلاق ملف الإكسيل أولاً ثم المحاولة مرة أخرى.', 'warning');
      } else {
        showToast(`حدث خطأ أثناء قراءة الملف: ${msg}`, 'warning');
      }
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Start Quick Inline Edit
  const startQuickEdit = (med) => {
    if (!med) return;
    const canEdit = hasPermission(currentUser, 'canEditPrice');
    if (!canEdit) {
      showToast('ليس لديك صلاحية لتعديل أسعار الأدوية ⚠️', 'warning');
      return;
    }
    setQuickEditingId(med.id);
    setQuickPrice(med.price_box != null ? med.price_box.toString() : '0');
    setQuickStock(med.stock_boxes != null ? med.stock_boxes.toString() : '0');
  };

  // Save Quick Inline Edit
  const saveQuickEdit = async (med) => {
    if (!med) return;
    const newPrice = parseFloat(quickPrice);
    const newStock = parseInt(quickStock, 10);

    if (isNaN(newPrice) || isNaN(newStock) || newPrice < 0 || newStock < 0) {
      setQuickEditingId(null);
      return;
    }

    const strips = med.strips_per_box || 1;
    const updated = {
      ...med,
      price_box: newPrice,
      price_strip: parseFloat((newPrice / strips).toFixed(2)),
      stock_boxes: newStock
    };

    try {
      await sqliteService.saveMedicine(updated);
      if (onSaveMedicine) onSaveMedicine(updated);
      // Reflect the change in the table immediately
      setSqliteItems((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
      const freshStats = await sqliteService.getInventoryStats();
      if (freshStats) setSqliteStats(freshStats);
      showToast(`تم التعديل السريع للصنف [${med.trade_name_ar || med.trade_name}] وحفظه في قاعدة البيانات ⚡`);
    } catch (err) {
      console.warn('Quick edit save error:', err);
      showToast('تعذر حفظ التعديل السريع في قاعدة البيانات. حاول مجدداً.', 'warning');
    }

    setQuickEditingId(null);
  };

  const cancelQuickEdit = () => {
    setQuickEditingId(null);
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-[#0B1220] text-slate-100 overflow-hidden select-none font-cairo">
      
      {/* Toast Alert */}
      {toastMessage && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-4 py-2.5 rounded-2xl shadow-glow-teal flex items-center gap-2 text-xs font-bold">
            <Sparkles className="w-4 h-4" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="flex-1 flex flex-col overflow-y-auto p-4 sm:p-6 space-y-4">
        
        {/* ======================================================== */}
        {/* 1. TOP STATS CARDS (4 CARDS)                             */}
        {/* ======================================================== */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Total Items */}
          <div className="p-4 rounded-2xl bg-[#111A2B] border border-[#23324D] shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 font-medium block mb-1">إجمالي الأصناف المسجلة</span>
              <div className="text-2xl font-black text-white font-mono">
                {(stats.totalItems || 30000).toLocaleString('en-US')}{' '}
                <span className="text-xs font-normal text-slate-400 font-sans">صنف</span>
              </div>
              <span className="text-[10px] text-teal-400 font-medium">دليل الأدوية المصري الشامل</span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-300 shadow-glow-teal">
              <Package className="w-6 h-6" />
            </div>
          </div>

          {/* Total Inventory Value */}
          <div className="p-4 rounded-2xl bg-[#111A2B] border border-[#23324D] shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 font-medium block mb-1">قيمة المخزون بسعر البيع</span>
              <div className="text-2xl font-black text-emerald-400 font-mono" dir="ltr">
                {(stats.totalRetailValue || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}{' '}
                <span className="text-xs font-bold text-emerald-300">ج.م</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono" dir="ltr">
                التكلفة المرجحة: ~{(stats.estimatedCostValue || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })} ج.م
              </span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-300">
              <Coins className="w-6 h-6" />
            </div>
          </div>

          {/* Near Reorder Level */}
          <div className="p-4 rounded-2xl bg-[#111A2B] border border-[#23324D] shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 font-medium block mb-1">أوشكت على النفاد (حد الطلب)</span>
              <div className="text-2xl font-black text-amber-400 font-mono">
                {stats.nearEmptyCount || 0}{' '}
                <span className="text-xs font-normal text-slate-400 font-sans">صنف</span>
              </div>
              <span className="text-[10px] text-amber-400/90 font-medium">تحتاج لإدراجها في طلبيات التوريد</span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-300">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>

          {/* Out of Stock */}
          <div className="p-4 rounded-2xl bg-[#111A2B] border border-[#23324D] shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 font-medium block mb-1">أصناف رصيدها صفر (جاهزة للجرد)</span>
              <div className="text-2xl font-black text-rose-400 font-mono">
                {(stats.outOfStockCount != null ? stats.outOfStockCount : 30000).toLocaleString('en-US')}{' '}
                <span className="text-xs font-normal text-slate-400 font-sans">صنف</span>
              </div>
              <span className="text-[10px] text-rose-400/90 font-medium">جاهزة لاستلام طلبيات الشراء</span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-300">
              <XCircle className="w-6 h-6" />
            </div>
          </div>
        </section>

        {/* ======================================================== */}
        {/* 2. SEARCH, FILTERS & ACTION BAR                          */}
        {/* ======================================================== */}
        <section className="bg-[#111A2B] border border-[#23324D] p-3.5 rounded-2xl shadow-sm space-y-3">
          
          {/* Top Row: Search Input + Add Medicine Button + Export */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            
            {/* Search Input */}
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-teal-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="ابحث بالاسم التجاري، العلمي، المادة الفعالة، مكان الرف، أو امسح الباركود..."
                className="w-full h-11 bg-[#17233A] border border-[#23324D] focus:border-teal-400 focus:shadow-glow-teal rounded-xl pr-10 pl-4 text-white text-xs font-semibold outline-none transition-all placeholder-slate-400"
              />
            </div>

            {/* Category Dropdown */}
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setCurrentPage(1);
              }}
              className="h-11 bg-[#17233A] border border-[#23324D] text-slate-200 text-xs font-medium rounded-xl px-3 outline-none shrink-0"
            >
              <option value="ALL">جميع الأقسام الطبية ({categoriesList.length})</option>
              {categoriesList.map((cat, idx) => (
                <option key={idx} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            {/* Actions: Add New Medicine + Import/Export Excel */}
            <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 flex-wrap sm:flex-nowrap">
              {/* Hidden File Input for CSV Import */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImportCSV}
                accept=".xlsx,.xls,.csv,.txt"
                className="hidden"
              />

              {/* Download Excel Template Button */}
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="h-11 px-3 rounded-xl bg-[#17233A] hover:bg-[#202E4C] border border-[#23324D] text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                title="تحميل شيت إكسيل فارغ جاهز بالأعمدة والترتيب الصحيح"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>تحميل نموذج إكسيل</span>
              </button>

              {/* Import Excel Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="h-11 px-3.5 rounded-xl bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/30 text-teal-300 hover:text-teal-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                title="استيراد الأدوية من ملف إكسيل / CSV"
              >
                <Upload className="w-4 h-4 text-teal-400" />
                <span>استيراد إكسيل</span>
              </button>

              {/* Export Excel Button */}
              <button
                type="button"
                onClick={handleExportCSV}
                className="h-11 px-3.5 rounded-xl bg-[#17233A] hover:bg-[#202E4C] border border-[#23324D] text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                title="تصدير كملف إكسيل / CSV"
              >
                <Download className="w-4 h-4 text-teal-400" />
                <span>تصدير إكسيل</span>
              </button>

              {/* Add New Medicine */}
              <button
                type="button"
                onClick={() => {
                  setMedicineToEdit(null);
                  setShowProductModal(true);
                }}
                className="flex-1 sm:flex-initial h-11 px-4 rounded-xl bg-teal-500 hover:bg-teal-400 active:scale-95 text-slate-950 text-xs font-bold flex items-center justify-center gap-2 shadow-glow-teal transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة دواء جديد</span>
              </button>

              {/* Physical Stock Take / Audit Button */}
              {hasPermission(currentUser, 'canStockTake') && (
                <button
                  type="button"
                  onClick={() => setShowStockTakeModal(true)}
                  className="h-11 px-3.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  title="جرد المخزون الفعلي ومطابقة الأرصدة والتسويات"
                >
                  <Layers className="w-4 h-4 text-purple-400" />
                  <span>جرد المخزون الفعلي</span>
                </button>
              )}
            </div>
          </div>

          {/* Quick Filter Buttons Row */}
          <div className="flex items-center gap-2 overflow-x-auto pt-1 border-t border-[#23324D]/60 text-xs">
            <span className="text-slate-400 text-[11px] font-semibold shrink-0 ml-1">تصفية سريعة:</span>
            
            {[
              { id: 'ALL', label: `الكل (${(sqliteTotal || 0).toLocaleString('en-US')})` },
              { id: 'AVAILABLE', label: 'المتوفر فقط' },
              { id: 'NEAR_EMPTY', label: 'أوشك على النفاد ⚠️' },
              { id: 'OUT_OF_STOCK', label: 'رصيد صفر (جاهز للجرد) 🚫' }
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setActiveFilter(f.id);
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                  activeFilter === f.id
                    ? 'bg-teal-500 text-slate-950 font-bold shadow-glow-teal'
                    : 'bg-[#17233A] text-slate-300 hover:bg-[#202E4C] border border-[#23324D]'
                }`}
              >
                {f.label}
              </button>
            ))}

            <div className="mr-auto text-[11px] text-slate-400 font-mono flex items-center gap-2">
              {isLoading && <RefreshCw className="w-3 h-3 text-teal-400 animate-spin" />}
              <span>
                المعروض: <span className="font-bold text-teal-300">{displayMedicines.length}</span> من إجمالي{' '}
                <span className="font-bold text-teal-300">{(sqliteTotal || 0).toLocaleString('en-US')}</span> صنف (50 بالصفحة)
              </span>
            </div>
          </div>

        </section>

        {/* ======================================================== */}
        {/* 3. PRODUCTS DATA TABLE                                   */}
        {/* ======================================================== */}
        <section className="flex-1 bg-[#111A2B] border border-[#23324D] rounded-2xl shadow-sm overflow-hidden flex flex-col">
          
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-[#141E30] text-slate-300 border-b border-[#23324D] font-bold">
                <tr>
                  <th className="p-3.5">الدواء والاسم العلمي</th>
                  <th className="p-3.5">الباركود</th>
                  <th className="p-3.5">سعر العلبة</th>
                  <th className="p-3.5">سعر الشريط</th>
                  <th className="p-3.5">الرصيد الحالي</th>
                  <th className="p-3.5">مكان الرف</th>
                  <th className="p-3.5 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#23324D]/60 font-medium">
                {displayMedicines.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="text-center py-12 text-slate-400">
                      {isLoading ? (
                        <div className="flex items-center justify-center gap-2 text-teal-400">
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>جارٍ جلب الأدوية من قاعدة البيانات...</span>
                        </div>
                      ) : (
                        <span>لا توجد أدوية مطابقة لمعايير البحث الحالية.</span>
                      )}
                    </td>
                  </tr>
                ) : (
                  displayMedicines.map((med) => {
                    if (!med) return null;
                    const isQuickEditing = quickEditingId === med.id;
                    const boxes = med.stock_boxes || 0;
                    const strips = med.stock_strips || 0;
                    const isZero = boxes === 0 && strips === 0;
                    const isNearEmpty = boxes > 0 && boxes <= (med.reorder_level || 3);
                    const priceBox = med.price_box != null ? Number(med.price_box) : 0;
                    const priceStrip = med.price_strip != null ? Number(med.price_strip) : 0;
                    const stripsCount = med.strips_per_box || 1;

                    return (
                      <tr
                        key={med.id || Math.random()}
                        className={`hover:bg-[#17233A]/70 transition-colors ${
                          isQuickEditing ? 'bg-[#17233A]' : ''
                        }`}
                      >
                        {/* 1. Medicine Info */}
                        <td className="p-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-teal-400 shrink-0"></div>
                            <div>
                              <div className="font-bold text-white text-sm flex items-center gap-2">
                                <span>{med.trade_name_ar || med.trade_name || 'بدون اسم'}</span>
                                <span className="text-[10px] font-mono text-teal-300 font-bold bg-[#17233A] border border-[#23324D] px-2 py-0.5 rounded">
                                  {med.category || 'عام'}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400 font-normal">
                                {med.trade_name || ''} {med.generic_name ? `• ${med.generic_name}` : ''}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 2. Barcode */}
                        <td className="p-3.5 font-mono text-slate-300" dir="ltr">
                          <div className="flex items-center gap-1.5 justify-end">
                            <span className="text-[11px]">{med.barcode || '-'}</span>
                            <Barcode className="w-3.5 h-3.5 text-slate-500" />
                          </div>
                        </td>

                        {/* 3. Box Retail Price */}
                        <td className="p-3.5">
                          {isQuickEditing ? (
                            <input
                              type="number"
                              step="0.5"
                              value={quickPrice}
                              onChange={(e) => setQuickPrice(e.target.value)}
                              className="w-20 h-8 bg-[#0B1220] border border-teal-400 rounded-lg text-emerald-400 font-mono font-bold text-xs px-2 outline-none"
                              dir="ltr"
                            />
                          ) : (
                            <div className="font-extrabold text-emerald-400 font-mono text-sm" dir="ltr">
                              {priceBox.toFixed(2)} <span className="text-[10px] text-slate-400 font-normal font-sans">ج.م</span>
                            </div>
                          )}
                        </td>

                        {/* 4. Strip Retail Price */}
                        <td className="p-3.5">
                          <div className="font-mono text-teal-300 text-xs" dir="ltr">
                            {priceStrip.toFixed(2)} ج.م
                          </div>
                          <div className="text-[10px] text-slate-400 font-normal">
                            ({stripsCount} شرائط / علبة)
                          </div>
                        </td>

                        {/* 5. Current Stock Badge */}
                        <td className="p-3.5">
                          {isQuickEditing ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                value={quickStock}
                                onChange={(e) => setQuickStock(e.target.value)}
                                className="w-16 h-8 bg-[#0B1220] border border-teal-400 rounded-lg text-white font-mono font-bold text-xs px-2 outline-none"
                                dir="ltr"
                              />
                              <span className="text-[11px] text-slate-400">علبة</span>
                            </div>
                          ) : (
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border ${
                                isZero
                                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                                  : isNearEmpty
                                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                                  : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  isZero ? 'bg-rose-400' : isNearEmpty ? 'bg-amber-400' : 'bg-emerald-400'
                                }`}
                              ></span>
                              <span>
                                {boxes} ع {strips > 0 ? `و ${strips} ش` : ''}
                              </span>
                            </span>
                          )}
                        </td>

                        {/* 6. Shelf Location */}
                        <td className="p-3.5 font-mono text-slate-300">
                          <span className="px-2 py-0.5 rounded bg-[#17233A] border border-[#23324D] text-[11px]">
                            {med.shelf || 'A-01'}
                          </span>
                        </td>

                        {/* 7. Action Buttons */}
                        <td className="p-3.5 text-center">
                          {isQuickEditing ? (
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => saveQuickEdit(med)}
                                className="w-8 h-8 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 flex items-center justify-center transition-colors shadow-glow-teal cursor-pointer"
                                title="حفظ التعديل"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={cancelQuickEdit}
                                className="w-8 h-8 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 flex items-center justify-center transition-colors cursor-pointer"
                                title="إلغاء"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Quick Edit Button */}
                              <button
                                type="button"
                                onClick={() => startQuickEdit(med)}
                                className="w-7 h-7 rounded-lg bg-[#17233A] hover:bg-amber-500/20 text-slate-400 hover:text-amber-300 border border-[#23324D] flex items-center justify-center transition-colors cursor-pointer"
                                title="تسعير وتعديل سريع للرصيد"
                              >
                                <Zap className="w-3.5 h-3.5 text-amber-400" />
                              </button>

                              {/* Full Edit Modal */}
                              <button
                                type="button"
                                onClick={() => {
                                  setMedicineToEdit(med);
                                  setShowProductModal(true);
                                }}
                                className="w-7 h-7 rounded-lg bg-[#17233A] hover:bg-teal-500/20 text-slate-400 hover:text-teal-300 border border-[#23324D] flex items-center justify-center transition-colors cursor-pointer"
                                title="تعديل تفصيلي"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              {/* Barcode Sticker Modal */}
                              <button
                                type="button"
                                onClick={() => setBarcodeMedicine(med)}
                                className="w-7 h-7 rounded-lg bg-[#17233A] hover:bg-teal-500/20 text-slate-400 hover:text-teal-300 border border-[#23324D] flex items-center justify-center transition-colors cursor-pointer"
                                title="معاينة وطباعة استيكر الباركود"
                              >
                                <Barcode className="w-3.5 h-3.5 text-teal-400" />
                              </button>

                              {/* Delete */}
                              {hasPermission(currentUser, 'canDeleteItem') && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (window.confirm(`هل أنت متأكد من حذف الصنف [${med.trade_name_ar || med.trade_name}] نهائياً؟`)) {
                                      try {
                                        await sqliteService.deleteMedicine(med.id);
                                        if (onDeleteMedicine) onDeleteMedicine(med.id);
                                        setSqliteItems((prev) => prev.filter((m) => m.id !== med.id));
                                        setSqliteTotal((prev) => Math.max(0, (prev || 1) - 1));
                                        const freshStats = await sqliteService.getInventoryStats();
                                        if (freshStats) setSqliteStats(freshStats);
                                        showToast('تم حذف الصنف من المخزن ✓');
                                      } catch (err) {
                                        console.warn('Delete medicine error:', err);
                                        showToast('تعذر حذف الصنف من قاعدة البيانات.', 'warning');
                                      }
                                    }
                                  }}
                                  className="w-7 h-7 rounded-lg bg-[#17233A] hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-[#23324D] flex items-center justify-center transition-colors cursor-pointer"
                                  title="حذف الصنف"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer: 50 items per page with Next/Prev/Page display */}
          <div className="p-3.5 bg-[#141E30] border-t border-[#23324D] flex items-center justify-between text-xs text-slate-300">
            <div>
              الصفحة <span className="font-bold text-white font-mono">{currentPage}</span> من{' '}
              <span className="font-bold text-white font-mono">{totalPages}</span> (إجمالي{' '}
              <span className="font-bold text-teal-300 font-mono">{(sqliteTotal || 0).toLocaleString('en-US')}</span> دواء)
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage <= 1 || isLoading}
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                className="px-3 py-1.5 rounded-xl bg-[#17233A] disabled:opacity-40 hover:bg-[#202E4C] border border-[#23324D] text-slate-200 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
                <span>الصفحة السابقة</span>
              </button>
              
              <div className="px-3 py-1 rounded-xl bg-[#0B1220] border border-[#23324D] font-mono font-black text-teal-300 text-xs">
                {currentPage} / {totalPages}
              </div>

              <button
                type="button"
                disabled={currentPage >= totalPages || isLoading}
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                className="px-3 py-1.5 rounded-xl bg-[#17233A] disabled:opacity-40 hover:bg-[#202E4C] border border-[#23324D] text-slate-200 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                <span>الصفحة التالية</span>
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>

        </section>

      </div>

      {/* Edit/Add Modal */}
      {showProductModal && (
        <ProductModal
          isOpen={true}
          medicine={medicineToEdit}
          medicineToEdit={medicineToEdit}
          onClose={() => {
            setShowProductModal(false);
            setMedicineToEdit(null);
          }}
          onSave={async (savedMed) => {
            try {
              await sqliteService.saveMedicine(savedMed);
              // Immediately refresh SQLite table view
              const refreshed = await sqliteService.getPaginatedMedicines({
                page: currentPage,
                pageSize: 50,
                search: searchQuery,
                category: selectedCategory,
                filter: activeFilter
              });
              if (refreshed && refreshed.items) {
                setSqliteItems(refreshed.items);
                setSqliteTotal(refreshed.total);
              }
            } catch (err) {
              console.warn('Error saving medicine or refreshing list:', err);
            }
            if (onSaveMedicine) onSaveMedicine(savedMed);
            setShowProductModal(false);
            setMedicineToEdit(null);
            showToast('تم حفظ وتحديث بيانات الدواء بنجاح في قاعدة البيانات ✓');
          }}
        />
      )}

      {/* Barcode Sticker Modal */}
      {barcodeMedicine && (
        <BarcodeStickerModal
          medicine={barcodeMedicine}
          onClose={() => setBarcodeMedicine(null)}
        />
      )}

      {/* Physical Stock Take Modal */}
      {showStockTakeModal && (
        <StockTakeModal
          isOpen={showStockTakeModal}
          currentUser={currentUser}
          onClose={() => setShowStockTakeModal(false)}
          onComplete={async () => {
            const freshStats = await sqliteService.getInventoryStats();
            if (freshStats) setSqliteStats(freshStats);
            const refreshed = await sqliteService.getPaginatedMedicines({
              page: currentPage,
              pageSize: 50,
              search: searchQuery,
              category: selectedCategory,
              filter: activeFilter
            });
            if (refreshed && refreshed.items) {
              setSqliteItems(refreshed.items);
              setSqliteTotal(refreshed.total);
            }
          }}
        />
      )}

    </div>
  );
}
