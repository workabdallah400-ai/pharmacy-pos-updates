import React, { useState, useEffect } from 'react';
import { X, Unlock, User, DollarSign, Clock, Sparkles, AlertCircle } from 'lucide-react';
import { playCashDrawerSound } from '../utils/sound';
import { sqliteService } from '../db/sqliteService';

export function OpenShiftModal({ isOpen, onClose, onOpenShift, currentUser = null }) {
  // The cashier defaults to whoever is actually logged in. A hardcoded name here
  // used to stamp every shift with the same person, which broke accountability in
  // pharmacies with more than one cashier.
  const loggedInName = currentUser?.full_name || currentUser?.name || '';
  const [cashierName, setCashierName] = useState(loggedInName);
  const [cashiers, setCashiers] = useState([]);
  const [openingCash, setOpeningCash] = useState('500');
  const [shiftNumber, setShiftNumber] = useState('1');
  const [error, setError] = useState('');

  // Load the real active users so the dropdown lists actual staff, not placeholders.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const users = await sqliteService.getUsers();
        if (cancelled || !Array.isArray(users)) return;
        const active = users.filter((u) => Number(u.is_active) !== 0);
        setCashiers(active);
      } catch (e) {
        // Non-fatal: the logged-in user is still selectable below.
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen]);

  // Re-sync the default whenever the modal opens for a different user.
  useEffect(() => {
    if (isOpen && loggedInName) setCashierName(loggedInName);
  }, [isOpen, loggedInName]);

  if (!isOpen) return null;

  // Always offer the logged-in user, even if the user list failed to load.
  const options = (() => {
    const list = cashiers.map((u) => ({
      value: u.full_name || u.username,
      label: `${u.full_name || u.username}${u.role === 'admin' ? ' (مدير)' : u.role === 'cashier' ? ' (كاشير)' : ''}`
    }));
    if (loggedInName && !list.some((o) => o.value === loggedInName)) {
      list.unshift({ value: loggedInName, label: `${loggedInName} (المستخدم الحالي)` });
    }
    return list;
  })();

  const handleSubmit = (e) => {
    e.preventDefault();
    const floatVal = parseFloat(openingCash);
    if (isNaN(floatVal) || floatVal < 0) {
      setError('يرجى إدخال مبلغ عهدة صحيح (ج.م)');
      return;
    }

    const now = new Date();
    const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
    const hms = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const shiftId = `SH-${ymd}-${String(shiftNumber).padStart(2, '0')}-${hms}`;

    const newShift = {
      id: shiftId,
      shift_number: parseInt(shiftNumber, 10) || 1,
      cashier_name: cashierName,
      opened_at: now.toISOString(),
      opening_cash: floatVal,
      cash_sales: 0.0,
      visa_sales: 0.0,
      instapay_sales: 0.0,
      credit_sales: 0.0,
      total_sales: 0.0,
      debt_collections: 0.0,
      petty_expenses: 0.0,
      status: 'OPEN'
    };

    playCashDrawerSound();
    if (typeof onOpenShift === 'function') onOpenShift(newShift);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn font-cairo">
      <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#23324D] bg-[#17233A]/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center">
              <Unlock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                بدء وفتح وردية عمل جديدة
              </h3>
              <p className="text-xs text-slate-400">
                تسجيل مسؤول الوردية وعهدة النقدية الافتتاحية
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#23324D] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Cashier Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              صيدلي أو كاشير الوردية <span className="text-rose-400">*</span>
            </label>
            <select
              value={cashierName}
              onChange={(e) => setCashierName(e.target.value)}
              className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl px-3.5 py-2.5 text-sm font-bold text-white focus:outline-none"
            >
              {options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Shift Number */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                رقم الوردية
              </label>
              <select
                value={shiftNumber}
                onChange={(e) => setShiftNumber(e.target.value)}
                className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl px-3.5 py-2.5 text-sm font-bold text-white focus:outline-none"
              >
                <option value="1">الوردية الأولى (صباحي)</option>
                <option value="2">الوردية الثانية (مسائي)</option>
                <option value="3">الوردية الثالثة (ليلي)</option>
              </select>
            </div>

            {/* Opening Cash Float */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                عهدة بداية الدرج <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="50"
                  required
                  value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                  className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl pl-12 pr-3.5 py-2.5 text-sm font-bold text-emerald-400 focus:outline-none font-mono"
                />
                <span className="absolute left-3 top-2.5 text-xs text-slate-400">ج.م</span>
              </div>
            </div>
          </div>

          <div className="p-3 bg-[#0B1220] rounded-xl border border-[#23324D] text-xs text-slate-400 flex items-center gap-2">
            <Clock className="w-4 h-4 text-teal-400 shrink-0" />
            <span>سيتم تسجيل وقت بداية الوردية وربط جميع فواتير الكاشير الحالية بها.</span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#23324D]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-[#23324D] text-xs font-bold transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white text-xs font-bold shadow-lg shadow-teal-500/20 flex items-center gap-2 transition-all"
            >
              <Sparkles className="w-4 h-4" />
              تأكيد فتح الوردية ودرج النقدية
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
