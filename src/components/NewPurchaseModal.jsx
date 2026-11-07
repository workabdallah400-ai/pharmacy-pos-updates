import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Truck,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Calendar,
  DollarSign,
  Barcode,
  Search,
  Building2,
  UserPlus,
  Package,
  Layers,
  ArrowRight,
  Pill
} from 'lucide-react';
import { sqliteService } from '../db/sqliteService';
import { playBarcodeBeep } from '../utils/sound';
import { getUnitDisplayInfo, getUnitName } from '../utils/pharmacyUnits';
import { ProductModal } from './ProductModal';

export function NewPurchaseModal({
  isOpen,
  onClose,
  suppliers = [],
  medicines = [],
  onSavePurchase,
  onSaveMedicine,
  initialItems = [],
  initialSupplierId = null
}) {
  // --- 1. Suppliers State ---
  const [availableSuppliers, setAvailableSuppliers] = useState(suppliers);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [customSupplierName, setCustomSupplierName] = useState('');
  const [isAddingNewSupplier, setIsAddingNewSupplier] = useState(false);
  const [newSupplierPhone, setNewSupplierPhone] = useState('');

  // --- 2. Invoice Metadata ---
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState('آجل');

  // --- 3. Items in Invoice ---
  const [items, setItems] = useState([]);

  // --- 4. Current Item Entry State ---
  const [barcodeInput, setBarcodeInput] = useState('');
  const [medicineSearch, setMedicineSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  const [selectedMedicine, setSelectedMedicine] = useState(null);
  const [tradeNameAr, setTradeNameAr] = useState('');
  const [tradeNameEn, setTradeNameEn] = useState('');
  const [priceBox, setPriceBox] = useState('');
  const [quantity, setQuantity] = useState('10');
  const [bonus, setBonus] = useState('0');
  const [discountPct, setDiscountPct] = useState('0'); // Default 0 as requested!
  const [batchNo, setBatchNo] = useState('');
  const [expiry, setExpiry] = useState('');

  const [error, setError] = useState('');
  const [showAddNewProductModal, setShowAddNewProductModal] = useState(false);

  const barcodeInputRef = useRef(null);
  const nameInputRef = useRef(null);
  const qtyInputRef = useRef(null);
  const searchDropdownRef = useRef(null);

  // Sync suppliers from SQLite & prop on open
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    sqliteService.getSuppliers().then((dbSups) => {
      if (!isMounted) return;
      const combined = [...(dbSups || [])];
      // Merge unique with prop suppliers
      suppliers.forEach((s) => {
        if (!combined.some((c) => c.id === s.id || c.name === s.name)) {
          combined.push(s);
        }
      });
      setAvailableSuppliers(combined);

      if (initialSupplierId) {
        setSelectedSupplierId(initialSupplierId);
      } else if (combined.length > 0 && !selectedSupplierId) {
        setSelectedSupplierId(combined[0].id);
        setCustomSupplierName(combined[0].name);
      }
    }).catch(console.warn);

    if (initialItems && initialItems.length > 0) {
      setItems(initialItems);
    }

    return () => { isMounted = false; };
  }, [isOpen, initialSupplierId, initialItems, suppliers]);

  // Handle outside clicks to close search dropdown
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (searchDropdownRef.current && !searchDropdownRef.current.contains(e.target) &&
          nameInputRef.current && !nameInputRef.current.contains(e.target)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Live Medicine Search from SQLite (Debounced)
  useEffect(() => {
    if (!medicineSearch.trim() || selectedMedicine?.trade_name_ar === medicineSearch) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const results = await sqliteService.searchMedicines(medicineSearch, 10);
        setSearchResults(results || []);
        setShowSearchDropdown((results || []).length > 0);
      } catch (err) {
        console.warn('Medicine search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [medicineSearch, selectedMedicine]);

  if (!isOpen) return null;

  // Select a medicine from search results or barcode lookup
  const handleSelectMedicine = (med) => {
    if (!med) return;
    setSelectedMedicine(med);
    setTradeNameAr(med.trade_name_ar || med.trade_name || '');
    setTradeNameEn(med.trade_name || '');
    setMedicineSearch(med.trade_name_ar || med.trade_name || '');
    setBarcodeInput(med.barcode || '');
    setPriceBox(med.price_box != null ? String(med.price_box) : '0');
    setShowSearchDropdown(false);
    setError('');
    playBarcodeBeep();

    // Auto-focus quantity field
    setTimeout(() => {
      qtyInputRef.current?.focus();
      qtyInputRef.current?.select();
    }, 50);
  };

  // Barcode Lookup on Enter or Scan
  const handleBarcodeKeyDown = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = barcodeInput.trim();
      if (!code) return;

      try {
        const found = await sqliteService.getMedicineByBarcode(code);
        if (found) {
          handleSelectMedicine(found);
        } else {
          // Check by exact barcode search
          const results = await sqliteService.searchMedicines(code, 1);
          if (results && results.length > 0) {
            handleSelectMedicine(results[0]);
          } else {
            setError(`لم يتم العثور على دواء مسجل بالباركود [${code}]. يمكنك كتابة اسمه وسعره لإضافته.`);
            nameInputRef.current?.focus();
          }
        }
      } catch (err) {
        console.warn('Barcode lookup error:', err);
      }
    }
  };

  // Quick Inline Save New Supplier
  const handleSaveInlineSupplier = async () => {
    const name = customSupplierName.trim();
    if (!name) {
      setError('يرجى كتابة اسم شركة التوزيع أو المورد');
      return;
    }
    try {
      const saved = await sqliteService.ensureSupplier(name, newSupplierPhone.trim());
      if (saved) {
        setAvailableSuppliers((prev) => {
          if (prev.some((s) => s.id === saved.id)) return prev;
          return [...prev, saved];
        });
        setSelectedSupplierId(saved.id);
        setIsAddingNewSupplier(false);
        setError('');
      }
    } catch (e) {
      console.warn('Save inline supplier error:', e);
    }
  };

  // Financial preview for current row
  const unitRetail = parseFloat(priceBox) || 0;
  const parsedDiscount = Math.max(0, Math.min(100, parseFloat(discountPct) || 0));
  const netUnitCost = unitRetail * (1 - parsedDiscount / 100);
  const parsedQty = parseInt(quantity, 10) || 0;
  const parsedBonus = parseInt(bonus, 10) || 0;
  const lineTotalNet = parsedQty * netUnitCost;

  // Add Item to Invoice
  const handleAddItem = (e) => {
    e?.preventDefault();

    const name = (tradeNameAr || medicineSearch).trim();
    if (!name) {
      setError('يرجى إدخال اسم الدواء أو مسح الباركود');
      barcodeInputRef.current?.focus();
      return;
    }

    if (parsedQty <= 0) {
      setError('يرجى تحديد كمية صحيحة بالعلب (1 على الأقل)');
      qtyInputRef.current?.focus();
      return;
    }

    if (unitRetail <= 0) {
      setError('يرجى تحديد سعر الجمهور (البيع) للعلبة');
      return;
    }

    const newItem = {
      medicine_id: selectedMedicine?.id || null,
      barcode: barcodeInput.trim() || selectedMedicine?.barcode || '',
      trade_name_ar: name,
      trade_name: tradeNameEn.trim() || selectedMedicine?.trade_name || name,
      generic_name: selectedMedicine?.generic_name || '',
      stock_boxes: selectedMedicine?.stock_boxes || 0,
      stock_strips: selectedMedicine?.stock_strips || 0,
      unit_type: selectedMedicine?.unit_type || 'tablets',
      strips_per_box: selectedMedicine?.strips_per_box || 1,
      units_per_strip: selectedMedicine?.units_per_strip || 10,
      quantity: parsedQty,
      bonus: parsedBonus,
      price_box: unitRetail,
      discount_pct: parsedDiscount,
      net_box_price: parseFloat(netUnitCost.toFixed(2)),
      total_net: parseFloat(lineTotalNet.toFixed(2)),
      profit_per_box: parseFloat((unitRetail - netUnitCost).toFixed(2)),
      profit_margin_pct: unitRetail > 0 ? parseFloat((((unitRetail - netUnitCost) / unitRetail) * 100).toFixed(1)) : 0,
      batch_no: batchNo.trim() || `BCH-${Math.floor(1000 + Math.random() * 9000)}`,
      expiry: expiry.trim() || '12/2028'
    };

    setItems((prev) => [...prev, newItem]);
    setError('');

    // Reset line fields for next item
    setSelectedMedicine(null);
    setBarcodeInput('');
    setMedicineSearch('');
    setTradeNameAr('');
    setTradeNameEn('');
    setPriceBox('');
    setQuantity('10');
    setBonus('0');
    // Keep discountPct as is for user convenience if they enter consecutive items with same discount
    setBatchNo('');
    setExpiry('');

    // Return focus to barcode
    setTimeout(() => barcodeInputRef.current?.focus(), 50);
  };

  // Remove Item
  const handleRemoveItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Invoice Totals
  const totalRetail = items.reduce((sum, it) => sum + it.price_box * (it.quantity + (it.bonus || 0)), 0);
  const netTotal = items.reduce((sum, it) => sum + it.total_net, 0);
  const totalDiscount = totalRetail - netTotal;
  const avgDiscount = totalRetail > 0 ? (totalDiscount / totalRetail) * 100 : 0;

  // Confirm Invoice
  const handleConfirmInvoice = async () => {
    if (items.length === 0) {
      setError('يرجى إضافة صنف واحد على الأقل داخل الفاتورة');
      return;
    }

    // Determine supplier name and id
    let supName = customSupplierName.trim();
    let supId = selectedSupplierId;

    if (!supName && supId) {
      const found = availableSuppliers.find((s) => s.id === Number(supId));
      if (found) supName = found.name;
    }

    if (!supName) {
      supName = 'مورد عام / نقدي';
    }

    // Ensure supplier exists in DB
    try {
      const ensured = await sqliteService.ensureSupplier(supName);
      if (ensured) {
        supId = ensured.id;
        supName = ensured.name;
      }
    } catch (e) {}

    let currentShiftId = '';
    try {
      const activeShiftStr = localStorage.getItem('PHARMACY_ACTIVE_SHIFT');
      if (activeShiftStr) {
        const parsed = JSON.parse(activeShiftStr);
        if (parsed?.id) currentShiftId = parsed.id;
      }
    } catch (e) {}

    const now = new Date();
    const invoiceCode = `PUR-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getTime()).slice(-6)}`;

    const completedInvoice = {
      id: invoiceCode,
      shift_id: currentShiftId,
      invoice_code: invoiceCode,
      supplier_invoice_no: supplierInvoiceNo.trim() || `INV-${Math.floor(1000 + Math.random() * 9000)}`,
      supplier_id: supId || Date.now(),
      supplier_name: supName,
      date: invoiceDate,
      date_time: new Date().toISOString(),
      payment_method: paymentMethod,
      payment_status: paymentMethod === 'نقدي' ? 'تم السداد' : 'مستحق السداد',
      items_count: items.length,
      total_retail: parseFloat(totalRetail.toFixed(2)),
      total_discount: parseFloat(totalDiscount.toFixed(2)),
      net_total: parseFloat(netTotal.toFixed(2)),
      avg_discount_pct: parseFloat(avgDiscount.toFixed(1)),
      items: [...items]
    };

    try {
      await onSavePurchase(completedInvoice);
      onClose();
    } catch (e) {
      setError(`تعذر حفظ الفاتورة: ${e.message || 'خطأ غير معروف'}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 select-none">
      <div className="w-full max-w-5xl bg-[#111A2B] border border-[#23324D] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#23324D] flex items-center justify-between bg-[#17233A]/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-300 shadow-glow-teal">
              <Truck className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">تسجيل فاتورة شراء وتوريد بضاعة</h3>
              <p className="text-xs text-slate-400">إدخال فواتير الموزعين وتحديث أرصدة المخزن فورياً بالباركود والبحث</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[#17233A] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-[#23324D] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ======================================================== */}
        {/* Invoice Metadata Row: Supplier + Invoice No + Date + Method */}
        {/* ======================================================== */}
        <div className="p-4 bg-[#141E30] border-b border-[#23324D] grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          
          {/* Supplier Selection / Typing */}
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between mb-1">
              <label className="text-slate-300 font-bold flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-teal-400" />
                <span>شركة التوزيع (المورد) *</span>
              </label>
              <button
                type="button"
                onClick={() => setIsAddingNewSupplier(!isAddingNewSupplier)}
                className="text-[11px] text-teal-400 hover:text-teal-300 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>{isAddingNewSupplier ? 'اختيار من القائمة' : 'كتابة اسم مورد جديد'}</span>
              </button>
            </div>

            {isAddingNewSupplier ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="اكتب اسم شركة التوزيع أو المورد هنا..."
                  value={customSupplierName}
                  onChange={(e) => setCustomSupplierName(e.target.value)}
                  className="flex-1 h-10 bg-[#17233A] border border-teal-500/50 focus:border-teal-400 rounded-xl px-3 text-white outline-none font-semibold text-xs placeholder-slate-400"
                />
                <button
                  type="button"
                  onClick={handleSaveInlineSupplier}
                  className="h-10 px-3 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1 shrink-0"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>حفظ</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <select
                  value={selectedSupplierId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedSupplierId(id);
                    const found = availableSuppliers.find((s) => s.id === Number(id));
                    if (found) setCustomSupplierName(found.name);
                  }}
                  className="flex-1 h-10 bg-[#17233A] border border-[#23324D] focus:border-teal-400 rounded-xl px-2.5 text-white outline-none font-semibold text-xs"
                >
                  {availableSuppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.phone ? `(${s.phone})` : ''}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="أو اكتب اسماً..."
                  value={customSupplierName}
                  onChange={(e) => {
                    setCustomSupplierName(e.target.value);
                    setSelectedSupplierId('');
                  }}
                  className="w-1/3 h-10 bg-[#17233A] border border-[#23324D] focus:border-teal-400 rounded-xl px-2.5 text-teal-300 outline-none text-xs"
                  title="يمكنك كتابة اسم المورد مباشرة إذا لم يكن بالقائمة"
                />
              </div>
            )}
          </div>

          {/* Supplier Paper Invoice Number */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">رقم الفاتورة الورقية</label>
            <input
              type="text"
              placeholder="مثال: INV-98421"
              value={supplierInvoiceNo}
              onChange={(e) => setSupplierInvoiceNo(e.target.value)}
              className="w-full h-10 bg-[#17233A] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 text-teal-300 font-mono outline-none font-bold"
            />
          </div>

          {/* Payment Method & Date */}
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="block text-slate-300 font-semibold mb-1">طريقة السداد</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full h-10 bg-[#17233A] border border-[#23324D] focus:border-teal-400 rounded-xl px-2 text-white outline-none font-semibold text-xs"
              >
                <option value="آجل">آجل (مديونية موردين)</option>
                <option value="نقدي">نقدي (كاش من الدرج)</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-slate-300 font-semibold mb-1">التاريخ</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full h-10 bg-[#17233A] border border-[#23324D] focus:border-teal-400 rounded-xl px-2 text-white outline-none font-mono text-xs"
              />
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* Live Medicine Search & Barcode Item Entry Section        */}
        {/* ======================================================== */}
        <div className="p-4 bg-[#111A2B] border-b border-[#23324D]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-teal-300 flex items-center gap-1.5">
                <Package className="w-4 h-4" />
                <span>إدخال صنف للفاتورة (بالباركود أو البحث المباشر):</span>
              </span>

              {/* Quick Button to Add New Medicine to Database directly from Invoice */}
              <button
                type="button"
                onClick={() => setShowAddNewProductModal(true)}
                className="px-2.5 py-1 rounded-xl bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm hover:scale-[1.02]"
                title="إضافة وتسجيل دواء جديد غير مسجل في الدليل والمخزن واستخدامه فوراً في الفاتورة"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة صنف جديد للمخزون</span>
              </button>
            </div>

            {selectedMedicine && (() => {
              const uInfo = getUnitDisplayInfo(selectedMedicine.unit_type);
              return (
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedMedicine.id && (
                    <span className="text-[11px] font-mono bg-teal-500/20 text-teal-300 font-bold px-2 py-0.5 rounded-lg border border-teal-500/40">
                      كود الصنف: #{selectedMedicine.id}
                    </span>
                  )}

                  {selectedMedicine.generic_name && (
                    <span className="text-[11px] text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 rounded-lg" title="المادة الفعالة">
                      مادة فعالة: <strong className="text-white">{selectedMedicine.generic_name}</strong>
                    </span>
                  )}

                  <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-lg flex items-center gap-1">
                    <span>الرصيد بالمخزن: <strong className="font-bold text-white">{selectedMedicine.stock_boxes || 0} علبة</strong> {selectedMedicine.stock_strips > 0 ? ` و ${selectedMedicine.stock_strips} شريط` : ''}</span>
                    {selectedMedicine.shelf && <span>• الرف: {selectedMedicine.shelf}</span>}
                  </span>

                  <span className="text-[11px] font-mono text-teal-300 bg-teal-500/10 border border-teal-500/30 px-2 py-0.5 rounded-lg flex items-center gap-1">
                    <span>الوحدات: <strong className="text-white">علبة</strong></span>
                    {uInfo.hasMidUnit ? (
                      <span> ← <strong className="text-white">{uInfo.midUnit}</strong> ← <strong className="text-white">{uInfo.unitName}</strong></span>
                    ) : (
                      <span> ← <strong className="text-white">{uInfo.unitName}</strong></span>
                    )}
                  </span>
                </div>
              );
            })()}
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs">
            
            {/* 1. Barcode Field (Quick Scan / Enter) */}
            <div className="sm:col-span-2">
              <label className="block text-slate-400 text-[11px] font-semibold mb-1 flex items-center gap-1">
                <Barcode className="w-3.5 h-3.5 text-teal-400" />
                <span>الباركود (سكانر أو كتابة + Enter)</span>
              </label>
              <input
                ref={barcodeInputRef}
                type="text"
                placeholder="امسح أو اكتب الباركود..."
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={handleBarcodeKeyDown}
                className="w-full h-10 bg-[#17233A] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 text-white font-mono outline-none font-bold"
              />
            </div>

            {/* 2. Medicine Name Live Search Input with Dropdown */}
            <div className="sm:col-span-4 relative">
              <label className="block text-slate-400 text-[11px] font-semibold mb-1 flex items-center gap-1">
                <Search className="w-3.5 h-3.5 text-teal-400" />
                <span>اسم الدواء (ابحث في 23,000 صنف) *</span>
              </label>
              <div className="relative">
                <input
                  ref={nameInputRef}
                  type="text"
                  placeholder="اكتب اسم الدواء (مثال: بانادول، أوجمنتين...)"
                  value={medicineSearch}
                  onChange={(e) => {
                    setMedicineSearch(e.target.value);
                    setTradeNameAr(e.target.value);
                  }}
                  onFocus={() => {
                    if (searchResults.length > 0) setShowSearchDropdown(true);
                  }}
                  className="w-full h-10 bg-[#17233A] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 text-white outline-none font-bold text-xs"
                />
                {isSearching && (
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-teal-400 animate-pulse">
                    جارٍ البحث...
                  </span>
                )}
              </div>

              {/* Floating Dynamic Search Results Dropdown */}
              {showSearchDropdown && searchResults.length > 0 && (
                <div
                  ref={searchDropdownRef}
                  className="absolute right-0 top-full mt-1 w-full sm:w-[450px] bg-[#141E30] border border-teal-500/40 rounded-2xl shadow-2xl z-50 overflow-hidden max-h-64 overflow-y-auto divide-y divide-[#23324D]"
                >
                  {searchResults.map((m) => (
                    <div
                      key={m.id}
                      onClick={() => handleSelectMedicine(m)}
                      className="p-2.5 hover:bg-teal-500/15 cursor-pointer flex items-center justify-between text-right transition-colors"
                    >
                      <div className="flex-1">
                        <div className="font-bold text-white text-xs flex items-center gap-2">
                          <span>{m.trade_name_ar || m.trade_name}</span>
                          <span className="text-[10px] text-teal-300 font-mono bg-teal-500/20 px-1.5 py-0.2 rounded">
                            {m.category || 'عام'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {m.trade_name} {m.generic_name ? `• ${m.generic_name}` : ''}
                        </div>
                      </div>

                      <div className="text-left shrink-0 font-mono">
                        <div className="text-emerald-400 font-bold text-xs">{m.price_box} EGP</div>
                        <div className="text-[10px] text-slate-400">رصيد: {m.stock_boxes || 0}</div>
                      </div>
                    </div>
                  ))}
                  <div
                    onClick={() => {
                      setShowSearchDropdown(false);
                      setShowAddNewProductModal(true);
                    }}
                    className="p-2.5 bg-[#17233A] hover:bg-teal-500/20 text-teal-300 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer border-t border-[#23324D] transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>تسجيل دواء جديد باسم [{medicineSearch}]</span>
                  </div>
                </div>
              )}
            </div>

            {/* 3. Retail Box Price (Editable) */}
            <div className="sm:col-span-1">
              <label className="block text-slate-400 text-[11px] font-semibold mb-1">سعر الجمهور *</label>
              <input
                type="number"
                step="0.25"
                min="0"
                placeholder="0.00"
                value={priceBox}
                onChange={(e) => setPriceBox(e.target.value)}
                className="w-full h-10 bg-[#17233A] border border-[#23324D] focus:border-teal-400 text-center font-mono font-bold text-white rounded-xl outline-none"
              />
            </div>

            {/* 4. Quantity Boxes */}
            <div className="sm:col-span-1">
              <label className="block text-slate-400 text-[11px] font-semibold mb-1">الكمية (علب) *</label>
              <input
                ref={qtyInputRef}
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddItem(e);
                }}
                className="w-full h-10 bg-[#17233A] border border-[#23324D] focus:border-teal-400 text-center font-mono font-bold text-white rounded-xl outline-none"
              />
            </div>

            {/* 5. Free Bonus */}
            <div className="sm:col-span-1">
              <label className="block text-slate-400 text-[11px] font-semibold mb-1">بونص مجاني</label>
              <input
                type="number"
                min="0"
                value={bonus}
                onChange={(e) => setBonus(e.target.value)}
                className="w-full h-10 bg-[#17233A] border border-[#23324D] focus:border-teal-400 text-center font-mono font-bold text-emerald-400 rounded-xl outline-none"
              />
            </div>

            {/* 6. Discount % (Default 0 as requested!) */}
            <div className="sm:col-span-1">
              <label className="block text-slate-400 text-[11px] font-semibold mb-1">خصم %</label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="95"
                value={discountPct}
                onChange={(e) => setDiscountPct(e.target.value)}
                className="w-full h-10 bg-[#17233A] border border-[#23324D] focus:border-teal-400 text-center font-mono font-bold text-amber-300 rounded-xl outline-none"
              />
            </div>

            {/* 6.b Expiry Date */}
            <div className="sm:col-span-1">
              <label className="block text-slate-400 text-[11px] font-semibold mb-1">الصلاحية *</label>
              <input
                type="text"
                placeholder="12/2027"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddItem(e);
                }}
                className="w-full h-10 bg-[#17233A] border border-[#23324D] focus:border-teal-400 text-center font-mono font-bold text-amber-300 rounded-xl outline-none text-xs"
                title="تاريخ الصلاحية (شهر/سنة مثل 12/2026 أو 2026-12-01)"
                dir="ltr"
              />
            </div>

            {/* 7. Add Button */}
            <div className="sm:col-span-1 flex items-end">
              <button
                type="button"
                onClick={handleAddItem}
                className="w-full h-10 bg-teal-500 hover:bg-teal-400 text-slate-950 font-black rounded-xl flex items-center justify-center gap-1 shadow-glow-teal transition-all active:scale-95 cursor-pointer"
                title="إضافة الصنف لقائمة الفاتورة"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة</span>
              </button>
            </div>
          </div>

          {/* Real-time Calculation Badge (Retail, Cost, Discount, Net, Margin & Profit) */}
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono bg-[#141E30] p-2.5 rounded-xl border border-[#23324D]">
            <div className="flex items-center gap-3 text-slate-300 flex-wrap">
              <span>سعر البيع للجمهور: <strong className="text-white font-bold">{unitRetail.toFixed(2)} EGP</strong></span>
              <span>•</span>
              <span>الخصم المطبق: <strong className="text-amber-300 font-bold">{parsedDiscount}%</strong></span>
              <span>•</span>
              <span>صافي تكلفة العلبة: <strong className="text-teal-300 font-bold">{netUnitCost.toFixed(2)} EGP</strong></span>
              <span>•</span>
              <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                هامش الربح للعلبة: <strong className="font-bold">{(unitRetail - netUnitCost).toFixed(2)} EGP</strong> ({unitRetail > 0 ? (((unitRetail - netUnitCost) / unitRetail) * 100).toFixed(1) : 0}%)
              </span>
            </div>
            
            <div className="text-emerald-400 font-bold text-xs bg-[#17233A] px-2.5 py-1 rounded-lg border border-emerald-500/30">
              إجمالي الصافي للبند: {(lineTotalNet).toFixed(2)} EGP
            </div>
          </div>

          {error && (
            <div className="mt-2 text-xs font-bold text-rose-400 flex items-center gap-1 animate-in fade-in">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* Items Table List                                         */}
        {/* ======================================================== */}
        <div className="flex-1 overflow-y-auto p-4">
          <table className="w-full text-right text-xs">
            <thead className="bg-[#141E30] text-slate-300 border-b border-[#23324D] font-bold sticky top-0 z-10">
              <tr>
                <th className="p-2.5">الصنف (عربي / إنجليزي / مادة فعالة)</th>
                <th className="p-2.5 text-center">كود الصنف والباركود</th>
                <th className="p-2.5 text-center">الرصيد بالمخزن</th>
                <th className="p-2.5 text-center">الكمية الواردة</th>
                <th className="p-2.5 text-center">بونص</th>
                <th className="p-2.5 text-center">تاريخ الصلاحية</th>
                <th className="p-2.5 text-left">سعر الشراء (صافي)</th>
                <th className="p-2.5 text-center">الخصم %</th>
                <th className="p-2.5 text-left">سعر البيع (جمهور)</th>
                <th className="p-2.5 text-center">هامش الربح</th>
                <th className="p-2.5 text-left">إجمالي الصافي</th>
                <th className="p-2.5 text-center">حذف</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#23324D]/60 font-medium">
              {items.length === 0 ? (
                <tr>
                  <td colSpan="12" className="text-center py-12 text-slate-500">
                    <Package className="w-8 h-8 mx-auto mb-2 opacity-40 text-teal-400" />
                    <span>لم يتم إضافة أصناف للفاتورة بعد. اكتب اسم الدواء أو امسح الباركود واضغط (+ إضافة).</span>
                  </td>
                </tr>
              ) : (
                items.map((it, idx) => {
                  const uInfo = getUnitDisplayInfo(it.unit_type);
                  const marginAmt = typeof it.profit_per_box === 'number' ? it.profit_per_box : ((it.price_box || 0) - (it.net_box_price || 0));
                  const marginPct = typeof it.profit_margin_pct === 'number' ? it.profit_margin_pct : (it.price_box > 0 ? (marginAmt / it.price_box * 100) : 0);

                  return (
                    <tr key={idx} className="hover:bg-[#17233A]/60">
                      {/* 1. Item Name: Arabic + English + Active Ingredient */}
                      <td className="p-2.5 max-w-[240px]">
                        <div className="font-bold text-white text-xs">{it.trade_name_ar || it.trade_name}</div>
                        {it.trade_name && it.trade_name !== it.trade_name_ar && (
                          <div className="text-[11px] text-teal-300 font-medium truncate" dir="ltr">{it.trade_name}</div>
                        )}
                        {it.generic_name && (
                          <div className="text-[10px] text-cyan-400/90 truncate mt-0.5" title={`المادة الفعالة: ${it.generic_name}`}>
                            🧪 {it.generic_name}
                          </div>
                        )}
                      </td>

                      {/* 2. Item Code & Barcode */}
                      <td className="p-2.5 text-center font-mono">
                        <div className="inline-block px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-300 border border-teal-500/30 text-[10px] font-bold">
                          كود: #{it.medicine_id || '-'}
                        </div>
                        {it.barcode ? (
                          <div className="text-[10px] text-slate-400 mt-0.5 font-mono">{it.barcode}</div>
                        ) : null}
                      </td>

                      {/* 3. Existing Stock Balance */}
                      <td className="p-2.5 text-center font-mono text-slate-300">
                        <span className="bg-[#17233A] px-2 py-0.5 rounded border border-[#23324D] text-xs">
                          {it.stock_boxes || 0} علبة
                        </span>
                      </td>

                      {/* 4. Incoming Quantity */}
                      <td className="p-2.5 text-center font-mono font-bold text-teal-300">
                        <span className="text-xs bg-teal-500/15 px-2 py-0.5 rounded border border-teal-500/30">
                          {it.quantity} علبة
                        </span>
                      </td>

                      {/* 5. Bonus */}
                      <td className="p-2.5 text-center font-mono font-bold text-emerald-400">
                        {it.bonus > 0 ? (
                          <span className="bg-emerald-500/15 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30 text-xs">
                            +{it.bonus}
                          </span>
                        ) : (
                          <span className="text-slate-500 text-xs">0</span>
                        )}
                      </td>

                      {/* 6. Expiry Date */}
                      <td className="p-2.5 text-center font-mono">
                        <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs font-bold" dir="ltr">
                          {it.expiry || '-'}
                        </span>
                        {it.batch_no && (
                          <span className="block text-[9px] text-slate-400 font-normal mt-0.5" dir="ltr">
                            تشغيلة: {it.batch_no}
                          </span>
                        )}
                      </td>

                      {/* 7. Purchase Cost (Net) */}
                      <td className="p-2.5 text-left font-mono font-bold text-teal-300" dir="ltr">
                        {it.net_box_price.toFixed(2)}
                      </td>

                      {/* 8. Discount % */}
                      <td className="p-2.5 text-center font-mono font-bold">
                        {it.discount_pct > 0 ? (
                          <span className="text-amber-300 bg-amber-500/15 px-1.5 py-0.5 rounded border border-amber-500/30 text-xs">
                            {it.discount_pct}%
                          </span>
                        ) : (
                          <span className="text-slate-500 text-xs">بدون</span>
                        )}
                      </td>

                      {/* 9. Retail Selling Price */}
                      <td className="p-2.5 text-left font-mono font-bold text-white" dir="ltr">
                        {it.price_box.toFixed(2)}
                      </td>

                      {/* 10. Profit Margin (Amount + %) */}
                      <td className="p-2.5 text-center font-mono">
                        <div className="text-emerald-400 font-bold text-xs" dir="ltr">
                          +{marginAmt.toFixed(2)} EGP
                        </div>
                        <div className="text-[10px] text-emerald-300/80 font-bold">
                          ({marginPct.toFixed(1)}%)
                        </div>
                      </td>

                      {/* 11. Net Total of Line */}
                      <td className="p-2.5 text-left font-mono font-extrabold text-emerald-400 text-xs" dir="ltr">
                        {it.total_net.toFixed(2)}
                      </td>

                      {/* 12. Delete Action */}
                      <td className="p-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-slate-500 hover:text-rose-400 p-1 transition-colors cursor-pointer"
                          title="حذف البند"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ======================================================== */}
        {/* Bottom Financial Summary & Confirm Button                */}
        {/* ======================================================== */}
        <div className="p-4 bg-[#141E30] border-t border-[#23324D] space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-[#111A2B] p-2.5 rounded-xl border border-[#23324D]">
              <span className="text-slate-400 text-[11px] block">إجمالي الجمهور:</span>
              <span className="font-mono font-bold text-white text-sm" dir="ltr">{totalRetail.toFixed(2)} EGP</span>
            </div>

            <div className="bg-[#111A2B] p-2.5 rounded-xl border border-[#23324D]">
              <span className="text-slate-400 text-[11px] block">إجمالي الخصم (وفر الصيدلي):</span>
              <span className="font-mono font-bold text-emerald-400 text-sm" dir="ltr">{totalDiscount.toFixed(2)} EGP</span>
            </div>

            <div className="bg-[#111A2B] p-2.5 rounded-xl border border-teal-500/40 shadow-glow-teal">
              <span className="text-teal-300 text-[11px] font-bold block">صافي الفاتورة للدفع:</span>
              <span className="font-mono font-black text-emerald-400 text-base" dir="ltr">{netTotal.toFixed(2)} EGP</span>
            </div>

            <div className="bg-[#111A2B] p-2.5 rounded-xl border border-[#23324D]">
              <span className="text-slate-400 text-[11px] block">متوسط الخصم المحقق:</span>
              <span className="font-mono font-bold text-amber-300 text-sm">{avgDiscount.toFixed(1)}%</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-[#17233A] hover:bg-[#202E4C] text-white text-xs font-semibold border border-[#23324D] cursor-pointer"
            >
              إلغاء
            </button>

            <button
              type="button"
              onClick={handleConfirmInvoice}
              disabled={items.length === 0}
              className={`flex-1 py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all ${
                items.length > 0
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-glow-teal cursor-pointer active:scale-[0.99]'
                  : 'bg-slate-800 text-slate-600 cursor-not-allowed border border-transparent'
              }`}
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>اعتماد الفاتورة وتوريد المخزون فورياً ({items.length} صنف)</span>
            </button>
          </div>
        </div>

      </div>

      {/* Embedded ProductModal to add a brand new medicine to DB from within the Purchase Invoice */}
      {showAddNewProductModal && (
        <ProductModal
          isOpen={true}
          medicine={null}
          medicineToEdit={null}
          onClose={() => setShowAddNewProductModal(false)}
          onSave={async (newMedData) => {
            try {
              const saved = await sqliteService.saveMedicine(newMedData);
              const realSavedMed = saved || newMedData;
              if (onSaveMedicine) {
                onSaveMedicine(realSavedMed);
              }
              // Automatically select and use the newly added medicine in the invoice line
              handleSelectMedicine(realSavedMed);
              setShowAddNewProductModal(false);
              playBarcodeBeep();
            } catch (err) {
              console.warn('Failed to save new medicine from purchase modal:', err);
              setError('تعذر حفظ الدواء الجديد: ' + (err?.message || 'خطأ غير معروف'));
            }
          }}
        />
      )}
    </div>
  );
}
