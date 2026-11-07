import { getUnitName, getUnitDisplayInfo } from '../utils/pharmacyUnits';
import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Barcode,
  Package,
  Pill,
  Trash2,
  Plus,
  Minus,
  CheckCircle2,
  DollarSign,
  CreditCard,
  Smartphone,
  BookUser,
  Dna,
  RotateCcw,
  Sparkles,
  ShoppingBag,
  AlertTriangle,
  Layers,
  Inbox,
  Volume2,
  Coins
} from 'lucide-react';
import { playBarcodeBeep, playCashDrawerSound } from '../utils/sound';
import { AlternativesModal } from './AlternativesModal';
import { ReceiptModal } from './ReceiptModal';
import { ParkedBillsModal } from './ParkedBillsModal';
import { QuickExpenseModal } from './QuickExpenseModal';
import { MobileQRModal } from './MobileQRModal';
import { ReturnInvoiceModal } from './ReturnInvoiceModal';
import { sqliteService } from '../db/sqliteService';
import { hasPermission } from '../utils/permissions';
import { calculateCartTotal } from '../utils/pricing';

export function POSView({
  currentUser,
  medicines: propsMedicines,
  onUpdateMedicines,
  currentShift,
  isShiftOpen = false,
  onOpenShiftModal,
  onSaleCompleted
}) {
  // Real SQLite Medicines Catalog State (Clean 0 items)
  const [sqliteMedicines, setSqliteMedicines] = useState([]);
  const medicines = sqliteMedicines;
  const setMedicines = onUpdateMedicines || (() => {});
  const [searchQuery, setSearchQuery] = useState('');
  
  // Cart state
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [selectedCustomerId, setSelectedCustomerId] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('كاش');
  const [paidAmount, setPaidAmount] = useState('');
  
  // Invoice Sequence
  const [invoiceSeq, setInvoiceSeq] = useState(1001);
  const [shiftSalesTotal, setShiftSalesTotal] = useState(0);
  const [shiftInvoicesCount, setShiftInvoicesCount] = useState(0);

  // Parked bills state
  const [parkedBills, setParkedBills] = useState([]);

  // Real customers from SQLite (for credit / آجل sales)
  const [dbCustomers, setDbCustomers] = useState([]);

  // Toast notification state
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');

  // Modals state
  const [selectedAltMedicine, setSelectedAltMedicine] = useState(null);
  const [showAltModal, setShowAltModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [lastCompletedInvoice, setLastCompletedInvoice] = useState(null);
  const [showParkedModal, setShowParkedModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [fefoAlertModal, setFefoAlertModal] = useState(null); // { medicineName, scannedExpiry, oldestExpiry, oldestBatch, boxesAvailable }

  // Search input ref for persistent auto-focus
  const searchInputRef = useRef(null);

  // Prevents a double-click / key-repeat on F1 from saving the same cart twice.
  const submittingRef = useRef(false);

  // Selling is blocked while no shift is open (enforced by requireShift);
  // this ref only avoids repeating the same warning in a single state.
  const noShiftWarnedRef = useRef(false);

  // 1. Crash Recovery: Load saved cart on initial mount
  useEffect(() => {
    try {
      const savedCart = localStorage.getItem('PHARMACY_ACTIVE_CART');
      if (savedCart) {
        const parsed = JSON.parse(savedCart);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCart(parsed);
          showToast('تم استرجاع بنود الفاتورة المحفوظة تلقائياً بنجاح 🛡️', 'success');
        }
      }
    } catch (e) {}
  }, []);

  // 2. Crash Recovery: Auto-save cart to localStorage whenever it changes
  useEffect(() => {
    try {
      if (cart.length > 0) {
        localStorage.setItem('PHARMACY_ACTIVE_CART', JSON.stringify(cart));
      } else {
        localStorage.removeItem('PHARMACY_ACTIVE_CART');
      }
    } catch (e) {}
  }, [cart]);

  // Keep search bar focused
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Initialise the footer shift counters from the real shift, so switching
  // tabs (which remounts POSView) no longer resets "shift sales" to zero.
  useEffect(() => {
    let alive = true;
    const loadShiftStats = async () => {
      if (!currentShift?.id) {
        setShiftSalesTotal(0);
        setShiftInvoicesCount(0);
        return;
      }
      const total = Number(currentShift.total_sales)
        || ['cash_sales', 'visa_sales', 'instapay_sales', 'credit_sales']
          .reduce((sum, key) => sum + (Number(currentShift[key]) || 0), 0);
      setShiftSalesTotal(total);
      try {
        const audit = await sqliteService.getShiftFullAudit(currentShift.id);
        if (alive) setShiftInvoicesCount(audit?.invoices?.length || 0);
      } catch (e) {}
    };
    loadShiftStats();
    return () => { alive = false; };
  }, [currentShift?.id]);

  const showToast = (msg, type = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => {
      setToastMessage('');
    }, 3500);
  };

  // Strict Shift check: If shift is closed, trigger open shift modal and block selling
  const requireShift = () => {
    if (!isShiftOpen) {
      showToast('⚠️ لا يمكن البيع أو إضافة أصناف: يجب فتح وردية أولاً!', 'error');
      if (typeof onOpenShiftModal === 'function') {
        onOpenShiftModal();
      }
      return false;
    }
    return true;
  };

  useEffect(() => {
    if (isShiftOpen) noShiftWarnedRef.current = false;
  }, [isShiftOpen]);

  // 3. Global Keyboard Shortcuts Listener (F1, F2, F3, F4, F5, F6, F7, F8, F12)
  useEffect(() => {
    const handleGlobalShortcuts = (e) => {
      // Avoid triggering when typing in modal inputs
      if (e.key === 'F1') {
        e.preventDefault();
        handleCheckout();
      } else if (e.key === 'F2') {
        e.preventDefault();
        handleParkCurrentBill();
      } else if (e.key === 'F3') {
        e.preventDefault();
        setShowParkedModal(true);
      } else if (e.key === 'F4') {
        e.preventDefault();
        handleClearCart();
      } else if (e.key === 'F5') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'F6') {
        e.preventDefault();
        const med = filteredMedicines[0] || medicines[0];
        if (med) {
          setSelectedAltMedicine(med);
          setShowAltModal(true);
        }
      } else if (e.key === 'F7') {
        e.preventDefault();
        handleKickCashDrawer();
      } else if (e.key === 'F8') {
        e.preventDefault();
        if (requireShift()) setShowExpenseModal(true);
      } else if (e.key === 'F12') {
        e.preventDefault();
        setShowQRModal(true);
      }
    };

    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  });

  // Load initial 30,000 medicines batch & Live SQLite Fast Search (1-10ms)
  useEffect(() => {
    let isCurrent = true;
    const fetchMeds = async () => {
      try {
        const results = await sqliteService.searchMedicines(searchQuery, 50);
        if (isCurrent && Array.isArray(results)) {
          setSqliteMedicines(results);
        }
      } catch (err) {
        console.warn('SQLite search fallback to mock:', err);
      }
    };

    const timer = setTimeout(fetchMeds, 60);
    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  // Active medicines display from SQLite (falling back to prop medicines if SQLite search empty)
  const filteredMedicines = sqliteMedicines.length > 0 ? sqliteMedicines : medicines;

  // Load customers from SQLite for the credit (آجل) payment flow
  useEffect(() => {
    let isCurrent = true;
    sqliteService.getCustomers()
      .then((rows) => { if (isCurrent && Array.isArray(rows)) setDbCustomers(rows); })
      .catch(() => {});
    return () => { isCurrent = false; };
  }, []);

  // Handle Barcode Scanner Enter Key (Sub-millisecond indexed lookup)
  const handleSearchKeyDown = async (e) => {
    if (e.key === 'Enter') {
      const q = searchQuery.trim();
      if (!q) return;

      // Strict shift gate: scanning is blocked if no shift is open
      if (!requireShift()) return;

      // Check if scanned code is a specific batch barcode
      try {
        const batchMatch = await sqliteService.getBatchByBarcode(q);
        if (batchMatch && batchMatch.medicine_id) {
          const medObj = {
            id: batchMatch.medicine_id,
            trade_name: batchMatch.trade_name,
            trade_name_ar: batchMatch.trade_name_ar,
            price_box: batchMatch.price_box,
            price_strip: batchMatch.price_strip,
            strips_per_box: batchMatch.strips_per_box,
            units_per_strip: batchMatch.units_per_strip,
            unit_type: batchMatch.unit_type,
            stock_boxes: batchMatch.quantity || 0,
            stock_strips: 0,
            stock_units: 0,
            expiry: batchMatch.expiry
          };

          // Strict FEFO check: is there an older active batch?
          const olderBatch = await sqliteService.checkOlderExpiryBatch(batchMatch.medicine_id, batchMatch.expiry, batchMatch.batch_no);
          if (olderBatch) {
            setFefoAlertModal({
              medicineName: medObj.trade_name_ar || medObj.trade_name,
              scannedExpiry: batchMatch.expiry,
              oldestExpiry: olderBatch.earliestExpiry,
              oldestBatch: olderBatch.earliestBatch,
              boxesAvailable: olderBatch.boxesAvailable
            });
            showToast(`⚠️ عفواً! هناك صلاحية أقدم (${olderBatch.earliestExpiry}) لنفس الدواء بالمخزن!`, 'error');
            setSearchQuery('');
            return;
          }

          addToCart(medObj, 'box');
          setSearchQuery('');
          return;
        }
      } catch (err) {}

      // Exact barcode match via SQLite index
      try {
        const exactBarcode = await sqliteService.getMedicineByBarcode(q);
        if (exactBarcode) {
          // If the scanned medicine has an active older batch in purchase_items, enforce FEFO
          const olderBatch = await sqliteService.checkOlderExpiryBatch(exactBarcode.id, exactBarcode.expiry);
          if (olderBatch) {
            setFefoAlertModal({
              medicineName: exactBarcode.trade_name_ar || exactBarcode.trade_name,
              scannedExpiry: exactBarcode.expiry,
              oldestExpiry: olderBatch.earliestExpiry,
              oldestBatch: olderBatch.earliestBatch,
              boxesAvailable: olderBatch.boxesAvailable
            });
            showToast(`⚠️ عفواً! هناك صلاحية أقدم (${olderBatch.earliestExpiry}) لنفس الدواء بالمخزن!`, 'error');
            setSearchQuery('');
            return;
          }

          addToCart(exactBarcode, 'box');
          setSearchQuery('');
          return;
        }
      } catch (err) {}

      // First match
      if (filteredMedicines.length > 0) {
        addToCart(filteredMedicines[0], 'box');
        setSearchQuery('');
      }
    }
  };

  // Add Item to Cart (unitType: 'box' | 'strip' | 'unit')
  const addToCart = (medicine, unitType = 'box') => {
    // 1. Strict Shift Check: completely block adding if no open shift
    if (!requireShift()) return;

    // 2. Strict Zero-Stock Guard: compute exact smallest units available
    const stockBoxes = parseInt(medicine.stock_boxes, 10) || 0;
    const stockStrips = parseInt(medicine.stock_strips, 10) || 0;
    const stockUnits = parseInt(medicine.stock_units, 10) || 0;
    const stripsPerBox = Math.max(1, parseInt(medicine.strips_per_box, 10) || 1);
    const unitsPerStrip = Math.max(1, parseInt(medicine.units_per_strip, 10) || 10);
    const totalSmallestUnits = (stockBoxes * stripsPerBox * unitsPerStrip) + (stockStrips * unitsPerStrip) + stockUnits;

    if (totalSmallestUnits <= 0) {
      showToast(`❌ لا يمكن إضافة [${medicine.trade_name_ar || medicine.trade_name}]: الرصيد 0 في المخزن!`, 'error');
      return;
    }

    // Check if adding this unit exceeds available stock
    const neededSmallestUnits = unitType === 'box' ? (stripsPerBox * unitsPerStrip) : (unitType === 'strip' ? unitsPerStrip : 1);
    if (neededSmallestUnits > totalSmallestUnits) {
      showToast(`❌ الكمية المطلوبة غير متوفرة في المخزن!`, 'error');
      return;
    }

    // Check existing cart items for this medicine
    const currentUnitsInCart = cart
      .filter((item) => item.id === medicine.id)
      .reduce((sum, item) => {
        const u = item.unitType || 'box';
        const spb = Math.max(1, parseInt(item.strips_per_box, 10) || stripsPerBox);
        const ups = Math.max(1, parseInt(item.units_per_strip, 10) || unitsPerStrip);
        const mult = u === 'box' ? (spb * ups) : (u === 'strip' ? ups : 1);
        return sum + (item.quantity * mult);
      }, 0);

    if (currentUnitsInCart + neededSmallestUnits > totalSmallestUnits) {
      showToast(`❌ تجاوز إجمالي الرصيد المتاح بالمخزن لهذا الصنف!`, 'error');
      return;
    }

    playBarcodeBeep();

    setCart((prevCart) => {
      const existing = prevCart.findIndex(
        (item) => item.id === medicine.id && item.unitType === unitType
      );

      let unitPrice = medicine.price_box;
      if (unitType === 'strip') unitPrice = medicine.price_strip;
      else if (unitType === 'unit') unitPrice = medicine.price_unit || (medicine.price_strip / unitsPerStrip);

      if (existing > -1) {
        const updated = [...prevCart];
        updated[existing].quantity += 1;
        return updated;
      } else {
        return [
          ...prevCart,
          {
            ...medicine,
            unitType,
            unitPrice: parseFloat(Number(unitPrice).toFixed(2)),
            quantity: 1
          }
        ];
      }
    });

    searchInputRef.current?.focus();
  };

  // Cycle Unit Type in Cart: Box -> Strip -> Unit -> Box
  const toggleUnitType = (index) => {
    setCart((prev) => {
      const updated = [...prev];
      const item = updated[index];
      const spb = Math.max(1, parseInt(item.strips_per_box, 10) || 1);
      const ups = Math.max(1, parseInt(item.units_per_strip, 10) || 10);
      
      const unitInfo = getUnitDisplayInfo(item.unit_type);
      const hasStrip = unitInfo.hasMidUnit;

      let nextUnit = 'box';
      if (item.unitType === 'box') {
        nextUnit = (hasStrip && spb > 1) ? 'strip' : 'unit';
      } else if (item.unitType === 'strip') {
        nextUnit = 'unit';
      } else {
        nextUnit = 'box';
      }

      let newPrice = item.price_box;
      if (nextUnit === 'strip') {
        newPrice = item.price_strip || (item.price_box / spb);
      } else if (nextUnit === 'unit') {
        newPrice = item.price_unit || (item.price_strip ? item.price_strip / ups : item.price_box / (spb * ups));
      }

      item.unitType = nextUnit;
      item.unitPrice = parseFloat(Number(newPrice).toFixed(2));
      return updated;
    });
  };

  // Update Quantity with stock validation
  const updateQuantity = (index, delta) => {
    setCart((prev) => {
      const updated = [...prev];
      const item = updated[index];
      const newQty = item.quantity + delta;
      if (newQty <= 0) {
        return updated.filter((_, i) => i !== index);
      }

      const stockBoxes = parseInt(item.stock_boxes, 10) || 0;
      const stockStrips = parseInt(item.stock_strips, 10) || 0;
      const stockUnits = parseInt(item.stock_units, 10) || 0;
      const spb = Math.max(1, parseInt(item.strips_per_box, 10) || 1);
      const ups = Math.max(1, parseInt(item.units_per_strip, 10) || 10);
      const totalAvailable = (stockBoxes * spb * ups) + (stockStrips * ups) + stockUnits;

      const itemMultiplier = item.unitType === 'box' ? (spb * ups) : (item.unitType === 'strip' ? ups : 1);
      const otherUnits = updated
        .filter((it, idx) => it.id === item.id && idx !== index)
        .reduce((s, it) => {
          const m = it.unitType === 'box' ? (spb * ups) : (it.unitType === 'strip' ? ups : 1);
          return s + (it.quantity * m);
        }, 0);

      if (delta > 0 && (otherUnits + (newQty * itemMultiplier) > totalAvailable)) {
        showToast(`❌ لا يمكن زيادة الكمية: إجمالي الرصيد المتاح بالمخزن نفد!`, 'error');
        return prev;
      }

      item.quantity = newQty;
      return updated;
    });
  };

  // Direct Quantity Change with stock validation
  const handleDirectQuantity = (index, val) => {
    const num = parseInt(val, 10);
    setCart((prev) => {
      const updated = [...prev];
      const item = updated[index];
      if (isNaN(num) || num <= 0) {
        item.quantity = 1;
        return updated;
      }

      const stockBoxes = parseInt(item.stock_boxes, 10) || 0;
      const stockStrips = parseInt(item.stock_strips, 10) || 0;
      const stockUnits = parseInt(item.stock_units, 10) || 0;
      const spb = Math.max(1, parseInt(item.strips_per_box, 10) || 1);
      const ups = Math.max(1, parseInt(item.units_per_strip, 10) || 10);
      const totalAvailable = (stockBoxes * spb * ups) + (stockStrips * ups) + stockUnits;

      const itemMultiplier = item.unitType === 'box' ? (spb * ups) : (item.unitType === 'strip' ? ups : 1);
      const otherUnits = updated
        .filter((it, idx) => it.id === item.id && idx !== index)
        .reduce((s, it) => {
          const m = it.unitType === 'box' ? (spb * ups) : (it.unitType === 'strip' ? ups : 1);
          return s + (it.quantity * m);
        }, 0);

      const maxAllowed = Math.floor(Math.max(0, totalAvailable - otherUnits) / itemMultiplier);
      if (num > maxAllowed) {
        showToast(`❌ الرصيد المتاح بالمخزن (${maxAllowed}) فقط!`, 'error');
        item.quantity = Math.max(1, maxAllowed);
      } else {
        item.quantity = num;
      }
      return updated;
    });
  };

  // Remove Item
  const removeItem = (index) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  // Clear / New Cart
  const handleClearCart = () => {
    if (cart.length > 0) {
      setCart([]);
      setDiscount(0);
      setPaidAmount('');
      showToast('تم تفريغ السلة وبدء فاتورة جديدة (F4)', 'info');
    }
    searchInputRef.current?.focus();
  };

  // Park Current Bill (F2)
  const handleParkCurrentBill = () => {
    if (cart.length === 0) {
      showToast('السلة فارغة! لا توجد بنود لتعليقها', 'warning');
      return;
    }

    const newParked = {
      id: parkedBills.length + 1,
      items: [...cart],
      total: calculateTotal(),
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
    };

    setParkedBills((prev) => [...prev, newParked]);
    setCart([]);
    setDiscount(0);
    setPaidAmount('');
    showToast(`تم تعليق الفاتورة #${newParked.id} بنجاح (F2)`, 'success');
    searchInputRef.current?.focus();
  };

  // Resume Parked Bill
  const handleResumeParkedBill = (bill) => {
    setCart(bill.items);
    setParkedBills((prev) => prev.filter((b) => b.id !== bill.id));
    showToast(`تم استدعاء الفاتورة المعلقة #${bill.id} للسلة بنجاح!`, 'success');
    searchInputRef.current?.focus();
  };

  // Delete Parked Bill
  const handleDeleteParkedBill = (id) => {
    setParkedBills((prev) => prev.filter((b) => b.id !== id));
    showToast('تم حذف الفاتورة المعلقة', 'info');
  };

  // Open Cash Drawer (F7)
  const handleKickCashDrawer = () => {
    playCashDrawerSound();
    if (typeof window !== 'undefined' && window.require) {
      try {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.invoke('hardware:kickDrawer');
      } catch (e) {}
    }
    showToast('تم إرسال نبضة فتح درج النقدية الإلكتروني (F7) 💵', 'success');
  };

  // Calculations
  const calculateSubtotal = () => {
    return cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  };

  const calculateTotal = () => {
    const sub = calculateSubtotal();
    return calculateCartTotal(sub, discount).total;
  };

  const currentSubtotal = calculateSubtotal();
  const currentTotal = calculateTotal();
  const currentPaid = parseFloat(paidAmount) || currentTotal;
  const changeAmount = currentPaid > currentTotal ? currentPaid - currentTotal : 0;

  // Complete & Checkout (F1)
  const handleCheckout = async () => {
    // 1. Strict Shift Check: Completely block checkout if no open shift
    if (!requireShift()) return;

    if (cart.length === 0) {
      showToast('عفواً، السلة فارغة! أضف أدوية أولاً لإتمام البيع.', 'warning');
      return;
    }

    // Check discount validity
    const rawDisc = parseFloat(discount);
    if (!isNaN(rawDisc) && rawDisc < 0) {
      showToast('⚠️ لا يمكن تطبيق قيمة خصم سالبة.', 'warning');
      return;
    }
    const safeDisc = Math.max(0, isNaN(rawDisc) ? 0 : rawDisc);
    if (safeDisc > currentSubtotal) {
      showToast('⚠️ قيمة الخصم لا يمكن أن تتجاوز إجمالي الفاتورة.', 'warning');
      return;
    }

    // 2. Strict Zero-Stock and Over-Stock Verification.
    // Re-read stock from SQLite (the cart may hold a stale snapshot) and
    // aggregate demand per medicine so a box line + a strip line of the same
    // medicine cannot each pass against the full stock.
    const demandByMedicine = new Map();
    for (const item of cart) {
      const medicineId = Number(item.id);
      const qty = Number(item.quantity) || 0;
      if (!medicineId || qty <= 0) continue;

      let med = item;
      try {
        const fresh = await sqliteService.getMedicineById(medicineId);
        if (fresh) med = fresh;
      } catch (e) {}

      const spb = Math.max(1, parseInt(med.strips_per_box, 10) || 1);
      const ups = Math.max(1, parseInt(med.units_per_strip, 10) || 10);
      const existing = demandByMedicine.get(medicineId) || { med, spb, ups, neededUnits: 0 };
      
      let unitsNeeded = 0;
      if (item.unitType === 'box') unitsNeeded = qty * spb * ups;
      else if (item.unitType === 'strip') unitsNeeded = qty * ups;
      else unitsNeeded = qty;

      existing.neededUnits += unitsNeeded;
      demandByMedicine.set(medicineId, existing);
    }

    for (const { med, spb, ups, neededUnits } of demandByMedicine.values()) {
      const stockBoxes = parseInt(med.stock_boxes, 10) || 0;
      const stockStrips = parseInt(med.stock_strips, 10) || 0;
      const stockUnits = parseInt(med.stock_units, 10) || 0;
      const availableUnits = (stockBoxes * spb * ups) + (stockStrips * ups) + stockUnits;
      const name = med.trade_name_ar || med.trade_name;

      if (availableUnits <= 0) {
        showToast(`❌ الصنف [${name}] نفد من المخزن تماماً (رصيد 0). يرجى حذفه لإتمام البيع!`, 'error');
        return;
      }
      if (neededUnits > availableUnits) {
        showToast(`❌ الكمية المطلوبة من [${name}] تتجاوز رصيد المخزن (المتاح ${availableUnits} وحدة فقط)!`, 'error');
        return;
      }
    }

    playCashDrawerSound();

    // Trigger electronic drawer kick
    if (typeof window !== 'undefined' && window.require) {
      try {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.invoke('hardware:kickDrawer');
      } catch (e) {}
    }

    const customer = dbCustomers.find((c) => Number(c.id) === Number(selectedCustomerId));

    if ((paymentMethod === 'آجل' || paymentMethod === 'مختلط') && !customer) {
      showToast('⚠️ اختر عميلاً مسجلاً أولاً لإتمام البيع بالآجل أو الدفع المختلط.', 'warning');
      return;
    }

    let splitPaidCash = 0;
    let splitPaidCredit = 0;
    if (paymentMethod === 'مختلط') {
      splitPaidCash = parseFloat(paidAmount) || 0;
      if (splitPaidCash <= 0 || splitPaidCash >= currentTotal) {
        showToast('⚠️ في الدفع المختلط، يجب أن يكون المبلغ المدفوع كاش أكبر من صفر وأقل من إجمالي الفاتورة.', 'warning');
        return;
      }
      splitPaidCredit = Math.round((currentTotal - splitPaidCash) * 100) / 100;
    }

    if ((paymentMethod === 'آجل' || paymentMethod === 'مختلط') && customer) {
      const limit = Number(customer.credit_limit) || 0;
      const balance = Number(customer.balance) || 0;
      const addedDebt = paymentMethod === 'مختلط' ? splitPaidCredit : currentTotal;
      if (limit > 0 && balance + addedDebt > limit) {
        showToast(`⚠️ إجمالي مديونية العميل سيتجاوز سقف الائتمان (${limit} ج.م).`, 'warning');
      }
    }

    // Block re-entry while the invoice is being written (double-click / F1
    // key-repeat would otherwise save two invoices and deduct stock twice).
    if (submittingRef.current) return;
    submittingRef.current = true;

    const invoiceNum = await sqliteService.generateInvoiceId();

    const completedInvoice = {
      id: invoiceNum,
      invoiceNumber: invoiceNum,
      shift_id: currentShift?.id || '',
      cashier_name: currentUser?.full_name || currentUser?.name || 'الكاشير',
      customer_name: customer?.name || 'عميل نقدي',
      customerName: customer?.name || 'عميل نقدي',
      customer_phone: customer?.phone || '-',
      payment_method: paymentMethod,
      paymentMethod,
      items: cart.map((item) => ({
        medicine_id: item.id,
        trade_name: item.trade_name,
        trade_name_ar: item.trade_name_ar,
        is_strip: item.unitType === 'strip',
        unitType: item.unitType,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        unitPrice: item.unitPrice,
        total_price: item.unitPrice * item.quantity,
        unit_cost: item.unitPrice * 0.75,
        profit: (item.unitPrice * item.quantity) * 0.25,
        expiry: item.expiry || item.expiry_date || null
      })),
      total_retail: currentTotal,
      total_cost: currentTotal * 0.75,
      total_profit: currentTotal * 0.25,
      subtotal: currentSubtotal,
      discount: parseFloat(discount) || 0,
      total: currentTotal,
      paidAmount: paymentMethod === 'مختلط' ? splitPaidCash : currentPaid,
      paid_cash: paymentMethod === 'مختلط' ? splitPaidCash : (paymentMethod === 'كاش' ? currentTotal : 0),
      paid_credit: paymentMethod === 'مختلط' ? splitPaidCredit : (paymentMethod === 'آجل' ? currentTotal : 0),
      paid_card: (paymentMethod === 'فيزا' || paymentMethod === 'إنستاباي') ? currentTotal : 0,
      changeAmount: paymentMethod === 'مختلط' ? 0 : changeAmount,
      date: new Date().toISOString()
    };

    // Save to real SQLite database with atomic strict drawer transaction!
    // If the save fails we MUST NOT clear the cart / print a receipt, otherwise
    // the cashier believes the sale was recorded while nothing was persisted.
    let savedInvoice = completedInvoice;
    try {
      savedInvoice = await sqliteService.saveInvoice(completedInvoice);
      console.log('✅ Invoice recorded in SQLite with strict cash drawer rules.');
    } catch (dbErr) {
      console.error('Invoice save failed:', dbErr);
      submittingRef.current = false;
      showToast(`❌ تعذر حفظ الفاتورة في قاعدة البيانات: ${dbErr?.message || 'خطأ غير معروف'}`, 'warning');
      return;
    }

    // Silent Print on F1 if configured
    try {
      const savedSettings = JSON.parse(localStorage.getItem('PHARMACY_SETTINGS') || '{}');
      if (savedSettings.enableSilentPrint && typeof window !== 'undefined' && window.require) {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.invoke('print:silent', { silent: true, printBackground: true });
      }
    } catch (e) {}

    setLastCompletedInvoice({ ...completedInvoice, id: savedInvoice.id, invoiceNumber: savedInvoice.invoiceNumber });
    setShowReceiptModal(true);

    // Update Stats
    setShiftSalesTotal((prev) => prev + currentTotal);
    setShiftInvoicesCount((prev) => prev + 1);
    setInvoiceSeq((prev) => prev + 1);
    showToast(`✅ تم تسجيل الفاتورة ${savedInvoice.id} وتحديث المخزون`, 'success');

    // The database already deducted the stock atomically — reload the visible
    // catalog so the new quantity is reflected immediately in the POS.
    try {
      const refreshed = await sqliteService.searchMedicines(searchQuery, 50);
      if (Array.isArray(refreshed)) setSqliteMedicines(refreshed);
    } catch (e) {}

    // Let the parent reload the shared catalog + open shift (headers/reports)
    try {
      if (typeof onSaleCompleted === 'function') await onSaleCompleted();
    } catch (e) {}

    // Clear cart
    setCart([]);
    setDiscount(0);
    setPaidAmount('');
    localStorage.removeItem('PHARMACY_ACTIVE_CART');
    submittingRef.current = false;
  };

  const handleOpenAlternatives = (medicine) => {
    setSelectedAltMedicine(medicine);
    setShowAltModal(true);
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-[#0B1220] text-slate-100 overflow-hidden select-none font-cairo">
      
      {/* Toast Alert */}
      {toastMessage && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-200">
          <div
            className={`px-4 py-2.5 rounded-2xl shadow-glow-teal flex items-center gap-2 border text-xs font-bold ${
              toastType === 'warning'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : toastType === 'info'
                ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Main Split Layout: 60% Catalog on Right | 40% Cart on Left */}
      <div className="flex-1 flex flex-row overflow-hidden">
        
        {/* ======================================================== */}
        {/* RIGHT SECTION (60%): Smart Search & Drug Catalog Grid    */}
        {/* ======================================================== */}
        <section className="w-[60%] border-l border-[#23324D] flex flex-col bg-[#0B1220] overflow-hidden">
          
          {/* Top Search Bar */}
          <div className="p-3.5 bg-[#111A2B] border-b border-[#23324D] shadow-sm">
            <div className="relative flex items-center">
              <div className="absolute right-3.5 flex items-center gap-2 pointer-events-none text-teal-400">
                <Search className="w-5 h-5" />
              </div>

              <input
                ref={searchInputRef}
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="ابحث باسم الدواء التجاري، المادة الفعالة، أو امسح الباركود مباشرة (F5)..."
                className="w-full h-12 bg-[#17233A] border border-[#23324D] focus:border-teal-400 focus:shadow-glow-teal rounded-2xl pr-11 pl-28 text-white placeholder-slate-400 text-sm font-semibold outline-none transition-all"
              />

              {/* Barcode Scanner Indicator Badge */}
              <div className="absolute left-3 flex items-center gap-1.5 bg-[#111A2B] border border-[#23324D] px-2.5 py-1 rounded-xl text-teal-400 text-xs font-mono">
                <Barcode className="w-4 h-4 text-teal-300" />
                <span className="text-[11px] font-bold">READY</span>
              </div>
            </div>

            {/* Quick Catalog Stats Row */}
            <div className="flex items-center justify-between text-xs text-slate-400 mt-2 px-1">
              <div className="flex items-center gap-2">
                <span>الأصناف المطابقة:</span>
                <span className="font-bold text-white bg-[#17233A] px-2 py-0.5 rounded-md border border-[#23324D]">
                  {filteredMedicines.length} صنف
                </span>
              </div>
              <div className="text-[11px] text-slate-400">
                اضغط <kbd className="bg-[#17233A] text-teal-300 px-1.5 py-0.5 rounded border border-[#23324D]">Enter</kbd> لإضافة أول صنف فوراً
              </div>
            </div>
          </div>

          {/* Medicines Grid */}
          <div className="flex-1 overflow-y-auto p-3.5 grid grid-cols-1 md:grid-cols-2 gap-2.5 content-start">
            {filteredMedicines.length === 0 ? (
              <div className="col-span-2 text-center py-16 text-slate-400">
                <Inbox className="w-12 h-12 text-slate-600 mx-auto mb-2" />
                <p className="font-bold text-sm text-slate-300">
                  {searchQuery ? 'لم يتم العثور على أدوية مطابقة لكلمة البحث' : 'دليل الأدوية فارغ حالياً (0 أصناف)'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {searchQuery ? 'تأكد من الحروف أو جرب البحث بالمادة الفعالة.' : 'اضغط على زر [➕ إضافة دواء جديد] في الدليل لبدء تسجيل أصنافك.'}
                </p>
              </div>
            ) : (
              filteredMedicines.map((med) => {
                const spb = Math.max(1, parseInt(med.strips_per_box, 10) || 1);
                const ups = Math.max(1, parseInt(med.units_per_strip, 10) || 10);
                const boxes = parseInt(med.stock_boxes, 10) || 0;
                const strips = parseInt(med.stock_strips, 10) || 0;
                const units = parseInt(med.stock_units, 10) || 0;
                const totalUnits = (boxes * spb * ups) + (strips * ups) + units;
                const inStock = totalUnits > 0;
                const unitPriceCalc = med.price_unit > 0 ? med.price_unit : (med.price_strip ? med.price_strip / ups : med.price_box / (spb * ups));

                const unitTypeName = getUnitName(med.unit_type);

                return (
                  <div
                    key={med.id}
                    className={`p-3 rounded-2xl border transition-all duration-200 flex flex-col justify-between group ${
                      inStock
                        ? 'bg-[#111A2B] border-[#23324D] hover:border-teal-500/50 hover:bg-[#142035] shadow-sm'
                        : 'bg-[#111A2B]/70 border-rose-500/25 opacity-80'
                    }`}
                  >
                    {/* Top Row: Name & Shelf Tag */}
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="min-w-0 flex-1">
                          <h4 className="font-extrabold text-sm text-white group-hover:text-teal-300 transition-colors truncate" title={med.trade_name_ar}>
                            {med.trade_name_ar}
                          </h4>
                          <span className="text-xs text-slate-400 block font-normal truncate" title={med.trade_name}>
                            {med.trade_name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {med.expiry && (
                            <span
                              className="text-[10px] font-bold font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-lg shrink-0"
                              title="أقرب تاريخ صلاحية متاح للبيع (يتم بيع الأقدم أولاً تلقائياً)"
                            >
                              صلاحية: {med.expiry}
                            </span>
                          )}
                          <span className="text-[10px] font-bold font-mono bg-[#17233A] text-teal-300 border border-[#23324D] px-2 py-0.5 rounded-lg shrink-0">
                            رف: {med.shelf}
                          </span>
                        </div>
                      </div>

                      {/* Active Ingredient */}
                      <p className="text-[11px] text-slate-400 truncate mb-2" title={med.generic_name}>
                        {med.generic_name}
                      </p>
                    </div>

                    {/* Stock & Pricing */}
                    <div>
                      {(() => {
                        const unitInfo = getUnitDisplayInfo(med.unit_type);
                        const hasStrip = unitInfo.hasMidUnit;

                        return (
                          <div className="flex flex-wrap items-center justify-between gap-1 text-xs mb-2 pt-1.5 border-t border-[#23324D]/60">
                            {/* Stock status with composite display */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${
                                  inStock ? 'bg-emerald-400' : 'bg-rose-400 animate-pulse'
                                }`}
                              ></span>
                              <span className={`text-[11px] font-semibold whitespace-nowrap ${inStock ? 'text-slate-300' : 'text-rose-400 font-bold'}`}>
                                {inStock ? (
                                  hasStrip ? (
                                    <span>
                                      {boxes} ع {strips > 0 ? `و ${strips} ش` : ''} {units > 0 ? `و ${units} ${unitTypeName}` : ''}
                                    </span>
                                  ) : (
                                    <span>
                                      {boxes} ع {units > 0 ? `و ${units} ${unitTypeName}` : ''}
                                    </span>
                                  )
                                ) : 'نفد من المخزن'}
                              </span>
                            </div>

                            {/* Prices: Box | (Strip) | Unit */}
                            <div className="text-left font-mono shrink-0 whitespace-nowrap" dir="ltr">
                              <span className="font-extrabold text-teal-300 text-sm">
                                {med.price_box.toFixed(2)}
                              </span>
                              <span className="text-[10px] text-slate-400 ml-1">ج</span>
                              {hasStrip && (
                                <>
                                  <span className="text-[10px] text-slate-500 mr-1 ml-1">|</span>
                                  <span className="text-[11px] text-slate-400">
                                    ش: {med.price_strip.toFixed(2)}
                                  </span>
                                </>
                              )}
                              <span className="text-[10px] text-slate-500 mr-1 ml-1">|</span>
                              <span className="text-[11px] text-cyan-300">
                                {unitTypeName}: {unitPriceCalc.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Fast Action Buttons: Box, Strip, Unit, Alternatives */}
                      {(() => {
                        const unitInfo = getUnitDisplayInfo(med.unit_type);
                        const hasStrip = unitInfo.hasMidUnit;

                        return (
                          <div className={`grid gap-1 ${hasStrip ? 'grid-cols-4' : 'grid-cols-3'}`}>
                            {/* Add Box Button */}
                            <button
                              type="button"
                              onClick={() => addToCart(med, 'box')}
                              disabled={!inStock}
                              className={`py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-0.5 transition-all ${
                                inStock
                                  ? 'bg-[#17233A] hover:bg-teal-500 hover:text-slate-950 text-white border border-[#23324D] active:scale-95 cursor-pointer'
                                  : 'bg-slate-800/40 text-slate-600 border border-slate-700/40 cursor-not-allowed opacity-50'
                              }`}
                              title={inStock ? 'إضافة علبة كاملة للسلة' : 'الرصيد نفد'}
                            >
                              <Plus className="w-2.5 h-2.5" />
                              <span>علبة</span>
                            </button>

                            {/* Add Strip Button (Only for medicines with strips) */}
                            {hasStrip && (
                              <button
                                type="button"
                                onClick={() => addToCart(med, 'strip')}
                                disabled={!inStock || spb <= 1}
                                className={`py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-0.5 transition-all ${
                                  inStock && spb > 1
                                    ? 'bg-[#17233A] hover:bg-teal-500 hover:text-slate-950 text-white border border-[#23324D] active:scale-95 cursor-pointer'
                                    : 'bg-slate-800/20 text-slate-600 border border-slate-800 cursor-not-allowed opacity-40'
                                }`}
                                title={spb > 1 ? 'إضافة شريط للسلة' : 'لا يحتوي على شرائط'}
                              >
                                <Plus className="w-2.5 h-2.5" />
                                <span>شريط</span>
                              </button>
                            )}

                            {/* Add Unit / Tablet / Ampoule Button */}
                            <button
                              type="button"
                              onClick={() => addToCart(med, 'unit')}
                              disabled={!inStock}
                              className={`py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-0.5 transition-all ${
                                inStock
                                  ? 'bg-cyan-500/15 hover:bg-cyan-400 hover:text-slate-950 text-cyan-300 border border-cyan-500/30 active:scale-95 cursor-pointer'
                                  : 'bg-slate-800/40 text-slate-600 border border-slate-700/40 cursor-not-allowed opacity-50'
                              }`}
                              title={`إضافة ${unitTypeName} واحد للسلة`}
                            >
                              <Plus className="w-2.5 h-2.5" />
                              <span>{unitTypeName}</span>
                            </button>

                            {/* Alternatives Button (F6) */}
                            <button
                              type="button"
                              onClick={() => handleOpenAlternatives(med)}
                              className={`py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-0.5 transition-all ${
                                !inStock
                                  ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 animate-pulse'
                                  : 'bg-[#17233A]/80 hover:bg-[#202E4C] text-slate-300 border border-[#23324D]'
                              }`}
                              title="عرض الأدوية البديلة لنفس المادة الفعالة"
                            >
                              <Dna className="w-2.5 h-2.5 text-teal-400" />
                              <span>بدائل</span>
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* ======================================================== */}
        {/* LEFT SECTION (40%): Current Bill & Cart & Summary        */}
        {/* ======================================================== */}
        <section className="w-[40%] flex flex-col bg-[#111A2B] overflow-hidden justify-between">
          
          {/* Bill Top Bar */}
          <div className="p-3 border-b border-[#23324D] bg-[#141E30] flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm text-white">فاتورة بيع</span>
                <span className="text-[11px] font-mono font-bold bg-[#17233A] text-teal-400 px-2 py-0.5 rounded-md border border-[#23324D]">
                  INV-{invoiceSeq}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                الكاشير: <span className="text-white font-semibold">{currentUser?.full_name || currentUser?.name || 'الكاشير'}</span>
              </div>
            </div>

            {/* Customer Dropdown Selector, Quick Park & Clear */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(Number(e.target.value))}
                className="h-8 bg-[#17233A] border border-[#23324D] text-white text-xs rounded-lg px-2 outline-none font-medium"
              >
                <option value={0}>عميل نقدي (بدون حساب)</option>
                {dbCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{Number(c.balance) > 0 ? ` (مديونية ${Number(c.balance).toFixed(0)} ج.م)` : ''}
                  </option>
                ))}
              </select>

              {/* Quick Return Invoices Button */}
              <button
                type="button"
                onClick={() => setShowReturnModal(true)}
                className="h-8 px-2.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
                title="استرجاع مبيعات ومرتجع بالفترة والساعة (مرتجع)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>مرتجع فواتير</span>
              </button>

              {/* Quick Park Bill Touch Button */}
              <button
                type="button"
                onClick={handleParkCurrentBill}
                disabled={cart.length === 0}
                className="h-8 px-2.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                title="تعليق الفاتورة الحالية لخدمة عميل آخر (F2)"
              >
                <span>تعليق F2</span>
              </button>

              {/* Parked Bills Modal Button */}
              {parkedBills.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowParkedModal(true)}
                  className="h-8 px-2.5 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 text-xs font-bold flex items-center gap-1 transition-all cursor-pointer animate-pulse"
                  title="استرجاع الفواتير المعلقة (F3)"
                >
                  <span>المعلقة ({parkedBills.length}) F3</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleClearCart}
                className="w-8 h-8 rounded-lg bg-[#17233A] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-[#23324D] flex items-center justify-center transition-colors"
                title="تفريغ السلة (F4)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Cart Items Table */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 py-16">
                <div className="w-14 h-14 rounded-2xl bg-[#17233A] border border-[#23324D] flex items-center justify-center mb-3">
                  <ShoppingBag className="w-6 h-6 text-slate-600" />
                </div>
                <p className="font-bold text-sm text-slate-400">السلة فارغة حالياً</p>
                <p className="text-xs text-slate-500 max-w-xs mt-1">
                  امسح باركود الدواء أو انقر على (+ علبة) لإضافة أصناف الفاتورة.
                </p>
              </div>
            ) : (
              cart.map((item, index) => {
                const itemTotal = item.unitPrice * item.quantity;
                const spb = Math.max(1, parseInt(item.strips_per_box, 10) || 1);
                const ups = Math.max(1, parseInt(item.units_per_strip, 10) || 10);
                const uType = item.unitType || 'box';

                const unitTypeName = getUnitName(item.unit_type);

                const unitLabel = uType === 'box' ? 'علبة' : (uType === 'strip' ? 'شريط' : unitTypeName);

                return (
                  <div
                    key={`${item.id}-${item.unitType}`}
                    className="p-2.5 rounded-xl bg-[#17233A] border border-[#23324D] hover:border-slate-500 transition-all flex items-center justify-between gap-2"
                  >
                    {/* Item Details */}
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-xs text-white truncate">
                        {item.trade_name_ar}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {item.trade_name}
                      </div>

                      {/* Expiry Badge / Warning */}
                      {(item.expiry || item.expiry_date) && (() => {
                        const rawExp = item.expiry || item.expiry_date;
                        return (
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-[9px] font-bold font-mono px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              صلاحية: {rawExp} (أقدم دفعة FEFO)
                            </span>
                          </div>
                        );
                      })()}
                      
                      {/* Unit Price indicator */}
                      <div className="text-[11px] font-mono text-teal-400 mt-1" dir="ltr">
                        {item.unitPrice.toFixed(2)} EGP <span className="text-[10px] text-slate-400 font-sans">/ {unitLabel}</span>
                      </div>
                    </div>

                    {/* Unit Switch: Box 📦 vs Strip 💊 vs Unit ⚪ */}
                    <button
                      type="button"
                      onClick={() => toggleUnitType(index)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors flex items-center gap-1 cursor-pointer ${
                        uType === 'box'
                          ? 'bg-teal-500/20 text-teal-300 border-teal-500/40 hover:bg-teal-500/30'
                          : uType === 'strip'
                          ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 hover:bg-blue-500/30'
                          : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/30'
                      }`}
                      title="تبديل الوحدة (علبة / شريط / حبة)"
                    >
                      {uType === 'box' ? <Package className="w-3 h-3" /> : <Pill className="w-3 h-3" />}
                      <span>{unitLabel} 🔄</span>
                    </button>

                    {/* Quantity Controls */}
                    <div className="flex items-center gap-1 bg-[#111A2B] border border-[#23324D] rounded-lg p-0.5">
                      <button
                        type="button"
                        onClick={() => updateQuantity(index, -1)}
                        className="w-6 h-6 rounded flex items-center justify-center hover:bg-[#17233A] text-slate-300 transition-colors"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="text"
                        value={item.quantity}
                        onChange={(e) => handleDirectQuantity(index, e.target.value)}
                        className="w-8 text-center text-xs font-bold text-white bg-transparent outline-none font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => updateQuantity(index, 1)}
                        className="w-6 h-6 rounded flex items-center justify-center hover:bg-[#17233A] text-slate-300 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Item Total & Delete */}
                    <div className="text-left font-mono font-bold text-white text-xs min-w-[55px]" dir="ltr">
                      {itemTotal.toFixed(2)}
                    </div>

                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="w-6 h-6 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 flex items-center justify-center transition-colors"
                      title="حذف البند"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Bill Calculation & Checkout Footer */}
          <div className="p-3 bg-[#141E30] border-t border-[#23324D] shadow-inner space-y-2.5">
            
            {/* Subtotal & Discount & Coupon Row */}
            <div className="flex items-center justify-between text-xs text-slate-300">
              <div className="flex items-center gap-1.5">
                <span>المجموع:</span>
                <span className="font-mono font-bold text-white" dir="ltr">
                  {currentSubtotal.toFixed(2)} EGP
                </span>
              </div>

              {/* Discount Input */}
              <div className="flex items-center gap-1.5">
                <span>الخصم:</span>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    placeholder="0"
                    disabled={
                      !hasPermission(currentUser, 'canDiscount') &&
                      !hasPermission(currentUser, 'canGiveDiscount')
                    }
                    value={discount === 0 || discount === '0' ? (discount === '' ? '' : discount) : (discount || '')}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') {
                        setDiscount('');
                      } else {
                        const parsed = parseFloat(val);
                        setDiscount(isNaN(parsed) ? '' : Math.max(0, parsed));
                      }
                    }}
                    onBlur={() => {
                      if (discount === '' || isNaN(parseFloat(discount))) {
                        setDiscount(0);
                      } else {
                        const clean = Math.max(0, parseFloat(discount) || 0);
                        setDiscount(Math.min(clean, currentSubtotal));
                      }
                    }}
                    className="w-16 h-7 bg-[#17233A] border border-[#23324D] text-center text-rose-300 text-xs font-bold rounded-lg outline-none font-mono disabled:opacity-50"
                  />
                  <span className="text-[10px] text-slate-500 mr-1">ج.م</span>
                </div>
              </div>
            </div>

            {/* Split / Partial Payment Indicator */}
            {paymentMethod === 'مختلط' && (
              <div className="p-2 bg-[#17233A] border border-amber-500/30 rounded-xl space-y-1 text-xs">
                <div className="text-amber-300 font-bold text-[11px] mb-1">توزيع الدفع المختلط (كاش + آجل):</div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">المدفوع كاش:</span>
                  <input
                    type="number"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    placeholder="0"
                    className="w-20 bg-[#0B1220] border border-[#23324D] text-emerald-400 px-2 py-0.5 rounded text-xs font-mono font-bold text-left"
                    dir="ltr"
                  />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">المتبقي على حساب العميل (آجل):</span>
                  <span className="text-amber-400 font-mono font-bold" dir="ltr">
                    {Math.max(0, currentTotal - (parseFloat(paidAmount) || 0)).toFixed(2)} EGP
                  </span>
                </div>
              </div>
            )}

            {/* Grand Total Box */}
            <div className="bg-[#111A2B] border border-teal-500/40 rounded-2xl p-2.5 px-3.5 flex items-center justify-between shadow-glow-teal">
              <div>
                <span className="text-xs font-bold text-slate-300">إجمالي الحساب الصافي:</span>
                <div className="text-[10px] text-teal-400">شامل الضريبة والخصم المعتمد</div>
              </div>
              <div className="text-2xl font-black text-emerald-400 font-mono tracking-tight" dir="ltr">
                {currentTotal.toFixed(2)} <span className="text-xs font-bold text-emerald-300">EGP</span>
              </div>
            </div>

            {/* Paid & Change Calculator */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-[#17233A] border border-[#23324D] p-1.5 px-2.5 rounded-xl flex items-center justify-between">
                <span className="text-slate-400 text-[11px]">المستلم:</span>
                {paymentMethod === 'مختلط' ? (
                  <div className="flex flex-col items-end">
                    <input
                      type="text"
                      readOnly
                      value={paidAmount ? `${parseFloat(paidAmount).toFixed(2)} EGP` : '0.00 EGP'}
                      className="w-24 text-left bg-transparent text-emerald-400 font-mono font-bold outline-none text-xs cursor-not-allowed"
                      dir="ltr"
                      title="المدفوع كاش (يُعدَّل من تفصيل المختلط أعلاه)"
                    />
                    <span className="text-[9px] text-slate-500">المدفوع كاش (من أعلى)</span>
                  </div>
                ) : (
                  <input
                    type="number"
                    placeholder={currentTotal.toFixed(0)}
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    className="w-20 text-left bg-transparent text-white font-mono font-bold outline-none text-xs"
                    dir="ltr"
                  />
                )}
              </div>

              <div className="bg-[#17233A] border border-[#23324D] p-1.5 px-2.5 rounded-xl flex items-center justify-between">
                <span className="text-slate-400 text-[11px]">الباقي للعميل:</span>
                <span className="font-mono font-bold text-amber-300 text-xs" dir="ltr">
                  {changeAmount.toFixed(2)} EGP
                </span>
              </div>
            </div>

            {/* Payment Method Selector (Includes Split / Partial payment) */}
            <div className="grid grid-cols-5 gap-1">
              {[
                { id: 'كاش', icon: DollarSign, label: 'كاش' },
                { id: 'فيزا', icon: CreditCard, label: 'فيزا' },
                { id: 'إنستاباي', icon: Smartphone, label: 'إنستاباي' },
                { id: 'آجل', icon: BookUser, label: 'آجل' },
                { id: 'مختلط', icon: Coins, label: 'مختلط' }
              ].map((m) => {
                const Icon = m.icon;
                const isSelected = paymentMethod === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id)}
                    className={`py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                      isSelected
                        ? 'bg-teal-500 text-slate-950 shadow-glow-teal font-extrabold'
                        : 'bg-[#17233A] text-slate-300 hover:bg-[#202E4C] border border-[#23324D]'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Grand Checkout Button (F1) */}
            <button
              type="button"
              onClick={handleCheckout}
              disabled={cart.length === 0}
              className={`w-full h-12 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.99] ${
                cart.length > 0
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-glow-teal cursor-pointer'
                  : 'bg-slate-800 text-slate-600 cursor-not-allowed border border-transparent'
              }`}
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>إتمام البيع والطباعة — F1</span>
            </button>

          </div>

        </section>

      </div>

      {/* ======================================================== */}
      {/* BOTTOM FOOTER: Quick Keyboard Shortcuts Bar             */}
      {/* ======================================================== */}
      <footer className="h-10 bg-[#111A2B] border-t border-[#23324D] px-3 flex items-center justify-between text-xs text-slate-300 shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            onClick={handleCheckout}
            className="flex items-center gap-1 bg-[#17233A] hover:bg-emerald-500/20 hover:text-emerald-300 border border-[#23324D] px-2 py-0.5 rounded-lg text-[11px] font-medium transition-colors"
          >
            <span className="font-bold text-teal-400">F1</span>
            <span>دفع وطباعة</span>
          </button>

          <button
            onClick={handleParkCurrentBill}
            className="flex items-center gap-1 bg-[#17233A] hover:bg-amber-500/20 hover:text-amber-300 border border-[#23324D] px-2 py-0.5 rounded-lg text-[11px] font-medium transition-colors"
          >
            <span className="font-bold text-amber-400">F2</span>
            <span>تعليق الفاتورة</span>
          </button>

          <button
            onClick={() => setShowParkedModal(true)}
            className="flex items-center gap-1 bg-[#17233A] hover:bg-amber-500/20 hover:text-amber-300 border border-[#23324D] px-2 py-0.5 rounded-lg text-[11px] font-medium transition-colors"
          >
            <span className="font-bold text-amber-400">F3</span>
            <span>المعلقة ({parkedBills.length})</span>
          </button>

          <button
            onClick={handleClearCart}
            className="flex items-center gap-1 bg-[#17233A] hover:bg-rose-500/20 hover:text-rose-300 border border-[#23324D] px-2 py-0.5 rounded-lg text-[11px] font-medium transition-colors"
          >
            <span className="font-bold text-rose-400">F4</span>
            <span>فاتورة جديدة</span>
          </button>

          <button
            onClick={() => {
              const med = filteredMedicines[0] || medicines[0];
              if (med) handleOpenAlternatives(med);
            }}
            className="flex items-center gap-1 bg-[#17233A] hover:bg-teal-500/20 hover:text-teal-300 border border-[#23324D] px-2 py-0.5 rounded-lg text-[11px] font-medium transition-colors"
          >
            <span className="font-bold text-teal-400">F6</span>
            <span>دليل البدائل</span>
          </button>

          <button
            onClick={handleKickCashDrawer}
            className="flex items-center gap-1 bg-[#17233A] hover:bg-teal-500/20 hover:text-teal-300 border border-[#23324D] px-2 py-0.5 rounded-lg text-[11px] font-medium transition-colors"
          >
            <span className="font-bold text-teal-400">F7</span>
            <span>درج النقدية</span>
          </button>

          <button
            onClick={() => setShowExpenseModal(true)}
            className="flex items-center gap-1 bg-[#17233A] hover:bg-rose-500/20 hover:text-rose-300 border border-[#23324D] px-2 py-0.5 rounded-lg text-[11px] font-medium transition-colors"
          >
            <span className="font-bold text-rose-400">F8</span>
            <span>مصروف نثريات</span>
          </button>

          <button
            onClick={() => setShowQRModal(true)}
            className="flex items-center gap-1 bg-[#17233A] hover:bg-teal-500/20 hover:text-teal-300 border border-[#23324D] px-2 py-0.5 rounded-lg text-[11px] font-medium transition-colors"
          >
            <span className="font-bold text-teal-400">F12</span>
            <span>QR الموبايل</span>
          </button>
        </div>

        {/* Live Shift Counter */}
        <div className="flex items-center gap-3 text-[11px] text-slate-400 font-medium">
          <div>
            إجمالي مبيعات الوردية: <span className="font-bold text-emerald-400 font-mono" dir="ltr">{shiftSalesTotal.toFixed(2)} EGP</span>
          </div>
          <div>•</div>
          <div>
            الفواتير: <span className="font-bold text-white">{shiftInvoicesCount}</span>
          </div>
        </div>
      </footer>

      {/* Interactive Modals */}
      <AlternativesModal
        isOpen={showAltModal}
        onClose={() => {
          setShowAltModal(false);
          searchInputRef.current?.focus();
        }}
        medicine={selectedAltMedicine}
        allMedicines={medicines}
        onSelectAlternative={(alt) => {
          addToCart(alt, 'box');
          showToast(`تمت إضافة البديل [${alt.trade_name_ar}] للسلة بنجاح!`, 'success');
        }}
      />

      <ReceiptModal
        isOpen={showReceiptModal}
        onClose={() => {
          setShowReceiptModal(false);
          searchInputRef.current?.focus();
        }}
        invoice={lastCompletedInvoice}
        cashierName={currentUser?.full_name || currentUser?.name || 'الكاشير'}
      />

      <ParkedBillsModal
        isOpen={showParkedModal}
        onClose={() => {
          setShowParkedModal(false);
          searchInputRef.current?.focus();
        }}
        parkedBills={parkedBills}
        onResumeBill={handleResumeParkedBill}
        onDeleteBill={handleDeleteParkedBill}
      />

      <QuickExpenseModal
        isOpen={showExpenseModal}
        onClose={() => {
          setShowExpenseModal(false);
          searchInputRef.current?.focus();
        }}
        onAddExpense={async (expense) => {
          try {
            await sqliteService.recordExpense(expense.amount, expense.title, currentShift?.id || '', currentUser?.full_name || currentUser?.name || 'الكاشير');
            console.log('✅ Expense saved to SQLite and deducted from drawer expected cash.');
            showToast(`تم تسجيل منصرف [${expense.title}] بقيمة ${expense.amount} ج.م وخصمها من الدرج (F8)`, 'info');
          } catch (e) {
            console.warn('Expense record error:', e);
            showToast(`❌ تعذر تسجيل المصروف: ${e?.message || 'خطأ غير معروف'}`, 'error');
            // Rethrow so QuickExpenseModal keeps the form open instead of
            // telling the cashier the drawer was reduced when it was not.
            throw e;
          }
        }}
      />

      <MobileQRModal
        isOpen={showQRModal}
        onClose={() => {
          setShowQRModal(false);
          searchInputRef.current?.focus();
        }}
        shiftTotal={shiftSalesTotal}
        itemsCount={shiftInvoicesCount}
      />

      {/* Advanced Return / Refund Modal by Date & Time */}
      <ReturnInvoiceModal
        isOpen={showReturnModal}
        onClose={() => {
          setShowReturnModal(false);
          searchInputRef.current?.focus();
        }}
        currentUser={currentUser}
        currentShift={currentShift}
        onRefundCompleted={async () => {
          try {
            const refreshed = await sqliteService.searchMedicines(searchQuery, 50);
            if (Array.isArray(refreshed)) setSqliteMedicines(refreshed);
          } catch (e) {}
          if (typeof onSaleCompleted === 'function') {
            await onSaleCompleted();
          }
        }}
      />

      {/* Blocking banner when no shift is open */}
      {!isShiftOpen && (
        <div className="px-3.5 pt-3 bg-[#111A2B] border-b border-rose-500/40">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40">
            <div className="flex items-center gap-2.5 text-rose-300 text-xs font-bold">
              <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400 animate-bounce" />
              <span>
                ⚠️ لا توجد وردية مفتوحة حالياً! البيع وإضافة الأصناف معطلان بالكامل حتى يتم فتح وردية عمل جديدة باسم الكاشير.
              </span>
            </div>
            {onOpenShiftModal && (
              <button
                type="button"
                onClick={onOpenShiftModal}
                className="shrink-0 px-4 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-black text-xs shadow-lg shadow-teal-500/20 transition-all cursor-pointer whitespace-nowrap active:scale-95"
              >
                🔓 فتح وردية الآن
              </button>
            )}
          </div>
        </div>
      )}

      {/* FEFO Strict Expiry Alert Modal */}
      {fefoAlertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-[#111A2B] border-2 border-rose-500/70 rounded-2xl shadow-2xl p-5 text-right font-cairo">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center mx-auto mb-3 text-rose-400 animate-pulse">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <h3 className="text-base font-black text-rose-300 text-center mb-1">
              عفواً! هناك صلاحية أقدم من هذا المنتج
            </h3>
            <p className="text-xs text-slate-300 text-center mb-4 leading-relaxed">
              تم رفض إتمام البيع التزاماً بقواعد الصرف الصيدلي الذكي (FEFO). يجب بيع الدفعة الأقدم أولاً لتفادي ركود أو انتهاء الصلاحيات.
            </p>

            <div className="bg-[#17233A] border border-[#23324D] rounded-xl p-3.5 space-y-2 text-xs mb-4">
              <div className="flex justify-between items-center text-slate-300">
                <span>اسم الدواء:</span>
                <span className="font-bold text-white text-sm">{fefoAlertModal.medicineName}</span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>صلاحية العلبة الممسوحة (جديدة):</span>
                <span className="font-mono font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded">{fefoAlertModal.scannedExpiry || 'أحدث'}</span>
              </div>
              <div className="flex justify-between items-center text-rose-300 pt-1 border-t border-[#23324D]">
                <span className="font-bold">الصلاحية الأقدم الواجب بيعها أولاً:</span>
                <span className="font-mono font-black text-rose-400 bg-rose-500/20 border border-rose-500/40 px-2.5 py-1 rounded-lg text-sm">
                  {fefoAlertModal.oldestExpiry}
                </span>
              </div>
              {fefoAlertModal.oldestBatch && (
                <div className="flex justify-between items-center text-slate-400 text-[11px]">
                  <span>رقم تشغيلة الدفعة القديمة:</span>
                  <span className="font-mono text-amber-300">{fefoAlertModal.oldestBatch}</span>
                </div>
              )}
              {fefoAlertModal.boxesAvailable > 0 && (
                <div className="flex justify-between items-center text-amber-300 text-[11px]">
                  <span>الكمية المتبقية من الدفعة القديمة:</span>
                  <span className="font-bold font-mono">{fefoAlertModal.boxesAvailable} علبة</span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setFefoAlertModal(null);
                  searchInputRef.current?.focus();
                }}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-400 hover:to-amber-400 text-slate-950 font-black text-xs transition-all shadow-md active:scale-95 cursor-pointer"
              >
                فهمت، سأقوم ببيع الصلاحية الأقدم أولاً
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
