import React, { useState, useMemo, useEffect } from 'react';
import {
  BookUser,
  Users,
  DollarSign,
  AlertTriangle,
  Search,
  Plus,
  Download,
  Phone,
  MapPin,
  Calendar,
  CreditCard,
  FileText,
  MessageSquare,
  Edit3,
  CheckCircle2,
  XCircle,
  Sparkles,
  TrendingUp,
  Percent,
  Wallet
} from 'lucide-react';
import { AddCustomerModal } from './AddCustomerModal';
import { PaymentReceiptModal } from './PaymentReceiptModal';
import { CustomerStatementModal } from './CustomerStatementModal';
import { playBarcodeBeep, playCashDrawerSound } from '../utils/sound';
import { sqliteService } from '../db/sqliteService';

export function CustomersView() {
  const [customers, setCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load customers (and their ledger history) from SQLite on mount
  const loadCustomers = async () => {
    try {
      const dbCustomers = await sqliteService.getCustomers();
      const withHistory = await Promise.all(
        (dbCustomers || []).map(async (c) => {
          try {
            const ledger = await sqliteService.getCustomerLedger(c.id);
            const history = (ledger || []).map((row) => ({
              id: row.id,
              date: (row.date_time || '').slice(0, 10),
              type: row.type,
              ref: row.ref_no,
              desc: row.description,
              debit: row.debit || 0,
              credit: row.credit || 0,
              balance: row.balance || 0
            }));
            return { ...c, history };
          } catch (e) {
            return { ...c, history: [] };
          }
        })
      );
      setCustomers(withHistory);
    } catch (e) {
      console.warn('Failed to load customers from SQLite:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    try {
      if (customers.length > 0) {
        localStorage.setItem('PHARMACY_CUSTOMERS_LIST', JSON.stringify(customers));
      } else {
        localStorage.removeItem('PHARMACY_CUSTOMERS_LIST');
      }
    } catch (e) {}
  }, [customers]);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState('ALL'); // 'ALL', 'HAS_DEBT', 'EXCEEDED', 'ZERO_BALANCE'

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState(null);
  const [customerForPayment, setCustomerForPayment] = useState(null);
  const [customerForStatement, setCustomerForStatement] = useState(null);

  // Toast
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // 1. Calculate Credit & Debt Statistics
  const stats = useMemo(() => {
    let totalDebt = 0;
    let debtorCount = 0;
    let exceededCount = 0;
    let collectedThisMonth = 0;

    customers.forEach((c) => {
      const balance = c.balance || 0;
      if (balance > 0) {
        totalDebt += balance;
        debtorCount++;
        if (balance > (c.credit_limit || 2000)) {
          exceededCount++;
        }
      }

      // Sum collected amounts from history or last payments
      if (c.history && Array.isArray(c.history)) {
        c.history.forEach((tx) => {
          if (tx.type === 'PAYMENT' && tx.credit > 0) {
            collectedThisMonth += tx.credit;
          }
        });
      } else if (c.last_payment_amount) {
        collectedThisMonth += c.last_payment_amount;
      }
    });

    return {
      totalDebt,
      debtorCount,
      exceededCount,
      collectedThisMonth
    };
  }, [customers]);

  // 2. Filter & Search Logic
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      // Search
      const q = searchQuery.trim().toLowerCase();
      if (q) {
        const matches =
          String(c.name || '').toLowerCase().includes(q) ||
          String(c.phone || '').includes(q) ||
          String(c.address || '').toLowerCase().includes(q) ||
          String(c.notes || '').toLowerCase().includes(q);

        if (!matches) return false;
      }

      // Filter tabs
      const balance = c.balance || 0;
      const limit = c.credit_limit || 2000;

      if (filterTab === 'HAS_DEBT') {
        return balance > 0;
      }
      if (filterTab === 'EXCEEDED') {
        return balance > limit;
      }
      if (filterTab === 'ZERO_BALANCE') {
        return balance <= 0;
      }

      return true;
    });
  }, [customers, searchQuery, filterTab]);

  // Save (Add or Update) Customer
  const handleSaveCustomer = async (customerData) => {
    let saved = customerData;
    try {
      saved = await sqliteService.saveCustomer(customerData);
    } catch (e) {
      console.warn('SQLite save customer failed:', e);
      showToast('تعذر حفظ بيانات العميل في قاعدة البيانات');
      return;
    }

    setCustomers((prev) => {
      const idx = prev.findIndex((c) => c.id === saved.id);
      if (idx > -1) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], ...saved };
        return updated;
      } else {
        return [{ ...saved, history: [] }, ...prev];
      }
    });

    showToast(`تم حفظ بيانات العميل (${saved.name}) بنجاح`);
    playBarcodeBeep();
  };

  // Collect Payment from Customer (Strict Drawer Cash Addition)
  const handleCollectPayment = async (customerId, amountPaid, receiptData) => {
    try {
      await sqliteService.collectCustomerPayment(customerId, amountPaid, receiptData);
    } catch (e) {
      console.warn('SQLite payment collection failed:', e);
      showToast('تعذر تسجيل السداد في قاعدة البيانات');
      return;
    }

    await loadCustomers();
    window.dispatchEvent(new CustomEvent('pharmacy-data-changed'));

    // If paid by cash, update active shift cache in localStorage
    if (receiptData?.paymentMethod === 'كاش') {
      try {
        const savedShift = JSON.parse(localStorage.getItem('PHARMACY_ACTIVE_SHIFT') || 'null');
        if (savedShift) {
          savedShift.debt_collections = (savedShift.debt_collections || 0) + parseFloat(amountPaid);
          savedShift.expected_cash = (savedShift.opening_cash || 0) + (savedShift.cash_sales || 0) + savedShift.debt_collections - (savedShift.petty_expenses || 0);
          localStorage.setItem('PHARMACY_ACTIVE_SHIFT', JSON.stringify(savedShift));
        }
      } catch (e) {}
    }

    playCashDrawerSound();
    showToast(`تم تحصيل ${amountPaid} ج.م وقيدها بحساب العميل وإضافتها لدرج النقدية 💵`);
  };

  // WhatsApp Debt Reminder
  const handleSendWhatsAppReminder = (c) => {
    if (!c.phone || c.phone === '-') {
      showToast('لا يوجد رقم هاتف مسجل للعميل');
      return;
    }

    const message = `مرحباً ${c.name}،\nتذكركم صيدلية النخبة الحديثة بأن إجمالي حسابكم الآجل المستحق حالياً هو: ${Number(c.balance || 0).toFixed(
      2
    )} ج.م.\nشاكرين لكم حسن تعاونكم الدائم، ونتمنى لكم دوام الصحة والعافية!`;

    const cleanPhone = c.phone.replace(/\D/g, '');
    const formatted = cleanPhone.startsWith('01') ? `2${cleanPhone}` : cleanPhone;
    const url = `https://wa.me/${formatted}?text=${encodeURIComponent(message)}`;

    navigator.clipboard.writeText(message);
    showToast('تم نسخ رسالة التذكير وفتح محادثة الواتساب!');
    window.open(url, '_blank');
  };

  // Export to Excel / CSV
  const handleExportCSV = () => {
    if (customers.length === 0) return;

    let csv = '\uFEFF'; // UTF-8 BOM
    csv += 'اسم العميل,رقم الهاتف,العنوان,سقف الائتمان (ج.م),المديونية الحالية (ج.م),الحالة,تاريخ آخر دفعة,مبلغ آخر دفعة,ملاحظات\n';

    customers.forEach((c) => {
      const balance = c.balance || 0;
      const limit = c.credit_limit || 2000;
      const status = balance === 0 ? 'مسدد' : balance > limit ? 'تجاوز السقف' : 'مدين';

      csv += `"${c.name}","${c.phone}","${c.address || ''}",${limit},${balance},"${status}","${c.last_payment_date || ''}",${c.last_payment_amount || 0},"${c.notes || ''}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `كشف_ديون_العملاء_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('تم تصدير كشف ديون العملاء بنجاح 📥');
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

      {/* 1. Credit Stat Cards */}
      <div className="grid grid-cols-4 gap-4 shrink-0">
        
        {/* Card 1: Total Debt */}
        <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl p-4 flex items-center justify-between shadow-lg relative overflow-hidden group hover:border-amber-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-xl pointer-events-none"></div>
          <div>
            <div className="text-xs font-bold text-slate-400 mb-1">إجمالي ديون العملاء الحالية</div>
            <div className="text-2xl font-black text-amber-400 flex items-baseline gap-1.5 font-mono">
              <span>{stats.totalDebt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className="text-xs font-bold text-slate-400 font-cairo">ج.م</span>
            </div>
            <div className="text-[11px] text-amber-400/80 font-medium mt-1">
              إجمالي الأموال المعلقة بالخارج
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2: Debtors Count */}
        <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl p-4 flex items-center justify-between shadow-lg relative overflow-hidden group hover:border-teal-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/10 rounded-full blur-xl pointer-events-none"></div>
          <div>
            <div className="text-xs font-bold text-slate-400 mb-1">عدد العملاء المدينين</div>
            <div className="text-2xl font-black text-white flex items-baseline gap-1.5 font-mono">
              <span>{stats.debtorCount}</span>
              <span className="text-xs font-medium text-slate-400 font-cairo">عميل مدين</span>
            </div>
            <div className="text-[11px] text-teal-400 font-medium mt-1">
              عليهم فواتير وحسابات غير مسددة
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-teal-500/15 border border-teal-500/30 text-teal-400 flex items-center justify-center shrink-0">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: Collected This Month */}
        <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl p-4 flex items-center justify-between shadow-lg relative overflow-hidden group hover:border-emerald-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl pointer-events-none"></div>
          <div>
            <div className="text-xs font-bold text-slate-400 mb-1">المبالغ المحصلة هذا الشهر</div>
            <div className="text-2xl font-black text-emerald-400 flex items-baseline gap-1.5 font-mono">
              <span>{stats.collectedThisMonth.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className="text-xs font-bold text-slate-400 font-cairo">ج.م</span>
            </div>
            <div className="text-[11px] text-emerald-400/80 font-medium mt-1">
              سندات قبض نقدية وردت للدرج
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
            <Wallet className="w-6 h-6" />
          </div>
        </div>

        {/* Card 4: Exceeded Credit Limit */}
        <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl p-4 flex items-center justify-between shadow-lg relative overflow-hidden group hover:border-rose-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 rounded-full blur-xl pointer-events-none"></div>
          <div>
            <div className="text-xs font-bold text-slate-400 mb-1">تجاوزوا سقف الائتمان</div>
            <div className="text-2xl font-black text-rose-400 flex items-baseline gap-1.5 font-mono">
              <span>{stats.exceededCount}</span>
              <span className="text-xs font-medium text-slate-400 font-cairo">عميل تخطى الحد</span>
            </div>
            <div className="text-[11px] text-rose-400 font-bold mt-1 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
              تنبيه بوقف البيع الآجل
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* 2. Actions & Search Bar */}
      <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl p-3 flex items-center justify-between gap-3 shrink-0 shadow-lg flex-wrap">
        
        {/* Left Side: New Customer Button & Quick Search */}
        <div className="flex items-center gap-3 flex-1 min-w-[320px]">
          
          {/* Add New Customer Primary Button */}
          <button
            onClick={() => {
              setCustomerToEdit(null);
              setShowAddModal(true);
            }}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition-all shrink-0 group"
          >
            <Plus className="w-4 h-4 text-white group-hover:scale-110 transition-transform" />
            <span>تسجيل عميل جديد</span>
          </button>

          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث باسم العميل، رقم الهاتف، أو المنطقة السكنية..."
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
        </div>

        {/* Center: 1-Click Status Filter Tabs */}
        <div className="flex items-center gap-1 bg-[#0B1220] p-1 rounded-xl border border-[#23324D] shrink-0">
          <button
            onClick={() => setFilterTab('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterTab === 'ALL'
                ? 'bg-teal-500 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            كل العملاء ({customers.length})
          </button>
          <button
            onClick={() => setFilterTab('HAS_DEBT')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              filterTab === 'HAS_DEBT'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-amber-400 hover:text-amber-300'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            عليهم مديونية ({stats.debtorCount})
          </button>
          <button
            onClick={() => setFilterTab('EXCEEDED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              filterTab === 'EXCEEDED'
                ? 'bg-rose-600 text-white shadow-md'
                : 'text-rose-400 hover:text-rose-300'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
            تجاوزوا السقف ({stats.exceededCount})
          </button>
          <button
            onClick={() => setFilterTab('ZERO_BALANCE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              filterTab === 'ZERO_BALANCE'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-emerald-400 hover:text-emerald-300'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            مسدد بالكامل ({customers.filter((c) => (c.balance || 0) <= 0).length})
          </button>
        </div>

        {/* Right Side: Export Excel / CSV */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 rounded-xl bg-[#17233A] hover:bg-[#23324D] border border-[#23324D] hover:border-teal-500/50 text-slate-200 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
          >
            <Download className="w-4 h-4 text-teal-400" />
            <span>تصدير كشف الديون (Excel)</span>
          </button>
        </div>

      </div>

      {/* 3. Customers Data Table */}
      <div className="flex-1 bg-[#111A2B] border border-[#23324D] rounded-2xl overflow-hidden shadow-xl flex flex-col">
        
        {/* Table Header Bar */}
        <div className="bg-[#17233A]/80 border-b border-[#23324D] px-4 py-2.5 flex items-center justify-between text-xs font-bold text-slate-300">
          <div>
            سجل حسابات ومديونيات عملاء الصيدلية ({filteredCustomers.length} عميل)
          </div>
          <div className="text-slate-400 text-[11px] flex items-center gap-2">
            <span>💡 عند سداد العميل دفعة، يصدر النظام سند قبض حراري فوري ويُحدّث المديونية والدرج تلقائياً</span>
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-y-auto">
          {filteredCustomers.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400">
              <div className="w-16 h-16 rounded-2xl bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center justify-center mb-3">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h4 className="text-base font-bold text-white mb-1">
                لا توجد سجلات عملاء تطابق الفلتر المحدد
              </h4>
              <p className="text-xs text-slate-500 max-w-sm">
                يمكنك تسجيل عميل جديد، أو تبديل فلترة البحث لاستعراض كافة السجلات.
              </p>
            </div>
          ) : (
            <table className="w-full text-right text-xs">
              <thead className="bg-[#17233A]/40 text-slate-400 sticky top-0 z-10 border-b border-[#23324D]">
                <tr>
                  <th className="py-2.5 px-4 w-10 text-center">#</th>
                  <th className="py-2.5 px-4">بيانات العميل</th>
                  <th className="py-2.5 px-4 text-center w-32">سقف الائتمان</th>
                  <th className="py-2.5 px-4 text-center w-36">المديونية الحالية</th>
                  <th className="py-2.5 px-4 text-center w-48">نسبة استهلاك السقف</th>
                  <th className="py-2.5 px-4 text-center w-36">آخر دفعة سداد</th>
                  <th className="py-2.5 px-4 text-center w-64">الإجراءات التفاعلية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#23324D]/60">
                {filteredCustomers.map((customer, index) => {
                  const balance = customer.balance || 0;
                  const limit = customer.credit_limit || 2000;
                  const ratio = limit > 0 ? (balance / limit) * 100 : 0;
                  const isZero = balance <= 0;
                  const isExceeded = balance > limit;

                  return (
                    <tr
                      key={customer.id}
                      className={`transition-colors group ${
                        isExceeded
                          ? 'bg-rose-500/[0.03] hover:bg-[#17233A]/70'
                          : isZero
                          ? 'hover:bg-[#17233A]/50'
                          : 'hover:bg-[#17233A]/50'
                      }`}
                    >
                      {/* # */}
                      <td className="py-3 px-4 text-center font-bold text-slate-500 font-mono">
                        {index + 1}
                      </td>

                      {/* Customer Info */}
                      <td className="py-3 px-4">
                        <div>
                          <div className="font-bold text-white text-sm flex items-center gap-2">
                            <span>{customer.name}</span>
                            {isExceeded && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold animate-pulse">
                                تجاوز السقف
                              </span>
                            )}
                            {isZero && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                                مسدد ✓
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-3 mt-1">
                            <span className="flex items-center gap-1 font-mono text-teal-300">
                              <Phone className="w-3 h-3 text-slate-500" />
                              {customer.phone}
                            </span>
                            {customer.address && (
                              <span className="flex items-center gap-1 text-slate-400">
                                <MapPin className="w-3 h-3 text-slate-500" />
                                {customer.address}
                              </span>
                            )}
                          </div>
                          {customer.notes && (
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              ملاحظة: {customer.notes}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Credit Limit */}
                      <td className="py-3 px-4 text-center">
                        <span className="font-mono font-bold text-sm text-slate-300">
                          {limit.toLocaleString('en-US')} ج.م
                        </span>
                      </td>

                      {/* Current Debt Badge */}
                      <td className="py-3 px-4 text-center">
                        {isZero ? (
                          <span className="px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono font-bold text-sm inline-block">
                            0.00 ج.م
                          </span>
                        ) : isExceeded ? (
                          <span className="px-2.5 py-1 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-400 font-mono font-bold text-sm inline-block animate-pulse">
                            {balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono font-bold text-sm inline-block">
                            {balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
                          </span>
                        )}
                      </td>

                      {/* Progress Bar (Credit Consumption) */}
                      <td className="py-3 px-4 text-center">
                        <div className="w-full max-w-[150px] mx-auto space-y-1">
                          <div className="flex justify-between text-[10px] font-mono">
                            <span className="text-slate-400">{ratio.toFixed(0)}%</span>
                            <span className={isExceeded ? 'text-rose-400 font-bold' : 'text-slate-400'}>
                              {isExceeded ? 'تجاوز الحد' : `${balance.toFixed(0)} / ${limit.toFixed(0)}`}
                            </span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-[#0B1220] border border-[#23324D] overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                isZero
                                  ? 'bg-emerald-500 w-0'
                                  : isExceeded
                                  ? 'bg-rose-500 shadow-glow-rose'
                                  : ratio > 70
                                  ? 'bg-amber-500'
                                  : 'bg-teal-500'
                              }`}
                              style={{ width: `${Math.min(100, ratio)}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>

                      {/* Last Payment */}
                      <td className="py-3 px-4 text-center">
                        {customer.last_payment_date ? (
                          <div>
                            <div className="font-mono font-bold text-emerald-400 text-xs">
                              {customer.last_payment_amount?.toFixed(2)} ج.م
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                              {customer.last_payment_date}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-600 text-[11px]">- لا يوجد -</span>
                        )}
                      </td>

                      {/* Action Buttons */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          
                          {/* 1. Collect Payment */}
                          <button
                            type="button"
                            onClick={() => setCustomerForPayment(customer)}
                            title="سداد دفعة نقدية وإصدار سند قبض"
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/35 border border-emerald-500/40 text-emerald-300 text-xs font-bold transition-all flex items-center gap-1 shadow-sm"
                          >
                            <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                            <span>سداد</span>
                          </button>

                          {/* 2. Statement of Account */}
                          <button
                            type="button"
                            onClick={() => setCustomerForStatement(customer)}
                            title="كشف حساب تفصيلي وطباعة A4"
                            className="px-2.5 py-1.5 rounded-lg bg-[#17233A] hover:bg-[#23324D] border border-[#23324D] text-slate-300 hover:text-white text-xs font-bold transition-colors flex items-center gap-1"
                          >
                            <FileText className="w-3.5 h-3.5 text-teal-400" />
                            <span>كشف</span>
                          </button>

                          {/* 3. WhatsApp Debt Reminder */}
                          {balance > 0 && (
                            <button
                              type="button"
                              onClick={() => handleSendWhatsAppReminder(customer)}
                              title="إرسال رسالة تذكير بالمديونية عبر واتساب"
                              className="w-8 h-8 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-400 flex items-center justify-center transition-colors"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* 4. Edit Customer */}
                          <button
                            type="button"
                            onClick={() => {
                              setCustomerToEdit(customer);
                              setShowAddModal(true);
                            }}
                            title="تعديل بيانات العميل أو سقف الائتمان"
                            className="w-8 h-8 rounded-lg bg-[#17233A] hover:bg-[#23324D] border border-[#23324D] text-slate-300 hover:text-white flex items-center justify-center transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
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
            عرض <span className="font-bold text-white">{filteredCustomers.length}</span> عميل
            {searchQuery && <span className="text-teal-300 mr-2">(مطابق للبحث: "{searchQuery}")</span>}
          </div>
          <div className="flex items-center gap-6">
            <div>
              المديونية الإجمالية: <span className="font-bold text-amber-400 font-mono text-sm">
                {stats.totalDebt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
              </span>
            </div>
            <div>
              التحصيلات النقدية: <span className="font-bold text-emerald-400 font-mono text-sm">
                {stats.collectedThisMonth.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Helper Modals */}
      <AddCustomerModal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setCustomerToEdit(null);
        }}
        customerToEdit={customerToEdit}
        onSaveCustomer={handleSaveCustomer}
      />

      <PaymentReceiptModal
        isOpen={!!customerForPayment}
        onClose={() => setCustomerForPayment(null)}
        customer={customerForPayment}
        onCollectPayment={handleCollectPayment}
      />

      <CustomerStatementModal
        isOpen={!!customerForStatement}
        onClose={() => setCustomerForStatement(null)}
        customer={customerForStatement}
      />

    </div>
  );
}
