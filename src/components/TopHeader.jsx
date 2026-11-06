import React, { useState, useEffect, useRef } from 'react';
import { Minus, Square, X, Clock, Calendar, CheckCircle2, Wifi, WifiOff, Cloud, RefreshCw, Sparkles } from 'lucide-react';
import { sqliteService } from '../db/sqliteService';

export function TopHeader({
  pharmacyName = 'صيدلية النخبة الحديثة',
  shiftNumber = 1,
  isShiftOpen = true,
  licenseInfo = null,
  onOpenActivation = null
}) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncText, setLastSyncText] = useState('الآن');
  const [syncToast, setSyncToast] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const [cloudPendingCount, setCloudPendingCount] = useState(0);
  const [cloudConfigured, setCloudConfigured] = useState(false);
  const syncBusyRef = useRef(false);

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

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
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

  // Format Arabic Time and Date
  const formattedTime = currentTime.toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });

  const formattedDate = currentTime.toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  

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
            <span className="font-extrabold text-white text-base tracking-tight">{pharmacyName}</span>
            <span className="text-[10px] bg-teal-500/15 text-teal-300 border border-teal-500/30 font-semibold px-2 py-0.5 rounded-full">
              الفرع الرئيسي
            </span>
          </div>
          <div className="text-[11px] text-slate-400 font-medium">نظام نقاط البيع وإدارة الصيدليات v1.0</div>
        </div>
      </div>

      {/* Center Section: Live Clock, Date & Shift Status */}
      <div className="flex items-center gap-4">
        {/* Live Clock with Seconds */}
        <div className="flex items-center gap-2.5 bg-[#17233A] border border-[#23324D] px-3.5 py-1.5 rounded-xl shadow-inner">
          <Clock className="w-4 h-4 text-teal-400" />
          <span className="font-bold text-white text-sm font-mono tracking-wider min-w-[90px] text-center" dir="ltr">
            {formattedTime}
          </span>
          <span className="text-slate-500 text-xs">|</span>
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs text-slate-300 font-medium">{formattedDate}</span>
        </div>

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
        
        {/* Online / Offline Status Badge with Auto-Sync */}
        <button
          type="button"
          onClick={handleManualSync}
          title={isOnline ? `متصل بالإنترنت - آخر مزامنة: ${lastSyncText} (انقر للمزامنة الفورية)` : 'وضع أوفلاين محلي 100% (انقر للحفظ)'}
          className={`flex items-center gap-2 px-3 py-1 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
            isOnline
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20'
          }`}
        >
          {isOnline ? (
            <Wifi className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-rose-400" />
          )}
          <span>{isOnline ? 'أونلاين (متصل بالواي فاي)' : 'أوفلاين (محلي 100%)'}</span>
          {pendingCount > 0 && (
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-black ${
                isOnline ? 'bg-amber-500/25 text-amber-300' : 'bg-rose-500/25 text-rose-200'
              }`}
              title="عمليات محفوظة محلياً في انتظار الرفع"
            >
              {pendingCount} معلّقة
            </span>
          )}
          {cloudPendingCount > 0 && (
            <span
              className="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-black bg-sky-500/25 text-sky-200"
              title="عمليات بانتظار رفعها إلى الخادم الدائم (تُرفع تلقائياً عند عودة الإنترنت)"
            >
              {cloudPendingCount} للسحابة
            </span>
          )}
          <div className="flex items-center gap-1 border-r border-slate-700 pr-2 mr-1">
            <RefreshCw className={`w-3 h-3 text-teal-300 ${isSyncing ? 'animate-spin' : ''}`} />
            <span className="text-[10px] text-slate-300 font-mono hidden sm:inline">{isSyncing ? 'مزامنة...' : 'مزامنة'}</span>
          </div>
        </button>

        

        {/* Windows Desktop Control Buttons */}
        <div className="flex items-center gap-1 mr-2 border-r border-[#23324D] pr-3">
          <button
            type="button"
            onClick={() => sendWindowCommand('window:minimize')}
            className="w-7 h-7 rounded-lg hover:bg-[#17233A] active:bg-[#202E4C] text-slate-400 hover:text-white flex items-center justify-center transition-colors"
            title="تصغير"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => sendWindowCommand('window:maximize')}
            className="w-7 h-7 rounded-lg hover:bg-[#17233A] active:bg-[#202E4C] text-slate-400 hover:text-white flex items-center justify-center transition-colors"
            title="تكبير"
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => sendWindowCommand('window:close')}
            className="w-7 h-7 rounded-lg hover:bg-rose-500 active:bg-rose-600 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
            title="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

    </header>
  );
}
