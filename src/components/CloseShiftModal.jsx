import React, { useState, useEffect } from 'react';
import {
  X,
  Printer,
  QrCode,
  CheckCircle2,
  Lock,
  DollarSign,
  Sparkles,
  Smartphone,
  Copy,
  Share2,
  PackageCheck,
  Truck,
  TrendingUp,
  AlertTriangle,
  Download,
  Receipt,
  ExternalLink
} from 'lucide-react';
import QRCode from 'qrcode';
import { playCashDrawerSound } from '../utils/sound';
import { sqliteService } from '../db/sqliteService';
import {
  initReportServer,
  buildShiftReportUrl,
  buildDailySummaryUrl,
  resolveShiftReportUrl,
  resolveLocalReportUrl,
  getReportPreviewBaseUrl,
  getReportBaseUrl,
  getPermanentReportBaseUrl,
  localDateKey,
  readSettings
} from '../utils/reportServer';

export function CloseShiftModal({
  isOpen = true,
  onClose,
  shiftData,
  shift,
  expectedCash: propExpectedCash,
  actualCash: propActualCash,
  cashDiscrepancy: propDiscrepancy,
  onConfirmCloseShift,
  onConfirm,
  pharmacyName = 'صيدلية النخبة الحديثة'
}) {
  const activeShift = shiftData || shift;
  const onConfirmAction = onConfirmCloseShift || onConfirm;

  const [activeTab, setActiveTab] = useState('QR'); // 'QR', 'SALES_ITEMS', 'PURCHASES', 'PRINT'
  const [isClosing, setIsClosing] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [reportText, setReportText] = useState('');
  const [auditData, setAuditData] = useState({
    soldItems: [],
    purchases: [],
    expenses: [],
    invoices: [],
    returns: []
  });
  const [copied, setCopied] = useState(false);
  const [reportUrl, setReportUrl] = useState('');
  const [reportBase, setReportBase] = useState('');
  const [qrMode, setQrMode] = useState('TEXT');
  const [localQrDataUrl, setLocalQrDataUrl] = useState('');
  const [localReportUrl, setLocalReportUrl] = useState('');
  const [dailyUrl, setDailyUrl] = useState('');
  const [copiedDaily, setCopiedDaily] = useState(false);

  // Load audit data & generate QR code
  useEffect(() => {
    if (!activeShift) return;

    let isCurrent = true;
    const fetchAudit = async () => {
      try {
        const fullAudit = await sqliteService.getShiftFullAudit(activeShift.id);
        if (!isCurrent) return;

        setAuditData({
          soldItems: fullAudit.soldItems || [],
          purchases: fullAudit.purchases || [],
          expenses: fullAudit.expenses || [],
          invoices: fullAudit.invoices || [],
          returns: fullAudit.returns || []
        });

        // Compute numbers
        const openingCash = activeShift.opening_cash || 0;
        const cashSales = activeShift.cash_sales || 0;
        const visaSales = activeShift.visa_sales || 0;
        const instapaySales = activeShift.instapay_sales || 0;
        const creditSales = activeShift.credit_sales || 0;
        const totalSales = activeShift.total_sales || (cashSales + visaSales + instapaySales + creditSales);
        const debtCollections = activeShift.debt_collections || 0;
        const pettyExpenses = activeShift.petty_expenses || 0;

        const calculatedExpected = propExpectedCash !== undefined
          ? propExpectedCash
          : (openingCash + cashSales + debtCollections - pettyExpenses);

        const calculatedActual = propActualCash !== undefined
          ? propActualCash
          : (activeShift.actual_cash !== undefined ? activeShift.actual_cash : calculatedExpected);

        const calculatedDiff = propDiscrepancy !== undefined
          ? propDiscrepancy
          : (calculatedActual - calculatedExpected);

        const openedTime = activeShift.opened_at
          ? new Date(activeShift.opened_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
          : '-';
        const closedTime = activeShift.closed_at
          ? (() => {
              const d = new Date(activeShift.closed_at);
              return Number.isNaN(d.getTime())
                ? String(activeShift.closed_at)
                : d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
            })()
          : new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        const dateStr = new Date().toLocaleDateString('ar-EG');

        const purchasesTotal = (fullAudit.purchases || []).reduce(
          (sum, p) => sum + (Number(p.net_total) || 0), 0
        );
        const supplierReturns = (fullAudit.returns || []).filter((r) => r.kind !== 'DISPOSAL');
        const disposals = (fullAudit.returns || []).filter((r) => r.kind === 'DISPOSAL');
        const supplierReturnsTotal = supplierReturns.reduce(
          (sum, r) => sum + (Number(r.amount) || 0), 0
        );
        const disposalsTotal = disposals.reduce(
          (sum, r) => sum + (Number(r.amount) || 0), 0
        );
        const expensesTotal = (fullAudit.expenses || []).reduce(
          (sum, e) => sum + (Number(e.amount) || 0), 0
        );

        // Build Comprehensive Text Report (also used as QR payload)
        const textLines = [
          `تقرير تقفيل وردية - ${pharmacyName}`,
          `الوردية: #${activeShift.id}`,
          `الكاشير: ${activeShift.cashier_name || 'الكاشير'}`,
          `التاريخ: ${dateStr} | فتح: ${openedTime} | قفل: ${closedTime}`,
          `──────────────`,
          `[ المبيعات ]`,
          `كاش: ${cashSales.toFixed(2)} | فيزا: ${visaSales.toFixed(2)}`,
          `إنستاباي: ${instapaySales.toFixed(2)} | آجل: ${creditSales.toFixed(2)}`,
          `إجمالي المبيعات: ${totalSales.toFixed(2)} ج.م`,
          `عدد الفواتير: ${(fullAudit.invoices || []).length}`,
          `تحصيل ديون: ${debtCollections.toFixed(2)} ج.م`,
          `──────────────`,
          `[ جرد النقدية ]`,
          `عهدة البداية: ${openingCash.toFixed(2)} ج.م`,
          `المتوقع بالدرج: ${calculatedExpected.toFixed(2)} ج.م`,
          `الفعلي المسلّم: ${calculatedActual.toFixed(2)} ج.م`,
          `الفرق: ${calculatedDiff >= 0 ? '+' : ''}${calculatedDiff.toFixed(2)} ج.م (${calculatedDiff === 0 ? 'مطابق' : calculatedDiff > 0 ? 'زيادة' : 'عجز'})`,
          `المصروفات: ${pettyExpenses.toFixed(2)} ج.م (${(fullAudit.expenses || []).length} بند)`,
          `──────────────`,
          `[ التوريد من الموردين ]`,
          `الفواتير: ${(fullAudit.purchases || []).length} | الصافي: ${purchasesTotal.toFixed(2)} ج.م`
        ];
        (fullAudit.purchases || []).slice(0, 5).forEach((p) => {
          textLines.push(`• ${p.supplier_name || 'مورد'} (#${p.supplier_invoice_no || p.id}): ${Number(p.net_total || 0).toFixed(2)} ج.م`);
        });
        textLines.push(`──────────────`, `[ المرتجعات والإتلاف ]`);
        textLines.push(`مرتجع موردين: ${supplierReturns.length} (${supplierReturnsTotal.toFixed(2)} ج.م)`);
        supplierReturns.slice(0, 5).forEach((r) => {
          textLines.push(`• ${r.supplier_name || 'مورد'}: ${Number(r.amount || 0).toFixed(2)} ج.م`);
        });
        textLines.push(`إتلاف: ${disposals.length} (${disposalsTotal.toFixed(2)} ج.م)`);

        // Sold items (top sellers, compact)
        if (fullAudit.soldItems && fullAudit.soldItems.length > 0) {
          textLines.push(`──────────────`, `[ الأصناف المباعة (${fullAudit.soldItems.length}) ]`);
          fullAudit.soldItems.slice(0, 12).forEach((item) => {
            textLines.push(
              `• ${item.trade_name_ar || item.trade_name} × ${item.total_qty} = ${Number(item.total_amount || 0).toFixed(0)} ج.م`
            );
          });
          if (fullAudit.soldItems.length > 12) {
            textLines.push(`+ ${fullAudit.soldItems.length - 12} صنف آخر`);
          }
        }

        textLines.push(`──────────────`, `تم الفحص والاعتماد بنجاح.`);

        const completeReport = textLines.join('\n');
        setReportText(completeReport);

        // Compact payload for the QR (phone cameras show it as readable text).
        // Kept short so the QR stays low-density and easy to scan from a screen
        // or a printed 80mm receipt, while still covering every activity type.
        const shortName = (name) => {
          const value = String(name || '').trim();
          return value.length > 38 ? `${value.slice(0, 38)}…` : value;
        };
        const qrLines = [
          `${pharmacyName}`,
          `وردية #${activeShift.id} - ${activeShift.cashier_name || 'الكاشير'}`,
          `فتح: ${openedTime} | قفل: ${closedTime}`,
          `مبيعات: ${totalSales.toFixed(2)} (كاش ${cashSales.toFixed(2)} / فيزا ${visaSales.toFixed(2)} / إنستاباي ${instapaySales.toFixed(2)} / آجل ${creditSales.toFixed(2)})`,
          `فواتير بيع: ${(fullAudit.invoices || []).length} | تحصيل ديون: ${debtCollections.toFixed(2)}`,
          `درج: عهدة ${openingCash.toFixed(2)} | متوقع ${calculatedExpected.toFixed(2)} | فعلي ${calculatedActual.toFixed(2)} | فرق ${calculatedDiff >= 0 ? '+' : ''}${calculatedDiff.toFixed(2)}`,
          `مصروفات: ${expensesTotal.toFixed(2)} (${(fullAudit.expenses || []).length})`,
          `توريد: ${(fullAudit.purchases || []).length} فاتورة (${purchasesTotal.toFixed(2)})`
        ];
        (fullAudit.purchases || []).slice(0, 4).forEach((p) => {
          qrLines.push(`- ${shortName(p.supplier_name)}: ${Number(p.net_total || 0).toFixed(2)}`);
        });
        qrLines.push(
          `مرتجع موردين: ${supplierReturns.length} (${supplierReturnsTotal.toFixed(2)}) | إتلاف: ${disposals.length} (${disposalsTotal.toFixed(2)})`
        );
        if ((fullAudit.soldItems || []).length > 0) {
          qrLines.push(`أصناف مباعة (${fullAudit.soldItems.length}):`);
          (fullAudit.soldItems || []).slice(0, 6).forEach((item) => {
            qrLines.push(`- ${shortName(item.trade_name_ar || item.trade_name)} × ${item.total_qty} = ${Number(item.total_amount || 0).toFixed(0)}`);
          });
          if (fullAudit.soldItems.length > 6) {
            qrLines.push(`+ ${fullAudit.soldItems.length - 6} صنف آخر`);
          }
        }

        // Self-contained Offline QR Report Payload (NO WI-FI, NO INTERNET, NO LOCAL NETWORK)
        // Works anywhere simply by pointing any mobile camera or scanner at the screen.
        const outOfStockItems = fullAudit.outOfStock || [];
        const qrReportLines = [
          `📊 ملخص تقفيل الوردية - ${pharmacyName}`,
          `الوردية: #${activeShift.id} | الكاشير: ${activeShift.cashier_name || 'الكاشير'}`,
          `فتح: ${openedTime} | قفل: ${closedTime} (${dateStr})`,
          `────────────────────────`,
          `💰 [ المبيعات والتحصيل ]`,
          `• كاش: ${cashSales.toFixed(2)} ج.م`,
          `• فيزا: ${visaSales.toFixed(2)} | إنستاباي: ${instapaySales.toFixed(2)}`,
          `• آجل: ${creditSales.toFixed(2)} | ديون: ${debtCollections.toFixed(2)}`,
          `• الإجمالي: ${totalSales.toFixed(2)} ج.م (فواتير: ${(fullAudit.invoices || []).length})`,
          `────────────────────────`,
          `💵 [ جرد درج النقدية ]`,
          `• عهدة البداية: ${openingCash.toFixed(2)} ج.م`,
          `• المتوقع بالدرج: ${calculatedExpected.toFixed(2)} ج.م`,
          `• الفعلي المسلّم: ${calculatedActual.toFixed(2)} ج.م`,
          `• الفرق: ${calculatedDiff >= 0 ? '+' : ''}${calculatedDiff.toFixed(2)} ج.م (${calculatedDiff === 0 ? 'مطابق' : calculatedDiff > 0 ? 'زيادة' : 'عجز'})`,
          `• مصروفات نثريات: ${pettyExpenses.toFixed(2)} ج.م`,
          `────────────────────────`,
          `📦 [ التوريد والمرتجعات ]`,
          `• فواتير توريد: ${(fullAudit.purchases || []).length} (${purchasesTotal.toFixed(2)} ج.م)`,
          `• مرتجع موردين: ${supplierReturns.length} (${supplierReturnsTotal.toFixed(2)} ج.م)`,
          `• توالف وإتلاف: ${disposals.length} (${disposalsTotal.toFixed(2)} ج.م)`
        ];

        // Top Sold Items (compact)
        if (fullAudit.soldItems && fullAudit.soldItems.length > 0) {
          qrReportLines.push(`────────────────────────`, `💊 [ أهم الأصناف المباعة (${fullAudit.soldItems.length}) ]`);
          fullAudit.soldItems.slice(0, 10).forEach((item) => {
            qrReportLines.push(`• ${shortName(item.trade_name_ar || item.trade_name)} × ${item.total_qty} = ${Number(item.total_amount || 0).toFixed(0)}`);
          });
          if (fullAudit.soldItems.length > 10) {
            qrReportLines.push(`+ ${fullAudit.soldItems.length - 10} صنف آخر`);
          }
        }

        // Out of Stock (Shortages Alert)
        if (outOfStockItems.length > 0) {
          qrReportLines.push(`────────────────────────`, `🚨 [ نواقص - أصناف رصيدها صفر (${outOfStockItems.length}) ]`);
          outOfStockItems.slice(0, 8).forEach((item) => {
            qrReportLines.push(`• ${shortName(item.trade_name_ar || item.trade_name)} (0 ع)`);
          });
          if (outOfStockItems.length > 8) {
            qrReportLines.push(`+ ${outOfStockItems.length - 8} صنف ناقص آخر`);
          }
        }

        qrReportLines.push(`────────────────────────`, `تم اعتماد وتقفيل الوردية.`);

        const qrTextPayload = qrReportLines.join('\n');
        setReportText(completeReport);

        if (isCurrent) {
          setQrMode('TEXT');
        }

        const qrOptions = {
          width: 540,
          margin: 2,
          color: { dark: '#0B1220', light: '#FFFFFF' },
          errorCorrectionLevel: 'L' // Maximum data capacity for high density text
        };

        let url = '';
        try {
          url = await QRCode.toDataURL(qrTextPayload, qrOptions);
        } catch (qrErr) {
          console.warn('Full text QR too large, generating compact summary:', qrErr);
          const compactSummary = [
            `تقرير وردية - ${pharmacyName}`,
            `#${activeShift.id} - ${activeShift.cashier_name || 'الكاشير'}`,
            `مبيعات: ${totalSales.toFixed(2)} (كاش ${cashSales.toFixed(2)} / آجل ${creditSales.toFixed(2)})`,
            `فواتير: ${(fullAudit.invoices || []).length} | مصروفات: ${pettyExpenses.toFixed(2)}`,
            `عهدة: ${openingCash.toFixed(2)} | متوقع: ${calculatedExpected.toFixed(2)} | فعلي: ${calculatedActual.toFixed(2)}`,
            `فرق الدرج: ${calculatedDiff >= 0 ? '+' : ''}${calculatedDiff.toFixed(2)} (${calculatedDiff === 0 ? 'مطابق' : calculatedDiff > 0 ? 'زيادة' : 'عجز'})`,
            `توريد: ${(fullAudit.purchases || []).length} (${purchasesTotal.toFixed(2)}) | مرتجع: ${supplierReturns.length}`,
            `توالف: ${disposals.length} | نواقص: ${outOfStockItems.length} صنف`
          ].join('\n');
          url = await QRCode.toDataURL(compactSummary, qrOptions);
        }
        if (isCurrent) setQrDataUrl(url);
      } catch (err) {
        console.warn('Error generating shift audit QR:', err);
      }
    };

    fetchAudit();
    return () => { isCurrent = false; };
  }, [activeShift, propExpectedCash, propActualCash, propDiscrepancy, pharmacyName]);

  if (!isOpen || !activeShift) return null;

  const {
    id,
    cashier_name = 'الكاشير',
    opened_at,
    opening_cash = 0,
    cash_sales = 0,
    visa_sales = 0,
    instapay_sales = 0,
    credit_sales = 0,
    total_sales = 0,
    debt_collections = 0,
    petty_expenses = 0,
    status
  } = activeShift;

  const openingCash = opening_cash || 0;
  const cashSales = cash_sales || 0;
  const visaSales = visa_sales || 0;
  const instapaySales = instapay_sales || 0;
  const creditSales = credit_sales || 0;
  const totalSales = total_sales || (cashSales + visaSales + instapaySales + creditSales);
  const debtCollections = debt_collections || 0;
  const pettyExpenses = petty_expenses || 0;

  const expectedCash = propExpectedCash !== undefined
    ? propExpectedCash
    : (openingCash + cashSales + debtCollections - pettyExpenses);

  const actualCash = propActualCash !== undefined
    ? propActualCash
    : (activeShift.actual_cash !== undefined ? activeShift.actual_cash : expectedCash);

  const currentDiscrepancy = propDiscrepancy !== undefined
    ? propDiscrepancy
    : (actualCash - expectedCash);

  const isAlreadyClosed = status === 'CLOSED';

  const handleCopyReport = async () => {
    const payload = reportUrl || reportText;
    if (!payload) return;
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
        copied = true;
      }
    } catch (e) {
      copied = false;
    }
    if (!copied) {
      try {
        const ta = document.createElement('textarea');
        ta.value = payload;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        copied = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (e) {
        copied = false;
      }
    }
    if (copied) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleCopyDaily = async () => {
    if (!dailyUrl) return;
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(dailyUrl);
        ok = true;
      }
    } catch (e) {
      ok = false;
    }
    if (ok) {
      setCopiedDaily(true);
      setTimeout(() => setCopiedDaily(false), 2500);
    }
  };

  const handleWhatsAppShare = () => {
    if (reportUrl) {
      const message = `تقرير وردية #${id} - ${cashier_name}\n${reportUrl}`;
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, '_blank');
      return;
    }
    if (!reportText) return;
    const encoded = encodeURIComponent(reportText);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
  };

  const handleOpenReport = async () => {
    let target = reportUrl;
    try {
      await initReportServer();
      if (!target) {
        let pharmacyId = 'PHARMACY-LOCAL';
        try {
          const savedSettings = JSON.parse(localStorage.getItem('PHARMACY_SETTINGS') || '{}') || {};
          pharmacyId = savedSettings.cloudPharmacyId || 'PHARMACY-LOCAL';
        } catch (e) {}
        target = buildShiftReportUrl(id, pharmacyId);
      }
      if (target) {
        // Push the latest operations before opening so the page is complete.
        await Promise.race([
          (async () => {
            await sqliteService.backfillReportSnapshot().catch(() => {});
            await sqliteService.resendShiftToReportServer(id).catch(() => {});
          })(),
          new Promise((resolve) => setTimeout(resolve, 5000))
        ]);
      }
    } catch (e) {}
    if (target) window.open(target, '_blank');
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExecuteClose = () => {
    if (!onConfirmAction) {
      onClose();
      return;
    }
    setIsClosing(true);
    playCashDrawerSound();
    setTimeout(async () => {
      try {
        await onConfirmAction({
          ...activeShift,
          actual_cash: actualCash,
          expected_cash: expectedCash,
          discrepancy: currentDiscrepancy,
          closed_at: new Date().toISOString()
        });
        // Only close the modal after the shift was really persisted.
        onClose();
      } catch (e) {
        // The parent shows the error toast; keep the modal open for a retry.
      } finally {
        setIsClosing(false);
      }
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 backdrop-blur-sm animate-fadeIn font-cairo select-none">
      <div className="bg-[#111A2B] border border-[#23324D] rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col overflow-hidden max-h-[94vh]">
        
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#23324D] bg-[#17233A]/80 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center shadow-glow-teal">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                {isAlreadyClosed ? 'سجل وتفاصيل الوردية والباركود' : 'تقفيل الوردية وجرد النقدية واستخراج الباركود'}
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 font-mono font-bold">
                  #{id}
                </span>
                {isAlreadyClosed && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 font-medium">
                    مغلقة ومؤرشفة
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">
                الكاشير: <span className="text-teal-300 font-bold">{cashier_name}</span> | الباركود الذكي يشمل جميع الأصناف والمبيعات وفواتير التوريد
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-[#23324D] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#23324D] bg-[#0B1220] px-6 py-2.5 gap-2 overflow-x-auto print:hidden">
          <button
            type="button"
            onClick={() => setActiveTab('QR')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'QR'
                ? 'bg-emerald-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-white hover:bg-[#17233A]'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>باركود QR لمسح الموبايل 📱</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('SALES_ITEMS')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'SALES_ITEMS'
                ? 'bg-teal-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-white hover:bg-[#17233A]'
            }`}
          >
            <PackageCheck className="w-4 h-4" />
            <span>الأصناف المباعة ({auditData.soldItems.length}) 💊</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('PURCHASES')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'PURCHASES'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-white hover:bg-[#17233A]'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>فواتير التوريد المدخلة ({auditData.purchases.length}) 📦</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('PRINT')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'PRINT'
                ? 'bg-slate-700 text-white shadow-lg'
                : 'text-slate-400 hover:text-white hover:bg-[#17233A]'
            }`}
          >
            <Printer className="w-4 h-4" />
            <span>إيصال Z-Report حراري (80mm) 🖨️</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 bg-[#0F172A]/50">
          
          {/* TAB 1: QR Code & Mobile Scan */}
          {activeTab === 'QR' && (
            <div className="flex flex-col md:flex-row items-center gap-6 justify-center">
              
              {/* QR Box: Fully Self-Contained Offline Data QR */}
              <div className="flex flex-col items-center gap-4 shrink-0">
                <div className="bg-white p-5 rounded-3xl shadow-2xl text-center border-4 border-emerald-500/80 flex flex-col items-center shrink-0">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="Shift Barcode QR"
                      className="w-72 h-72 object-contain rounded-xl"
                    />
                  ) : (
                    <div className="w-72 h-72 flex items-center justify-center text-slate-400 font-bold">
                      جاري توليد الباركود...
                    </div>
                  )}
                  <div className="mt-3 text-slate-900 font-mono font-bold text-xs bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-300 w-full">
                    وردية #{id} • مبيعات: {totalSales.toFixed(0)} ج.م • فعلي: {actualCash.toFixed(0)} ج.م
                  </div>
                  <div className="mt-2 w-full px-3 py-1.5 rounded-xl text-[10px] font-bold border bg-emerald-50 text-emerald-800 border-emerald-200">
                    📷 مسح فوري بكاميرا الموبايل — بدون إنترنت وبدون واي فاي نهائياً
                  </div>
                </div>
              </div>

              {/* Actions & Summary Box */}
              <div className="flex-1 space-y-4 max-w-md w-full">
                <div className="bg-[#17233A] border border-[#23324D] p-4 rounded-2xl space-y-3">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                    <Smartphone className="w-5 h-5" />
                    <span>مسح مباشر بكاميرا الموبايل (أوفلاين 100%)</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    وجّه كاميرا أي هاتف على الباركود وسيظهر لك التقرير الشامل مباشرة على شاشة الموبايل بدون اتصال بالإنترنت أو راوتر أو واي فاي نهائياً.
                  </p>

                  <div className="p-3 bg-[#0B1220] rounded-xl border border-[#23324D] text-xs text-slate-300 space-y-1.5 font-mono">
                    <div className="text-emerald-400 font-bold flex items-center gap-1.5 font-cairo text-xs mb-1">
                      <span>✓ يشمل الباركود:</span>
                    </div>
                    <div>• مبيعات كاش وفيزا وآجل وفواتير البيع</div>
                    <div>• جرد الدرج: عهدة، متوقع، فعلي، عجز/زيادة</div>
                    <div>• فواتير التوريد، المرتجع، التوالف، والمصروفات</div>
                    <div>• قائمة أهم الأصناف المباعة والنواقص</div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-[#23324D]">
                    <div className="bg-[#111A2B] p-2.5 rounded-xl border border-[#23324D]">
                      <span className="text-slate-400 block text-[11px]">الكاشير المسؤول</span>
                      <span className="text-white font-bold">{cashier_name}</span>
                    </div>
                    <div className="bg-[#111A2B] p-2.5 rounded-xl border border-[#23324D]">
                      <span className="text-slate-400 block text-[11px]">عهدة البداية</span>
                      <span className="text-teal-300 font-bold font-mono">{openingCash.toFixed(2)} ج.م</span>
                    </div>
                    <div className="bg-[#111A2B] p-2.5 rounded-xl border border-[#23324D]">
                      <span className="text-slate-400 block text-[11px]">إجمالي المبيعات</span>
                      <span className="text-emerald-400 font-bold font-mono">{totalSales.toFixed(2)} ج.م</span>
                    </div>
                    <div className="bg-[#111A2B] p-2.5 rounded-xl border border-[#23324D]">
                      <span className="text-slate-400 block text-[11px]">فرق الجرد (عجز/زيادة)</span>
                      <span className={`font-bold font-mono ${currentDiscrepancy === 0 ? 'text-emerald-400' : currentDiscrepancy > 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                        {currentDiscrepancy === 0 ? '🟢 مطابق' : `${currentDiscrepancy > 0 ? '+' : ''}${currentDiscrepancy.toFixed(2)} ج.م`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Instant Share Buttons */}
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCopyReport}
                      className="flex-1 py-3 px-4 rounded-xl bg-[#17233A] hover:bg-[#202E4C] border border-[#23324D] text-slate-200 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 shadow-md"
                    >
                      <Copy className="w-4 h-4 text-teal-400" />
                      <span>{copied ? 'تم نسخ التقرير كاملاً ✓' : '📋 نسخ نص التقرير'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleWhatsAppShare}
                      className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 shadow-lg shadow-emerald-900/30"
                    >
                      <Share2 className="w-4 h-4 text-white" />
                      <span>إرسال واتساب للمالك 💬</span>
                    </button>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: Sold Medicines Detailed Table */}
          {activeTab === 'SALES_ITEMS' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  <PackageCheck className="w-4 h-4 text-teal-400" />
                  <span>جميع الأدوية والأصناف المباعة خلال الوردية ({auditData.soldItems.length} صنف)</span>
                </div>
                <div className="text-xs text-slate-400">
                  إجمالي مبيعات الأصناف: <span className="font-bold text-emerald-400 font-mono">{totalSales.toFixed(2)} ج.م</span>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-[#23324D] bg-[#111A2B]">
                <table className="w-full text-right text-xs">
                  <thead className="bg-[#17233A] text-slate-400 font-bold border-b border-[#23324D]">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">اسم الصنف</th>
                      <th className="p-3 text-center">نوع الوحدة</th>
                      <th className="p-3 text-center">الكمية المباعة</th>
                      <th className="p-3 text-center">سعر البيع</th>
                      <th className="p-3 text-left">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#23324D]/60 font-medium text-slate-300">
                    {auditData.soldItems.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="text-center py-8 text-slate-500">
                          لم يتم تسجيل مبيعات أصناف في هذه الوردية حتى الآن.
                        </td>
                      </tr>
                    ) : (
                      auditData.soldItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-[#17233A]/50 transition-colors">
                          <td className="p-3 font-mono text-slate-500">{idx + 1}</td>
                          <td className="p-3 font-bold text-white">
                            <div>{item.trade_name_ar || item.trade_name}</div>
                            {item.trade_name && item.trade_name !== item.trade_name_ar && (
                              <div className="text-[10px] text-slate-400 font-mono">{item.trade_name}</div>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${item.is_strip ? 'bg-amber-500/20 text-amber-300' : 'bg-teal-500/20 text-teal-300'}`}>
                              {item.is_strip ? 'شريط' : 'علبة كاملة'}
                            </span>
                          </td>
                          <td className="p-3 text-center font-bold font-mono text-white text-sm">
                            {item.total_qty}
                          </td>
                          <td className="p-3 text-center font-mono">
                            {item.unit_price?.toFixed(2)} ج.م
                          </td>
                          <td className="p-3 text-left font-bold font-mono text-emerald-400">
                            {item.total_amount?.toFixed(2)} ج.م
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: Purchases / Supply Invoices Table */}
          {activeTab === 'PURCHASES' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  <Truck className="w-4 h-4 text-blue-400" />
                  <span>فواتير الشراء والتوريد المدخلة خلال الوردية ({auditData.purchases.length} فاتورة)</span>
                </div>
              </div>

              {auditData.purchases.length === 0 ? (
                <div className="p-8 text-center text-slate-400 bg-[#111A2B] rounded-2xl border border-[#23324D]">
                  <Truck className="w-10 h-10 text-slate-600 mx-auto mb-2 opacity-50" />
                  <p className="font-bold">لم يتم إدخال فواتير توريد خلال هذه الوردية.</p>
                  <p className="text-xs text-slate-500 mt-1">أي فاتورة شراء يتم إدخالها من شاشة المشتريات تظهر هنا فورياً مع أصنافها.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {auditData.purchases.map((pur, idx) => (
                    <div key={idx} className="bg-[#111A2B] border border-[#23324D] rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between border-b border-[#23324D] pb-3">
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center text-xs">
                            {idx + 1}
                          </span>
                          <div>
                            <span className="font-bold text-white text-sm">{pur.supplier_name}</span>
                            <span className="text-slate-400 text-xs block font-mono">
                              فاتورة مورد: {pur.supplier_invoice_no || pur.id} • طريقة السداد: {pur.payment_method || 'آجل'}
                            </span>
                          </div>
                        </div>
                        <div className="text-left font-mono">
                          <span className="text-slate-400 text-xs block">صافي الفاتورة</span>
                          <span className="text-blue-400 font-bold text-base">{pur.net_total?.toFixed(2)} ج.م</span>
                        </div>
                      </div>

                      {/* Line items */}
                      {pur.items && pur.items.length > 0 && (
                        <div className="bg-[#0B1220] rounded-xl p-3 border border-[#23324D]/60 space-y-1 text-xs">
                          <div className="text-[11px] font-bold text-slate-400 mb-1">الأصناف المدخلة بالفاتورة:</div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {pur.items.map((pi, pidx) => (
                              <div key={pidx} className="flex justify-between items-center bg-[#17233A]/60 px-2.5 py-1.5 rounded-lg border border-[#23324D]">
                                <span className="font-medium text-white truncate max-w-[180px]">{pi.trade_name_ar || pi.trade_name}</span>
                                <span className="font-mono text-teal-300 font-bold">{pi.quantity} علبة × {pi.price_box} ج.م</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: 80mm Printable Z-Report Paper */}
          {activeTab === 'PRINT' && (
            <div className="flex flex-col items-center">
              <div
                id="printable-z-report"
                className="w-80 bg-white text-slate-900 rounded-lg p-5 font-mono text-[11px] shadow-2xl border border-slate-300 text-center space-y-2 select-text"
              >
                {/* Header */}
                <div className="border-b-2 border-slate-900 pb-2">
                  <div className="font-black text-sm">{pharmacyName}</div>
                  <div className="text-[10px] font-bold text-slate-700">تقرير إغلاق الوردية اليومي (Z-REPORT)</div>
                  <div className="text-[9px] text-slate-600 mt-1">
                    رقم الوردية: <span className="font-bold text-slate-900">#{id}</span>
                  </div>
                  <div className="text-[9px] text-slate-600">الكاشير المسؤول: {cashier_name}</div>
                  <div className="text-[9px] text-slate-500">
                    وقت الفتح: {activeShift.opened_at ? new Date(activeShift.opened_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '-'}
                  </div>
                </div>

                {/* Sales Breakdown */}
                <div className="py-2 space-y-1 text-right border-b border-dashed border-slate-400 text-[10px]">
                  <div className="font-bold text-center text-slate-800 text-[11px] mb-1">=== ملخص المبيعات ===</div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">مبيعات الكاش (نقدي):</span>
                    <span className="font-bold">{cashSales.toFixed(2)} ج.م</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">مبيعات البطاقات (فيزا):</span>
                    <span className="font-bold">{visaSales.toFixed(2)} ج.م</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">مبيعات إلكترونية (إنستاباي):</span>
                    <span className="font-bold">{instapaySales.toFixed(2)} ج.م</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">مبيعات آجلة (حساب عملاء):</span>
                    <span className="font-bold">{creditSales.toFixed(2)} ج.م</span>
                  </div>
                  <div className="flex justify-between font-black text-xs pt-1 border-t border-slate-200 text-slate-900">
                    <span>إجمالي المبيعات المحققة:</span>
                    <span>{totalSales.toFixed(2)} ج.م</span>
                  </div>
                </div>

                {/* Cash Drawer Audit */}
                <div className="py-2 space-y-1 text-right border-b border-dashed border-slate-400 text-[10px]">
                  <div className="font-bold text-center text-slate-800 text-[11px] mb-1">=== جرد النقدية بالدرج ===</div>
                  <div className="flex justify-between text-slate-600">
                    <span>(+) عهدة بداية الوردية:</span>
                    <span>{openingCash.toFixed(2)} ج.م</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>(+) نقدية مبيعات الكاش:</span>
                    <span>{cashSales.toFixed(2)} ج.م</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>(+) تحصيل ديون عملاء:</span>
                    <span>{debtCollections.toFixed(2)} ج.م</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>(-) المصروفات النثرية:</span>
                    <span className="text-red-700">-{pettyExpenses.toFixed(2)} ج.م</span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-900 pt-1 border-t border-slate-200">
                    <span>(=) النقدية المتوقعة بالدرج:</span>
                    <span>{expectedCash.toFixed(2)} ج.م</span>
                  </div>
                  <div className="flex justify-between font-black text-xs bg-slate-100 p-1 rounded">
                    <span>(✓) النقدية الفعلية بالجرد:</span>
                    <span>{actualCash.toFixed(2)} ج.م</span>
                  </div>

                  {/* Discrepancy */}
                  <div className="flex justify-between font-black text-xs pt-1">
                    <span>فرق الجرد (عجز / زيادة):</span>
                    {currentDiscrepancy === 0 ? (
                      <span className="text-emerald-700">متطابق (0.00 ج.م)</span>
                    ) : currentDiscrepancy > 0 ? (
                      <span className="text-amber-700 font-bold">زيادة (+{currentDiscrepancy.toFixed(2)} ج.م)</span>
                    ) : (
                      <span className="text-red-700 font-bold">عجز ({currentDiscrepancy.toFixed(2)} ج.م)</span>
                    )}
                  </div>
                </div>

                {/* Real Dynamic QR Code Printed on Receipt */}
                <div className="py-2 text-center border-b border-dashed border-slate-400 flex flex-col items-center">
                  <div className="text-[9px] text-slate-600 mb-1 font-bold">امسح الكود بالموبايل للاطلاع على التقرير الكامل</div>
                  {qrDataUrl && (
                    <img src={qrDataUrl} alt="Z-Report QR Code" className="w-28 h-28 object-contain mx-auto" />
                  )}
                  {qrMode === 'URL' && (
                    <div className="text-[7px] text-slate-500 mt-1 leading-tight text-center">
                      * افتح الرابط من موبايل متصل بنفس شبكة الواي فاي للاطلاع على الصفحة الكاملة
                    </div>
                  )}
                </div>

                {/* Signatures */}
                <div className="pt-2 text-[9px] text-slate-600 space-y-2">
                  <div className="flex justify-between px-2">
                    <span>توقيع الكاشير: .................</span>
                    <span>توقيع المدير: .................</span>
                  </div>
                  <div className="text-[8px] text-slate-400">
                    تم أخذ نسخة احتياطية محلية وسحابية لقاعدة البيانات.
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handlePrint}
                className="mt-4 px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة الإيصال الحراري الآن</span>
              </button>
            </div>
          )}

        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-4 border-t border-[#23324D] bg-[#17233A]/80 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2.5 rounded-xl bg-[#111A2B] hover:bg-[#202E4C] border border-[#23324D] text-slate-200 text-xs font-bold flex items-center gap-2 transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4 text-teal-400" />
              <span>طباعة إيصال Z-Report</span>
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-[#111A2B] hover:bg-[#202E4C] text-slate-300 text-xs font-bold transition-all cursor-pointer border border-[#23324D]"
            >
              إلغاء / إغلاق
            </button>

            {!isAlreadyClosed && onConfirmAction && (
              <button
                type="button"
                onClick={handleExecuteClose}
                disabled={isClosing}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white text-xs font-bold shadow-lg flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isClosing ? 'جاري تقفيل الوردية...' : 'تأكيد وإغلاق الوردية رسمياً'}</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}