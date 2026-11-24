import React, { useState, useEffect, useRef } from 'react';
import { Minus, Square, X, Clock, Calendar, CheckCircle2, Wifi, WifiOff, Cloud, RefreshCw, Sparkles, Sun, Moon, ZoomIn, ZoomOut } from 'lucide-react';
import { useThemeAndFontSize } from '../utils/useThemeAndFontSize';
import { sqliteService } from '../db/sqliteService';
import { getPharmacyName, getPharmacyBranch, PHARMACY_IDENTITY_EVENT } from '../utils/pharmacyIdentity';

// Injected at build time from package.json so the header can never drift from
// the real release version again.
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.4.18';

/**
 * Isolated live clock. Keeping the 1-second tick inside this component means
 * the whole header (branding, license, sync, window controls) is not
 * re-rendered every second on low-end pharmacy PCs.
 */
function LiveClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const time = now.toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
  const date = now.toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div className="flex items-center gap-2.5 bg-[#17233A] border border-[#23324D] px-3.5 py-1.5 rounded-xl shadow-inner">
      <Clock className="w-4 h-4 text-teal-400" />
      <span className="font-bold text-white text-sm font-mono tracking-wider min-w-[90px] text-center" dir="ltr">
        {time}
      </span>
      <span className="text-slate-500 text-xs hidden xl:inline">|</span>
      <Calendar className="w-3.5 h-3.5 text-slate-400 hidden xl:block" />
      <span className="text-xs text-slate-300 font-medium hidden xl:inline">{date}</span>
    </div>
  );
}

