import React, { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, X } from 'lucide-react';

/**
 * Non-blocking confirmation dialog.
 *
 * `window.confirm()` is synchronous and freezes the Electron renderer thread,
 * which hangs the whole app until the OS dialog is dismissed. This module
 * replaces it with a promise-based React modal that never blocks the event loop.
 *
 *   if (!(await confirmDialog({ title: '...', message: '...' }))) return;
 *
 * Mount <ConfirmHost /> once (App does this) and call confirmDialog anywhere.
 */

let listener = null;

export function confirmDialog(options = {}) {
  const opts = typeof options === 'string' ? { message: options } : options;
  return new Promise((resolve) => {
    if (!listener) {
      // No host mounted: fail safe rather than silently confirming a
      // destructive action.
      resolve(false);
      return;
    }
    listener({ ...opts, resolve });
  });
}

export function ConfirmHost() {
  const [request, setRequest] = useState(null);

  useEffect(() => {
    listener = (req) => setRequest(req);
    return () => { listener = null; };
  }, []);

  const settle = useCallback((value) => {
    setRequest((current) => {
      if (current) current.resolve(value);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!request) return;
    const onKey = (e) => {
      if (e.key === 'Escape') settle(false);
      if (e.key === 'Enter') settle(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request, settle]);

  if (!request) return null;

  const {
    title = 'تأكيد العملية',
    message = '',
    confirmLabel = 'تأكيد',
    cancelLabel = 'إلغاء',
    danger = false
  } = request;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn font-cairo"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#23324D] bg-[#17233A]/70">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${danger ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' : 'bg-teal-500/20 text-teal-400 border-teal-500/30'}`}>
              <AlertTriangle className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-white">{title}</h3>
          </div>
          <button
            type="button"
            onClick={() => settle(false)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#23324D] transition-colors"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5">
          <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">{message}</p>
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[#23324D]">
          <button
            type="button"
            onClick={() => settle(false)}
            className="px-4 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-[#23324D] text-xs font-bold transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => settle(true)}
            className={`px-5 py-2.5 rounded-xl text-white text-xs font-bold shadow-lg flex items-center gap-2 transition-all ${danger ? 'bg-gradient-to-r from-rose-500 to-red-500 hover:from-rose-400 hover:to-red-400 shadow-rose-500/20' : 'bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 shadow-teal-500/20'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
