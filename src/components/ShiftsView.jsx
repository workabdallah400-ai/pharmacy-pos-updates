import React, { useState, useEffect } from 'react';
import {
  Clock,
  DollarSign,
  TrendingUp,
  CreditCard,
  Wallet,
  Lock,
  Unlock,
  Printer,
  QrCode,
  CheckCircle2,
  AlertTriangle,
  User,
  ShoppingBag,
  ArrowUpRight,
  ArrowDownLeft,
  Smartphone,
  Sparkles,
  RefreshCw,
  Search,
  Eye,
  RotateCcw,
  Receipt
} from 'lucide-react';
import {
  INITIAL_CURRENT_SHIFT
} from '../data/mockReports';
import { CloseShiftModal } from './CloseShiftModal';
import { OpenShiftModal } from './OpenShiftModal';
import { playBarcodeBeep, playCashDrawerSound } from '../utils/sound';
import { sqliteService } from '../db/sqliteService';

export function ShiftsView({ currentShift: propCurrentShift, onUpdateCurrentShift, currentUser = null }) {
  // Current active shift
  const [currentShift, setCurrentShift] = useState(() => {
    if (propCurrentShift !== undefined) return propCurrentShift;
    try {
      const saved = localStorage.getItem('PHARMACY_ACTIVE_SHIFT');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed) return parsed;
      }
    } catch (e) {}
    return INITIAL_CURRENT_SHIFT;
  });

  useEffect(() => {
    if (propCurrentShift !== undefined) {
      setCurrentShift(propCurrentShift);
      if (propCurrentShift) {
        const exp =
          (propCurrentShift.opening_cash || 0) +
          (propCurrentShift.cash_sales || 0) +
          (propCurrentShift.debt_collections || 0) -
          (propCurrentShift.petty_expenses || 0);
        setActualCashInput(String(exp));
      }
    }
  }, [propCurrentShift]);

  // Shifts archive history
  const [shiftsHistory, setShiftsHistory] = useState([]);

  // Actual Cash Counted Input
  const [actualCashInput, setActualCashInput] = useState('0');

  // Modals state
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [selectedShiftForReprint, setSelectedShiftForReprint] = useState(null);
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Load real-time shift from SQLite on mount
  useEffect(() => {
    let isCurrent = true;
    const loadDbShift = async () => {
      try {
        const dbShift = await sqliteService.getCurrentShift();
        if (isCurrent && dbShift) {
          setCurrentShift(dbShift);
          const exp =
            (dbShift.opening_cash || 0) +
            (dbShift.cash_sales || 0) +
            (dbShift.debt_collections || 0) -
            (dbShift.petty_expenses || 0);
          setActualCashInput(String(exp));
        } else if (isCurrent && !dbShift) {
          // No OPEN shift in SQLite: clear any stale shift restored from
          // localStorage so the POS cannot sell against a nonexistent shift.
          setCurrentShift(null);
          if (onUpdateCurrentShift) onUpdateCurrentShift(null);
        }

        const dbHistory = await sqliteService.getShiftsHistory(30);
        if (isCurrent && dbHistory && dbHistory.length > 0) {
          setShiftsHistory(dbHistory);
        }
      } catch (err) {
        console.warn('SQLite shift query error:', err);
      }
    };

    loadDbShift();
    return () => { isCurrent = false; };
  }, []);

  useEffect(() => {
    try {
      if (currentShift) {
        localStorage.setItem('PHARMACY_ACTIVE_SHIFT', JSON.stringify(currentShift));
      } else {
        localStorage.removeItem('PHARMACY_ACTIVE_SHIFT');
      }
    } catch (e) {}
  }, [currentShift]);

  useEffect(() => {
    try {
      localStorage.setItem('PHARMACY_SHIFTS_HISTORY', JSON.stringify(shiftsHistory));
    } catch (e) {}
  }, [shiftsHistory]);

  // Financial calculations
  const openingCash = currentShift ? currentShift.opening_cash || 0 : 0;
  const cashSales = currentShift ? currentShift.cash_sales || 0 : 0;
  const visaSales = currentShift ? currentShift.visa_sales || 0 : 0;
  const instapaySales = currentShift ? currentShift.instapay_sales || 0 : 0;
  const creditSales = currentShift ? currentShift.credit_sales || 0 : 0;
  const totalSales = currentShift ? currentShift.total_sales || 0 : 0;
  const debtCollections = currentShift ? currentShift.debt_collections || 0 : 0;
  const pettyExpenses = currentShift ? currentShift.petty_expenses || 0 : 0;

  const expectedCash = openingCash + cashSales + debtCollections - pettyExpenses;
  const actualCash = parseFloat(actualCashInput) || 0;
  const cashDiscrepancy = actualCash - expectedCash;

  // Open Shift
  const handleOpenShift = async (shiftData) => {
    try {
      await sqliteService.openShift(shiftData);
    } catch (err) {
      console.warn('SQLite open shift fallback:', err);
    }

    setCurrentShift(shiftData);
    if (onUpdateCurrentShift) onUpdateCurrentShift(shiftData);
    setActualCashInput(String(shiftData.opening_cash));
    setShowOpenModal(false);
    playCashDrawerSound();
    showToast(`تم فتح وردية جديدة بنجاح برقم (#${shiftData.id}) 🔓`);
  };

  // Close Shift & Print Z-Report
  const handleCloseShift = async (closingData) => {
    let closed;
    try {
      closed = await sqliteService.closeShift(closingData);
    } catch (err) {
      console.warn('SQLite close shift failed:', err);
      showToast(`تعذر تقفيل الوردية في قاعدة البيانات: ${err?.message || ''}`.trim());
      // Rethrow so CloseShiftModal stays open instead of pretending success.
      throw err;
    }

    const finalShift = { ...closingData, ...(closed || {}), status: 'CLOSED' };
    setShiftsHistory((prev) => [finalShift, ...prev]);
    setSelectedShiftForReprint(finalShift);
    setCurrentShift(null);
    if (onUpdateCurrentShift) onUpdateCurrentShift(null);
    setShowCloseModal(false);
    playCashDrawerSound();
    showToast('تم إغلاق الوردية وجرد النقدية واستخراج تقرير Z-Report بنجاح 🔒');

    try {
      const dbHistory = await sqliteService.getShiftsHistory(30);
      if (dbHistory) setShiftsHistory(dbHistory);
    } catch (e) {}

    // Push the closed shift to the report server straight away, then upload a
    // full snapshot. This is what keeps the hosted QR report complete — and
    // it restores the data on free cloud tiers whose disk is wiped whenever
    // the service sleeps.
    try {
      const shiftId = finalShift.id || finalShift.shift_id;
      if (shiftId) {
        await sqliteService.resendShiftToReportServer(shiftId);
      }
      await sqliteService.refreshCloudReports();
    } catch (e) {
      console.warn('Cloud refresh after shift close failed:', e);
    }
  };

  // Direct Drawer Kick
  const handleKickDrawer = () => {
    playCashDrawerSound();
    showToast('تم إرسال إشارة فتح درج النقدية للكاشير 💵');
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

      {/* Top Header Bar */}
      <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl p-4 flex items-center justify-between shadow-lg shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/15 text-teal-400 border border-teal-500/30 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              إدارة وجرد وتقفيل الورديات (Shift Management & Z-Report)
              {currentShift ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  وردية نشطة (#{currentShift.id})
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 font-bold">
                  لا توجد وردية مفتوحة
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400">
              متابعة عهدة الدرج، جرد النقدية، معالجة العجز والزيادة، واستخراج تقارير Z-Report
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleKickDrawer}
            className="px-3.5 py-2 rounded-xl bg-[#17233A] hover:bg-[#202E4C] border border-[#23324D] text-teal-300 text-xs font-bold flex items-center gap-2 transition-all cursor-pointer"
          >
            <Wallet className="w-4 h-4 text-teal-400" />
            <span>فتح درج النقدية</span>
          </button>

          {currentShift ? (
            <button
              type="button"
              onClick={() => setShowCloseModal(true)}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-xs font-black shadow-lg shadow-rose-600/20 flex items-center gap-2 transition-all cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>تقفيل الوردية الحالية وطباعة Z-Report</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowOpenModal(true)}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white text-xs font-black shadow-lg shadow-teal-500/20 flex items-center gap-2 transition-all cursor-pointer"
            >
              <Unlock className="w-4 h-4" />
              <span>فتح وردية عمل جديدة</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-y-auto space-y-4">
        
        {/* Active Shift Cash Flow Card */}
        <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-[#23324D] pb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">حركة الدرج المباشرة للوردية</span>
              {currentShift && (
                <span className="text-xs text-slate-400">
                  الكاشير: <strong className="text-teal-300">{currentShift.cashier_name || 'الكاشير'}</strong> • 
                  وقت الفتح: <span className="font-mono">{new Date(currentShift.opened_at).toLocaleTimeString('ar-EG')}</span>
                </span>
              )}
            </div>

            <div className="text-xs font-mono text-slate-400">
              إجمالي مبيعات الوردية: <span className="text-emerald-400 font-bold">{totalSales.toFixed(2)} ج.م</span>
            </div>
          </div>

          {currentShift ? (
            <div className="grid grid-cols-6 gap-3 items-center">
              {/* 1. Opening Cash */}
              <div className="bg-[#0B1220] p-3 rounded-xl border border-[#23324D] text-center">
                <span className="text-[10px] text-slate-400 block mb-1">(+) عهدة البداية</span>
                <span className="font-mono font-bold text-sm text-slate-200">{openingCash.toFixed(2)} ج.م</span>
              </div>

              {/* 2. Cash Sales */}
              <div className="bg-[#0B1220] p-3 rounded-xl border border-[#23324D] text-center">
                <span className="text-[10px] text-slate-400 block mb-1">(+) مبيعات الكاش</span>
                <span className="font-mono font-bold text-sm text-emerald-400">+{cashSales.toFixed(2)} ج.م</span>
              </div>

              {/* 3. Debt Collections */}
              <div className="bg-[#0B1220] p-3 rounded-xl border border-[#23324D] text-center">
                <span className="text-[10px] text-slate-400 block mb-1">(+) تحصيل ديون</span>
                <span className="font-mono font-bold text-sm text-teal-400">+{debtCollections.toFixed(2)} ج.م</span>
              </div>

              {/* 4. Petty Expenses */}
              <div className="bg-[#0B1220] p-3 rounded-xl border border-[#23324D] text-center">
                <span className="text-[10px] text-slate-400 block mb-1">(-) مصاريف نثرية</span>
                <span className="font-mono font-bold text-sm text-rose-400">-{pettyExpenses.toFixed(2)} ج.م</span>
              </div>

              {/* 5. Expected Cash in Drawer */}
              <div className="bg-[#17233A] p-3 rounded-xl border border-teal-500/40 text-center shadow-glow-teal">
                <span className="text-[10px] text-teal-300 font-bold block mb-1">(=) النقدية المتوقعة بالدرج</span>
                <span className="font-mono font-black text-base text-white">{expectedCash.toFixed(2)} ج.م</span>
              </div>

              {/* 6. Counted Cash Input & Discrepancy */}
              <div className="bg-[#0B1220] p-3 rounded-xl border border-[#23324D] flex flex-col justify-center">
                <label className="text-[10px] font-bold text-slate-400 block mb-1">
                  النقدية الفعلية بالجرد:
                </label>
                <input
                  type="number"
                  step="1"
                  value={actualCashInput}
                  onChange={(e) => setActualCashInput(e.target.value)}
                  className="w-full bg-[#111A2B] border border-[#23324D] focus:border-teal-400 rounded-lg px-2.5 py-1 text-sm font-bold text-teal-300 font-mono focus:outline-none"
                />
                <div className="mt-1 text-center">
                  {cashDiscrepancy === 0 ? (
                    <span className="text-[10px] text-emerald-400 font-bold">🟢 متطابق تماماً</span>
                  ) : cashDiscrepancy > 0 ? (
                    <span className="text-[10px] text-amber-400 font-bold">🟡 زيادة (+{cashDiscrepancy.toFixed(2)} ج.م)</span>
                  ) : (
                    <span className="text-[10px] text-rose-400 font-bold">🔴 عجز ({cashDiscrepancy.toFixed(2)} ج.م)</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400 bg-[#0B1220] rounded-xl border border-dashed border-[#23324D]">
              <Clock className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-300">لا توجد وردية مفتوحة حالياً في نقطة البيع</p>
              <p className="text-xs text-slate-500 mt-1">اضغط على زر [فتح وردية عمل جديدة] بالأعلى لتسجيل عهدة البداية واستلام الدرج.</p>
            </div>
          )}
        </div>

        {/* Previous Shifts History Archive Table */}
        <div className="flex-1 bg-[#111A2B] border border-[#23324D] rounded-2xl p-5 shadow-lg flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#23324D] pb-3 mb-3">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-teal-400" />
              <h4 className="text-sm font-bold text-white">أرشيف وسجل الورديات السابقة (Shifts History)</h4>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              إجمالي الورديات المؤرشفة: <strong className="text-teal-300">{shiftsHistory.length}</strong>
            </span>
          </div>

          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-[#141E30] text-slate-300 border-b border-[#23324D] font-bold">
                <tr>
                  <th className="p-3">رقم الوردية</th>
                  <th className="p-3">الكاشير</th>
                  <th className="p-3">وقت الفتح</th>
                  <th className="p-3">وقت الإغلاق</th>
                  <th className="p-3">عهدة البداية</th>
                  <th className="p-3">مبيعات الكاش</th>
                  <th className="p-3">إجمالي المبيعات</th>
                  <th className="p-3">العجز / الزيادة</th>
                  <th className="p-3 text-center">الباركود والتقرير الذكي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#23324D]/60 font-medium">
                {shiftsHistory.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="text-center py-12 text-slate-400">
                      لا توجد سجلات لورديات سابقة. النظام جاهز ونظيف على الزيرو.
                    </td>
                  </tr>
                ) : (
                  shiftsHistory.map((s, idx) => {
                    const diff = (s.actual_cash || 0) - (s.expected_cash || 0);
                    return (
                      <tr key={s.id || idx} className="hover:bg-[#17233A]/70 transition-colors">
                        <td className="p-3 font-mono font-bold text-teal-300">#{s.id}</td>
                        <td className="p-3 font-bold text-white">{s.cashier_name || 'الكاشير'}</td>
                        <td className="p-3 font-mono text-slate-400">
                          {s.opened_at ? new Date(s.opened_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                        </td>
                        <td className="p-3 font-mono text-slate-400">
                          {s.closed_at ? new Date(s.closed_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                        </td>
                        <td className="p-3 font-mono text-slate-300">{(s.opening_cash || 0).toFixed(2)} ج.م</td>
                        <td className="p-3 font-mono text-emerald-400">{(s.cash_sales || 0).toFixed(2)} ج.م</td>
                        <td className="p-3 font-mono font-bold text-teal-300">{(s.total_sales || 0).toFixed(2)} ج.م</td>
                        <td className="p-3 font-mono">
                          {diff === 0 ? (
                            <span className="text-emerald-400 font-bold">🟢 متطابق</span>
                          ) : diff > 0 ? (
                            <span className="text-amber-400 font-bold">+{diff.toFixed(2)} ج.م</span>
                          ) : (
                            <span className="text-rose-400 font-bold">{diff.toFixed(2)} ج.م</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => setSelectedShiftForReprint(s)}
                            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-teal-600/30 to-emerald-600/30 hover:from-teal-600/50 hover:to-emerald-600/50 text-teal-200 hover:text-white border border-teal-500/40 text-xs font-bold flex items-center gap-1.5 mx-auto transition-all cursor-pointer shadow-sm"
                          >
                            <QrCode className="w-3.5 h-3.5 text-emerald-400" />
                            <span>الباركود والتقرير الشامل 📱</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Open Shift Modal */}
      {showOpenModal && (
        <OpenShiftModal
          isOpen={true}
          currentUser={currentUser}
          onClose={() => setShowOpenModal(false)}
          onOpenShift={handleOpenShift}
          nextShiftId={(shiftsHistory[0]?.id || 0) + 1}
        />
      )}

      {/* Close Shift Modal */}
      {showCloseModal && currentShift && (
        <CloseShiftModal
          isOpen={true}
          shiftData={currentShift}
          expectedCash={expectedCash}
          actualCash={actualCash}
          cashDiscrepancy={cashDiscrepancy}
          onClose={() => setShowCloseModal(false)}
          onConfirmCloseShift={handleCloseShift}
        />
      )}

      {/* Historical Shift Comprehensive Modal with Real QR Code & Items Breakdown */}
      {selectedShiftForReprint && (
        <CloseShiftModal
          isOpen={true}
          shiftData={selectedShiftForReprint}
          onClose={() => setSelectedShiftForReprint(null)}
        />
      )}

    </div>
  );
}
