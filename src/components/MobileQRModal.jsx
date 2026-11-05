import React, { useState, useEffect } from 'react';
import { X, ShieldCheck, RefreshCw, ExternalLink, Copy, Link2 } from 'lucide-react';
import QRCode from 'qrcode';
import { sqliteService } from '../db/sqliteService';
import { resolveShiftReportUrl, resolveLocalReportUrl, buildDailySummaryUrl, getReportBaseUrl, localDateKey, readSettings, ensureCloudToken } from '../utils/reportServer';

export function MobileQRModal({ isOpen, onClose, shiftTotal = 0, itemsCount = 0 }) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [summary, setSummary] = useState(null);
  const [reportUrl, setReportUrl] = useState('');
  const [reportBase, setReportBase] = useState('');
  const [copied, setCopied] = useState(false);
  const [dailyUrl, setDailyUrl] = useState('');
  const [copiedDaily, setCopiedDaily] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const build = async () => {
      try {
        const shift = await sqliteService.getCurrentShift();
        const audit = shift ? await sqliteService.getShiftFullAudit(shift.id) : null;
        const s = audit?.summary || null;
        const shiftInvoices = Array.isArray(audit?.invoices) ? audit.invoices : [];
        const shiftPurchases = Array.isArray(audit?.purchases) ? audit.purchases : [];
        const shiftExpenses = Array.isArray(audit?.expenses) ? audit.expenses : [];
        if (cancelled) return;
        setSummary(s);

        // Make sure the report token exists before building the links, so the
        // daily/permanent URLs are not rejected with 401.
        ensureCloudToken();
        const settings = readSettings() || {};
        const pharmacyName = settings.pharmacyName || 'صيدلية النخبة الحديثة';
        const pharmacyId = settings.cloudPharmacyId || 'PHARMACY-LOCAL';
        const shiftId = shift?.id || s?.id || '';

        // Self-Contained Offline Text QR: No Wi-Fi, No Internet, No Network needed
        const qrText = [
          `📊 تقرير وردية لحظي (F12) - ${pharmacyName}`,
          `الوردية: #${shiftId || '—'} - ${s?.cashier_name || shift?.cashier_name || 'الكاشير'}`,
          `المبيعات: ${Number(s?.total_sales ?? shift?.total_sales ?? shiftTotal ?? 0).toFixed(2)} ج.م`,
          `• كاش: ${Number(s?.cash_sales ?? shift?.cash_sales ?? 0).toFixed(2)} | فيزا: ${Number(s?.visa_sales ?? shift?.visa_sales ?? 0).toFixed(2)}`,
          `• آجل: ${Number(s?.credit_sales ?? shift?.credit_sales ?? 0).toFixed(2)} | إنستاباي: ${Number(s?.instapay_sales ?? shift?.instapay_sales ?? 0).toFixed(2)}`,
          `فواتير البيع: ${shiftInvoices.length || itemsCount}`,
          `عهدة البداية: ${Number(s?.opening_cash ?? shift?.opening_cash ?? 0).toFixed(2)} ج.م`,
          `المتوقع بالدرج: ${Number(s?.expected_cash ?? shift?.expected_cash ?? 0).toFixed(2)} ج.م`,
          `فواتير التوريد: ${shiftPurchases.length}`,
          `مصروفات نثريات: ${shiftExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0).toFixed(2)} ج.م`
        ].join('\n');

        // Hosted / LAN links for the report and the permanent daily summary.
        // These are optional extras: the QR above already works completely
        // offline, so a missing URL must never break the modal.
        if (shiftId) {
          const [shiftUrl, localUrl] = await Promise.all([
            resolveShiftReportUrl(shiftId, pharmacyId).catch(() => ''),
            resolveLocalReportUrl(shiftId, pharmacyId).catch(() => '')
          ]);
          if (!cancelled) {
            // Prefer the permanent host; fall back to the LAN address so a
            // phone inside the pharmacy can still open the full report.
            setReportUrl(shiftUrl || localUrl || '');
            setReportBase(getReportBaseUrl() || '');
          }
        }
        if (!cancelled) {
          setDailyUrl(buildDailySummaryUrl(pharmacyId, localDateKey()) || '');
        }

        const url = await QRCode.toDataURL(qrText, {
          width: 480,
          margin: 2,
          color: { dark: '#0B1220', light: '#FFFFFF' },
          errorCorrectionLevel: 'M'
        });
        if (!cancelled) setQrDataUrl(url);
      } catch (e) {
        console.warn('Failed to build mobile QR:', e);
        try {
          const fallback = await QRCode.toDataURL(
            `وردية صيدلية - مبيعات: ${Number(shiftTotal || 0).toFixed(2)} ج.م - فواتير: ${itemsCount}`,
            { width: 480, margin: 2, errorCorrectionLevel: 'L' }
          );
          if (!cancelled) setQrDataUrl(fallback);
        } catch (err) {}
      }
    };

    build();
    return () => { cancelled = true; };
  }, [isOpen, shiftTotal, itemsCount]);

  if (!isOpen) return null;

  const handleCopyLink = async () => {
    if (!reportUrl) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(reportUrl);
      } else {
        const ta = document.createElement('textarea');
        ta.value = reportUrl;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {}
  };

  const handleCopyDaily = async () => {
    if (!dailyUrl) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(dailyUrl);
      } else {
        const ta = document.createElement('textarea');
        ta.value = dailyUrl;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedDaily(true);
      setTimeout(() => setCopiedDaily(false), 2000);
    } catch (e) {}
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-sm bg-[#111A2B] border border-[#23324D] rounded-3xl shadow-card-dark overflow-hidden flex flex-col items-center text-center p-6 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Top Close */}
        <div className="w-full flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-teal-500/20 text-teal-300 border border-teal-500/30 px-2 py-0.5 rounded-full font-bold">
              F12
            </span>
            <span className="font-bold text-sm text-white">متابعة الوردية عبر الموبايل</span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-xl bg-[#17233A] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-[#23324D] flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Real QR Code */}
        <div className="p-4 bg-white rounded-2xl shadow-glow-teal mb-3 flex items-center justify-center">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="Live Shift QR" className="w-48 h-48 object-contain rounded-xl" />
          ) : (
            <div className="w-48 h-48 flex flex-col items-center justify-center text-slate-500">
              <RefreshCw className="w-8 h-8 animate-spin mb-2" />
              <span className="text-[10px] font-bold">جاري توليد الباركود...</span>
            </div>
          )}
        </div>

        <div className="w-full mb-3 px-3 py-1.5 rounded-xl text-[10px] font-bold border bg-emerald-500/10 text-emerald-300 border-emerald-500/30">
          📷 مسح فوري بكاميرا الموبايل — بدون إنترنت وبدون واي فاي نهائياً
        </div>

        {reportUrl && (
          <div className="w-full bg-[#0B1220] border border-teal-500/30 rounded-xl p-2.5 mb-3 text-right space-y-1">
            <div className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
              <Link2 className="w-3 h-3" />
              رابط التقرير:
            </div>
            <div dir="ltr" className="text-[10px] text-teal-300 font-mono break-all text-left select-text">
              {reportUrl}
            </div>
            {reportBase && (
              <div className="text-[9px] text-slate-500">
                السيرفر: <span dir="ltr" className="font-mono">{reportBase}</span>
              </div>
            )}
          </div>
        )}

        {dailyUrl && (
          <div className="w-full bg-[#0B1220] border border-amber-500/30 rounded-xl p-2.5 mb-3 text-right space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] text-amber-300 font-bold">📅 رابط ملخص اليوم الدائم</div>
              <button
                onClick={handleCopyDaily}
                className="px-2 py-1 rounded-lg bg-[#17233A] hover:bg-[#202E4C] border border-[#23324D] text-[9px] font-bold text-slate-200 cursor-pointer"
              >
                {copiedDaily ? 'تم النسخ ✓' : 'نسخ'}
              </button>
            </div>
            <div dir="ltr" className="text-[9px] text-amber-200 font-mono break-all text-left select-text">
              {dailyUrl}
            </div>
            <div className="text-[9px] text-slate-500 leading-3">
              يحتفظ به المالك لمتابعة تفاصيل اليوم — يعرض آخر مزامنة متاحة حتى لو الصيدلية بدون إنترنت.
            </div>
          </div>
        )}

        {/* Stats Preview */}
        <div className="w-full bg-[#17233A] border border-[#23324D] p-3 rounded-2xl mb-4 text-xs">
          <div className="flex justify-between items-center text-slate-300 mb-1">
            <span>مبيعات الوردية الحالية:</span>
            <span className="font-bold text-teal-300 font-mono" dir="ltr">
              {Number(summary?.total_sales ?? shiftTotal ?? 0).toFixed(2)} EGP
            </span>
          </div>
          <div className="flex justify-between items-center text-slate-300 mb-1">
            <span>إجمالي الفواتير الصادرة:</span>
            <span className="font-bold text-white font-mono">{summary?.sales_invoices_count ?? itemsCount} فاتورة</span>
          </div>
          <div className="flex justify-between items-center text-slate-300">
            <span>فواتير التوريد بالوردية:</span>
            <span className="font-bold text-blue-300 font-mono">{summary?.purchases_count ?? 0} فاتورة</span>
          </div>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed mb-4 flex items-start gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>
            امسح هذا الباركود بكاميرا أي هاتف ذكي ليعرض ملخص الوردية الكامل لحظياً بدون إنترنت.
            {reportUrl ? ' ويمكنك أيضاً فتح التقرير التفصيلي من الرابط أدناه.' : ''}
          </span>
        </p>

        {reportUrl && (
          <div className="w-full flex gap-2 mb-3">
            <button
              onClick={() => window.open(reportUrl, '_blank')}
              className="flex-1 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>فتح التقرير</span>
            </button>
            <button
              onClick={handleCopyLink}
              className="flex-1 py-2.5 rounded-xl bg-[#17233A] hover:bg-[#202E4C] border border-[#23324D] text-slate-200 font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all"
            >
              <Copy className="w-3.5 h-3.5 text-teal-400" />
              <span>{copied ? 'تم النسخ ✓' : 'نسخ الرابط'}</span>
            </button>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-glow-teal transition-all"
        >
          تم، إغلاق (Esc)
        </button>

      </div>
    </div>
  );
}