export function TopHeader({
  pharmacyName = getPharmacyName(),
  shiftNumber = 1,
  isShiftOpen = true,
  licenseInfo = null,
  onOpenActivation = null
}) {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncText, setLastSyncText] = useState('الآن');
  const [syncToast, setSyncToast] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const [cloudPendingCount, setCloudPendingCount] = useState(0);
  const [cloudConfigured, setCloudConfigured] = useState(false);
  const syncBusyRef = useRef(false);
  const { theme, fontSize, toggleTheme, increaseFontSize, decreaseFontSize } = useThemeAndFontSize();
  // Branch name is read from the saved settings, but kept in state so saving
  // the identity from Settings updates this header immediately (no reload).
  const [identity, setIdentity] = useState(() => ({
    name: getPharmacyName(),
    branch: getPharmacyBranch()
  }));

  useEffect(() => {
    const syncIdentity = () => {
      setIdentity({ name: getPharmacyName(), branch: getPharmacyBranch() });
    };
    window.addEventListener(PHARMACY_IDENTITY_EVENT, syncIdentity);
    // `storage` fires in OTHER tabs, so two open windows stay consistent too.
    window.addEventListener('storage', syncIdentity);
    return () => {
      window.removeEventListener(PHARMACY_IDENTITY_EVENT, syncIdentity);
      window.removeEventListener('storage', syncIdentity);
    };
  }, []);

  const displayName = String(pharmacyName || '').trim() || identity.name;
  const branchName = identity.branch;

  const triggerToast = (msg) => {
    setSyncToast(msg);
    setTimeout(() => setSyncToast(''), 4000);
  };

  const refreshSyncStatus = async () => {
    try {
      const status = await sqliteService.getSyncStatus();
      setPendingCount(status.pending || 0);
      setCloudPendingCount(status.cloudPending || 0);
      setCloudConfigured(!!status.endpointConfigured);
      if (status.lastSyncedAt) {
        const d = new Date(status.lastSyncedAt);
        if (!Number.isNaN(d.getTime())) {
          setLastSyncText(d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }));
        }
      }
    } catch (e) {}
  };

  useEffect(() => {
    refreshSyncStatus();
    const timer = setInterval(async () => {
      try {
        const status = await sqliteService.getSyncStatus();
        setPendingCount(status.pending || 0);
        setCloudPendingCount(status.cloudPending || 0);
        setCloudConfigured(!!status.endpointConfigured);
        // Auto-retry the outbox: works after a cold start while offline,
        // and keeps retrying failed uploads once connectivity returns.
        if (status.online && (status.pending > 0 || status.cloudPending > 0) && !syncBusyRef.current) {
          syncBusyRef.current = true;
          try {
            await sqliteService.triggerAutoSync();
          } catch (e) {
          } finally {
            syncBusyRef.current = false;
            await refreshSyncStatus();
          }
        }
      } catch (e) {}
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Online / Offline & Auto-Sync Listeners
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      setIsSyncing(true);
      triggerToast('🟢 تم الاتصال بالإنترنت - جاري رفع كل العمليات المعلّقة...');
      try {
        const result = await sqliteService.triggerAutoSync();
        await refreshSyncStatus();
        if (result?.mode === 'CLOUD') {
          triggerToast(result.success
            ? (result.offline
              ? `💾 تم الرفع للسيرفر المحلي — ${result.cloudPending || 0} عملية بانتظار عودة الإنترنت للرفع السحابي`
              : `☁️ تم رفع ${result.uploaded} عملية إلى السحابة بنجاح`)
            : `⚠️ تعذر الرفع للسحابة (${result.error || 'خطأ اتصال'}) - البيانات محفوظة محلياً وسيُعاد المحاولة`);
        } else {
          triggerToast('💾 تم حفظ ومزامنة كل العمليات محلياً (لم يتم ضبط سيرفر سحابي)');
        }
      } catch (e) {
        console.warn('Sync error on online:', e);
        triggerToast('⚠️ تم حفظ البيانات محلياً وسيُعاد الرفع تلقائياً');
      } finally {
        setIsSyncing(false);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      triggerToast('🔴 وضع أوفلاين (بدون إنترنت) - النظام يعمل محلياً 100% وكل العمليات تُحفظ وتُرفع فور عودة الشبكة');
      refreshSyncStatus();
    };

    const handleSyncCompleted = () => {
      refreshSyncStatus();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('pharmacy:sync-completed', handleSyncCompleted);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('pharmacy:sync-completed', handleSyncCompleted);
    };
  }, []);

  const sendWindowCommand = (channel) => {
    try {
      if (typeof window !== 'undefined' && window.require) {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.send(channel);
      }
    } catch (e) {}
  };

  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    triggerToast(isOnline
      ? (cloudConfigured ? '🔄 جاري رفع العمليات المعلّقة للسحابة...' : '💾 جاري حفظ ومزامنة البيانات محلياً...')
      : '💾 جاري حفظ البيانات محلياً (سيتم الرفع فور عودة الإنترنت)...');
    try {
      const result = await sqliteService.triggerAutoSync();
      await refreshSyncStatus();
      if (result?.offline) {
        triggerToast(`📴 لا يوجد إنترنت - ${result.pending || 0} عملية محفوظة محلياً وستُرفع تلقائياً`);
      } else if (result?.mode === 'CLOUD') {
        triggerToast(result.success
          ? `☁️ تم رفع ${result.uploaded} عملية بنجاح`
          : `⚠️ فشل الرفع (${result.error || 'خطأ'}) - سيُعاد المحاولة تلقائياً`);
      } else {
        triggerToast('✅ تم حفظ ومزامنة البيانات محلياً بنجاح');
      }
    } catch (err) {
      triggerToast('⚠️ فشلت المزامنة، البيانات محفوظة محلياً');
    } finally {
      setIsSyncing(false);
    }
  };

  // License badge label derived from the real license state (not a fixed text)
  const licenseStatus = licenseInfo?.status || 'UNLICENSED';
  const isLicensed = !!licenseInfo?.isLicensed;
  let licenseLabel = 'نسخة رسمية مفعلة ✓';
  let licenseClasses = 'bg-teal-500/10 border-teal-500/30 text-teal-300';
  let licenseIconClass = 'text-teal-400';
  if (!isLicensed) {
    licenseLabel = licenseStatus === 'REVOKED' ? 'الترخيص ملغي 🚫' : 'الترخيص غير مفعل ⚠️';
    licenseClasses = 'bg-rose-500/10 border-rose-500/30 text-rose-300';
    licenseIconClass = 'text-rose-400';
  } else if (licenseStatus === 'TIMED' || licenseStatus === 'DURATION' || licenseStatus === 'ANNUAL') {
    licenseLabel = `مرخص حتى ${licenseInfo?.expiresAt || '—'}${licenseInfo?.daysRemaining != null ? ` (${licenseInfo.daysRemaining} يوم)` : ''}`;
    licenseClasses = 'bg-amber-500/10 border-amber-500/30 text-amber-300';
    licenseIconClass = 'text-amber-400';
  }

  return (
    <header className="h-14 w-full bg-[#111A2B] border-b border-[#23324D] px-4 flex items-center justify-between text-slate-200 select-none z-30 shrink-0 relative">
      
      {/* Toast Notification */}
      {syncToast && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-[#17233A] text-white border border-teal-500/40 px-4 py-2 rounded-xl shadow-2xl text-xs font-bold flex items-center gap-2 animate-fadeIn backdrop-blur-md">
          <Cloud className="w-4 h-4 text-teal-400 animate-pulse" />
          <span>{syncToast}</span>
        </div>
      )}

      {/* Right Section: Pharmacy Branding */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500/20 to-teal-500/5 border border-teal-500/30 flex items-center justify-center text-lg shadow-glow-teal">
          💊
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-white text-base tracking-tight">{displayName}</span>
            {branchName && (
              <span
                className="text-[10px] bg-teal-500/15 text-teal-300 border border-teal-500/30 font-semibold px-2 py-0.5 rounded-full hidden sm:inline max-w-[180px] truncate"
                title={branchName}
              >
                {branchName}
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400 font-medium hidden md:block">نظام نقاط البيع وإدارة الصيدليات v{APP_VERSION}</div>
        </div>
      </div>

      {/* Center Section: Live Clock, Date & Shift Status */}
      <div className="flex items-center gap-4">
        <LiveClock />

        {/* Shift Status Pill */}
        <div className="flex items-center gap-2 bg-[#17233A] border border-[#23324D] px-3 py-1.5 rounded-xl">
          <span className="relative flex h-2.5 w-2.5">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isShiftOpen ? 'bg-emerald-400 opacity-75' : 'bg-amber-400 opacity-75'}`}></span>
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isShiftOpen ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
          </span>
          <span className="text-xs font-bold text-white">
            {isShiftOpen ? `الوردية #${shiftNumber} مفتوحة` : 'الوردية مغلقة'}
          </span>
        </div>
      </div>

      {/* Left Section: Online/Offline Badge, License Badge & Controls */}
      <div className="flex items-center gap-2.5">
        
        {/* Official License Badge */}
        <button
          type="button"
          onClick={() => { if (typeof onOpenActivation === 'function') onOpenActivation(); }}
          title={licenseInfo?.licenseKey || 'إدارة الترخيص'}
          className={`flex items-center gap-1.5 border px-2.5 py-1 rounded-xl text-xs font-semibold transition-all hover:brightness-125 cursor-pointer ${licenseClasses}`}
        >
          <Sparkles className={`w-3.5 h-3.5 ${licenseIconClass}`} />
          <span>{licenseLabel}</span>
        </button>

        {/* Display Controls: Font Zoom & Theme Toggle */}
        <div className="flex items-center gap-1 border-r border-[#23324D] pr-2.5 mr-1">
          {/* Theme Toggle Button (Light / Dark) */}
          <button
            type="button"
            onClick={toggleTheme}
            className="w-7 h-7 rounded-lg bg-[#17233A] hover:bg-[#23324D] text-amber-300 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-sm"
            title={theme === 'dark' ? 'التبديل إلى الوضع الفاتح (Light Mode)' : 'التبديل إلى الوضع الداكن (Dark Mode)'}
            aria-label={theme === 'dark' ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن'}
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-cyan-300" />}
          </button>

          {/* Decrease Font Size */}
          <button
            type="button"
            onClick={decreaseFontSize}
            disabled={fontSize === 'sm'}
            className="w-7 h-7 rounded-lg bg-[#17233A] hover:bg-[#23324D] disabled:opacity-40 text-slate-300 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-sm"
            title="تصغير حجم الخط (A-)"
            aria-label="تصغير حجم الخط"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          {/* Current Font Indicator */}
          <span
            className="text-[10px] font-mono font-bold text-teal-300 bg-[#0B1220] border border-[#23324D] px-1.5 py-0.5 rounded-md hidden lg:inline"
            title="مستوى حجم الخط الحالي"
          >
            {fontSize === 'sm' ? 'صغير' : fontSize === 'md' ? 'عادي' : fontSize === 'lg' ? 'كبير' : 'ضخم'}
          </span>

          {/* Increase Font Size */}
          <button
            type="button"
            onClick={increaseFontSize}
            disabled={fontSize === 'xl'}
            className="w-7 h-7 rounded-lg bg-[#17233A] hover:bg-[#23324D] disabled:opacity-40 text-slate-300 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-sm"
            title="تكبير حجم الخط (A+)"
            aria-label="تكبير حجم الخط"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Windows Desktop Control Buttons */}
        <div className="flex items-center gap-1 mr-2 border-r border-[#23324D] pr-3">
          <button
            type="button"
            onClick={() => sendWindowCommand('window:minimize')}
            className="w-7 h-7 rounded-lg hover:bg-[#17233A] active:bg-[#202E4C] text-slate-400 hover:text-white flex items-center justify-center transition-colors"
            title="تصغير"
            aria-label="تصغير النافذة"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => sendWindowCommand('window:maximize')}
            className="w-7 h-7 rounded-lg hover:bg-[#17233A] active:bg-[#202E4C] text-slate-400 hover:text-white flex items-center justify-center transition-colors"
            title="تكبير"
            aria-label="تكبير النافذة"
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => sendWindowCommand('window:close')}
            className="w-7 h-7 rounded-lg hover:bg-rose-500 active:bg-rose-600 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
            title="إغلاق"
            aria-label="إغلاق التطبيق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

    </header>
  );
}
