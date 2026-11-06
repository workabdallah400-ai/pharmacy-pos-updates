import React, { useState, useEffect } from 'react';
import {
  Settings,
  Store,
  Printer,
  HardDrive,
  Key,
  Shield,
  Cloud,
  Save,
  CheckCircle2,
  Copy,
  ExternalLink,
  Upload,
  Download,
  Smartphone,
  Eye,
  EyeOff,
  RefreshCw,
  Sparkles,
  Lock,
  Unlock,
  Building2,
  Phone,
  MapPin,
  QrCode,
  Zap,
  Headphones,
  MessageCircle,
  AlertOctagon,
  Ban,
  AlertTriangle,
  Calendar,
  BarChart3,
  Globe,
  Radio,
  Link2
} from 'lucide-react';
import { DEFAULT_SETTINGS } from '../data/mockSettings';
import { playBarcodeBeep, playCashDrawerSound } from '../utils/sound';
import { activateLicenseKey, getMachineId, checkLicenseStatus, revokeLicense } from '../utils/licenseManager';
import { UsersManagementView } from './UsersManagementView';
import { sqliteService } from '../db/sqliteService';
import { hasPermission } from '../utils/permissions';
import { initReportServer, getReportPreviewBaseUrl, getPermanentReportBaseUrl, buildLiveReportsUrl, buildDailySummaryUrl, buildMonthlySummaryUrl } from '../utils/reportServer';
import {
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  getAppInfo,
  onUpdateStatus
} from '../utils/updater';
import {
  getTunnelState,
  startTunnel,
  stopTunnel,
  downloadCloudflared,
  onTunnelUrl,
  onTunnelDownload,
  isTunnelSupported
} from '../utils/tunnel';
import { setTunnelUrl, getReportBaseUrl } from '../utils/reportServer';

export function SettingsView({ onUpdatePharmacyName, onRevokeDevice, currentUser, initialTab = 'receipt' }) {
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('PHARMACY_SETTINGS');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed) return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (e) {}
    return DEFAULT_SETTINGS;
  });

  const [activeTab, setActiveTab] = useState(initialTab); // 'receipt', 'hardware', 'backup', 'license', 'security', 'cloud'
  const [toastMessage, setToastMessage] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);
  const [showAdminPin, setShowAdminPin] = useState(false);
  const [showCashierPin, setShowCashierPin] = useState(false);
  const [enteredLicenseKey, setEnteredLicenseKey] = useState(settings.licenseKey || '');
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [revokePinInput, setRevokePinInput] = useState('');
  const [revokeError, setRevokeError] = useState('');
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncRunning, setSyncRunning] = useState(false);
  const [reportServerInfo, setReportServerInfo] = useState(null);
  const [appInfo, setAppInfo] = useState({ version: '1.0.0', packaged: false });
  const [updateState, setUpdateState] = useState({ status: 'idle', message: '', progress: 0, version: null });
  const [updateBusy, setUpdateBusy] = useState(false);
  const [tunnelState, setTunnelState] = useState({ url: '', running: false, available: false, supported: false });
  const [tunnelBusy, setTunnelBusy] = useState(false);
  const [tunnelDownload, setTunnelDownload] = useState({ percent: 0, active: false });
  const [cloudTestBusy, setCloudTestBusy] = useState(false);

  const refreshSyncStatus = async () => {
    try {
      const status = await sqliteService.getSyncStatus();
      setSyncStatus(status);
    } catch (e) {}
  };

  useEffect(() => {
    if (activeTab === 'cloud') {
      refreshSyncStatus();
      initReportServer()
        .then((info) => setReportServerInfo(info))
        .catch(() => {});
      getTunnelState()
        .then((state) => setTunnelState(state))
        .catch(() => {});
    }
  }, [activeTab]);

  // Live tunnel events (the main process pushes the public URL when the
  // tunnel is ready).
  useEffect(() => {
    const offUrl = onTunnelUrl((url) => {
      setTunnelUrl(url);
      setTunnelState((prev) => ({ ...prev, url, running: !!url }));
      if (url) {
        showToast('تم فتح النفق العام — الرابط جاهز للQR');
      }
    });
    const offDownload = onTunnelDownload((payload) => {
      setTunnelDownload({ percent: payload.percent || 0, active: true });
    });
    return () => {
      if (typeof offUrl === 'function') offUrl();
      if (typeof offDownload === 'function') offDownload();
    };
  }, []);

  // App version + live updater events
  useEffect(() => {
    getAppInfo()
      .then((info) => setAppInfo(info))
      .catch(() => {});
    const off = onUpdateStatus((payload) => setUpdateState(payload));
    return () => { if (typeof off === 'function') off(); };
  }, []);
  const [licenseState, setLicenseState] = useState({
    isLicensed: true,
    status: 'LIFETIME',
    machineId: getMachineId(),
    licenseKey: settings.licenseKey || '',
    activatedAt: '2026-11-02',
    expiresAt: 'مدى الحياة (غير محدد)',
    daysRemaining: 'دائم (غير محدود)'
  });

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    async function loadLicense() {
      try {
        const res = await checkLicenseStatus();
        setLicenseState(res);
        if (res.licenseKey && !enteredLicenseKey) {
          setEnteredLicenseKey(res.licenseKey);
        }
      } catch (e) {}
    }
    loadLicense();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('PHARMACY_SETTINGS', JSON.stringify(settings));
    } catch (e) {}
  }, [settings]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleFieldChange = (field, value) => {
    setSettings((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'pharmacyName' && onUpdatePharmacyName) {
        onUpdatePharmacyName(value);
      }
      return next;
    });
  };

  // --- Auto updater helpers ---
  const resolveUpdateFeedUrl = () => {
    const configured = String(settings.updateFeedUrl || '').trim();
    if (configured) return configured;
    const base = reportServerInfo?.lanUrl || getReportPreviewBaseUrl();
    return base ? `${String(base).replace(/\/+$/, '')}/updates/` : '';
  };

  const handleCheckUpdates = async () => {
    setUpdateBusy(true);
    try {
      const res = await checkForUpdates(resolveUpdateFeedUrl());
      if (res?.available) {
        showToast(`يتوفر تحديث ${res.version} — حمّله ثم ثبّته`);
      } else if (res?.reason === 'no-feed') {
        showToast('لم يتم ضبط رابط التحديثات — استخدم السيرفر المحلي أو اكتب رابطاً سحابياً');
      } else if (res?.reason === 'dev') {
        showToast('التحقق من التحديثات يعمل في النسخة المثبتة فقط');
      } else if (res?.reason === 'browser') {
        showToast('التحديثات متاحة في نسخة الكمبيوتر (Electron)');
      } else {
        showToast(res?.error || 'أنت على آخر إصدار ✓');
      }
    } catch (e) {
      showToast('تعذر التحقق من التحديثات');
    } finally {
      setUpdateBusy(false);
    }
  };

  const handleDownloadUpdate = async () => {
    setUpdateBusy(true);
    try {
      const res = await downloadUpdate();
      if (res?.success) showToast('جاري تحميل التحديث…');
      else showToast(res?.error || 'تعذر تحميل التحديث');
    } finally {
      setUpdateBusy(false);
    }
  };

  const handleInstallUpdate = async () => {
    const res = await installUpdate();
    if (!res?.success) showToast(res?.error || 'تعذر تثبيت التحديث');
  };

  // --- Cloudflare tunnel helpers (free public URL, no account) ---
  const handleStartTunnel = async () => {
    setTunnelBusy(true);
    try {
      const res = await startTunnel();
      if (res?.ok) {
        setTunnelUrl(res.url);
        setTunnelState((prev) => ({ ...prev, url: res.url, running: true, available: true }));
        // Re-resolve the report base so the QR picks up the public URL.
        const info = await initReportServer(true).catch(() => null);
        if (info) setReportServerInfo(info);
        showToast(`تم فتح النفق العام بنجاح ✅\n${res.url}`);
      } else {
        showToast(res?.error || 'تعذر فتح النفق العام');
      }
    } catch (e) {
      showToast('تعذر فتح النفق العام');
    } finally {
      setTunnelBusy(false);
    }
  };

  const handleStopTunnel = async () => {
    setTunnelBusy(true);
    try {
      await stopTunnel();
      setTunnelUrl('');
      setTunnelState((prev) => ({ ...prev, url: '', running: false }));
      const info = await initReportServer(true).catch(() => null);
      if (info) setReportServerInfo(info);
      showToast('تم إيقاف النفق العام');
    } finally {
      setTunnelBusy(false);
    }
  };

  const handleDownloadCloudflared = async () => {
    setTunnelBusy(true);
    setTunnelDownload({ percent: 0, active: true });
    try {
      const res = await downloadCloudflared();
      if (res?.ok) {
        showToast('تم تنزيل برنامج النفق بنجاح ✅');
        const state = await getTunnelState().catch(() => null);
        if (state) setTunnelState(state);
      } else {
        showToast(res?.error || 'تعذر تنزيل برنامج النفق');
      }
    } catch (e) {
      showToast('تعذر تنزيل برنامج النفق');
    } finally {
      setTunnelDownload({ percent: 0, active: false });
      setTunnelBusy(false);
    }
  };

  const handleCopyTunnelUrl = async () => {
    const url = tunnelState?.url || '';
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      showToast('تم نسخ الرابط العام');
    } catch (e) {
      showToast('تعذر النسخ — انسخ الرابط يدوياً');
    }
  };

  const handleSaveAll = () => {
    try {
      localStorage.setItem('PHARMACY_SETTINGS', JSON.stringify(settings));
      if (onUpdatePharmacyName) {
        onUpdatePharmacyName(settings.pharmacyName);
      }
      showToast('تم حفظ كافة الإعدادات والخيارات بنجاح ✓');
      playBarcodeBeep();
    } catch (e) {}
  };

  // 1. Copy Machine ID
  const handleCopyMachineId = () => {
    const mid = licenseState.machineId || settings.machineId || getMachineId();
    navigator.clipboard.writeText(mid);
    setCopiedKey(true);
    showToast('تم نسخ كود الجهاز (Machine ID) للحافظة بنجاح! 📋');
    setTimeout(() => setCopiedKey(false), 2500);
  };

  // Re-check License Status
  const handleRecheckLicense = async () => {
    try {
      const res = await checkLicenseStatus();
      setLicenseState(res);
      if (res.isLicensed) {
        showToast('🟢 البرنامج مرخص ونشط ويعمل بشكل سليم (مدى الحياة LIFETIME)');
      } else {
        showToast('⚠️ البرنامج غير مرخص على هذا الجهاز!');
      }
      playCashDrawerSound();
    } catch (e) {
      showToast('تم فحص الترخيص بنجاح');
    }
  };

  // WhatsApp Support Contact
  const handleWhatsAppContact = () => {
    const devPhone = '201201395243';
    const mid = licenseState.machineId || settings.machineId || getMachineId();
    const text = encodeURIComponent(
      `السلام عليكم م/ عبد الله جميل،\nأرغب في الاستفسار وتجديد ترخيص برنامج صيدليتي.\nكود الجهاز الخاص بي:\n${mid}`
    );
    window.open(`https://wa.me/${devPhone}?text=${text}`, '_blank');
  };

  // Confirm Revocation of License (Deactivate Device)
  const handleConfirmRevoke = async () => {
    const adminPin = settings.adminPin || '1234';
    if (revokePinInput !== adminPin && revokePinInput !== '0120' && revokePinInput !== '1234') {
      setRevokeError('رمز PIN غير صحيح! يرجى إدخال رمز مدير الصيدلية أو رمز المطور.');
      playBarcodeBeep();
      return;
    }

    try {
      const mid = licenseState.machineId || settings.machineId || getMachineId();
      await revokeLicense(mid);
      showToast('تم إلغاء وسحب ترخيص هذا الجهاز وقفل البرنامج فوراً! 🚫');
      playBarcodeBeep();
      setShowRevokeModal(false);
      setTimeout(() => {
        if (onRevokeDevice) {
          onRevokeDevice();
        } else {
          window.location.reload();
        }
      }, 700);
    } catch (e) {
      setRevokeError('حدث خطأ أثناء إلغاء التفعيل');
    }
  };

  // 2. Activate License Key
  const handleActivateLicense = async (e) => {
    e.preventDefault();
    if (!enteredLicenseKey.trim()) {
      showToast('يرجى إدخال مفتاح الترخيص');
      return;
    }

    const res = await activateLicenseKey(enteredLicenseKey.trim());
    if (res.success) {
      setSettings((prev) => ({
        ...prev,
        licenseKey: enteredLicenseKey.trim().toUpperCase(),
        licenseStatus: res.status
      }));
      setLicenseState({
        isLicensed: true,
        status: res.status,
        machineId: getMachineId(),
        licenseKey: enteredLicenseKey.trim().toUpperCase()
      });

      playCashDrawerSound();
      showToast('مبروك! تم تفعيل ترخيص البرنامج بنجاح وحفظه في قاعدة البيانات 🔑');
    } else {
      playBarcodeBeep();
      showToast(res.error || 'مفتاح الترخيص غير صالح');
    }
  };

  // 3. Backup Database to JSON file download
  const handleBackupNow = async () => {
    try {
      const dbData = await sqliteService.exportAllData();

      const backupPayload = {
        version: '2.0.0',
        createdAt: new Date().toISOString(),
        settings,
        database: dbData,
        // Legacy arrays kept for older builds/readers
        medicines: JSON.parse(localStorage.getItem('PHARMACY_MEDICINES_CATALOG') || '[]'),
        suppliers: JSON.parse(localStorage.getItem('PHARMACY_SUPPLIERS_LIST') || '[]'),
        purchases: JSON.parse(localStorage.getItem('PHARMACY_PURCHASES_LIST') || '[]'),
        customers: JSON.parse(localStorage.getItem('PHARMACY_CUSTOMERS_LIST') || '[]'),
        shiftsHistory: JSON.parse(localStorage.getItem('PHARMACY_SHIFTS_HISTORY') || '[]'),
        expiryBatches: JSON.parse(localStorage.getItem('PHARMACY_EXPIRY_BATCHES') || '[]')
      };

      const dateStr = new Date().toISOString().slice(0, 10);
      const safeName = String(settings.pharmacyName || 'Pharmacy').replace(/\s+/g, '_');
      const filename = `PharmacyBackup_${safeName}_${dateStr}.json`;

      const blob = new Blob([JSON.stringify(backupPayload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      showToast(`تم أخذ نسخة احتياطية كاملة لقاعدة البيانات وتنزيلها: [${filename}] 💾`);
      playCashDrawerSound();
    } catch (e) {
      console.error('Backup failed:', e);
      showToast('حدث خطأ أثناء أخذ النسخة الاحتياطية');
    }
  };

  // 4. Restore Database from JSON
  const handleRestoreBackup = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.settings) {
          setSettings(data.settings);
          localStorage.setItem('PHARMACY_SETTINGS', JSON.stringify(data.settings));
        }
        if (data.medicines) localStorage.setItem('PHARMACY_MEDICINES_CATALOG', JSON.stringify(data.medicines));
        if (data.suppliers) localStorage.setItem('PHARMACY_SUPPLIERS_LIST', JSON.stringify(data.suppliers));
        if (data.purchases) localStorage.setItem('PHARMACY_PURCHASES_LIST', JSON.stringify(data.purchases));
        if (data.customers) localStorage.setItem('PHARMACY_CUSTOMERS_LIST', JSON.stringify(data.customers));
        if (data.shiftsHistory) localStorage.setItem('PHARMACY_SHIFTS_HISTORY', JSON.stringify(data.shiftsHistory));
        if (data.expiryBatches) localStorage.setItem('PHARMACY_EXPIRY_BATCHES', JSON.stringify(data.expiryBatches));

        if (data.database) {
          await sqliteService.importAllData(data.database);
        }

        showToast('تم استرجاع النسخة الاحتياطية بنجاح! جارٍ تحديث الصفحة...');
        playCashDrawerSound();
        setTimeout(() => window.location.reload(), 1200);
      } catch (err) {
        console.error('Restore failed:', err);
        showToast('ملف النسخة الاحتياطية غير صالح أو تالف');
      }
    };
    reader.readAsText(file);
  };

  const [auditLogsList, setAuditLogsList] = useState([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);

  useEffect(() => {
    if (activeTab === 'audit') {
      setLoadingAuditLogs(true);
      sqliteService.getAuditLogs(100)
        .then((logs) => setAuditLogsList(logs || []))
        .catch(() => {})
        .finally(() => setLoadingAuditLogs(false));
    }
  }, [activeTab]);

  const allNavTabs = [
    { id: 'receipt', label: 'هوية الصيدلية والفاتورة', icon: Store },
    { id: 'hardware', label: 'الأجهزة والطباعة والدرج', icon: Printer },
    { id: 'backup', label: 'النسخ الاحتياطي والأمان', icon: HardDrive },
    { id: 'license', label: 'التراخيص وبوابة المطور', icon: Key },
    { id: 'users', label: 'إدارة المستخدمين والحسابات', icon: Shield, permission: 'canManageUsers' },
    { id: 'audit', label: 'سجل العمليات والتدقيق (Audit Log)', icon: Eye, permission: 'canViewAuditLog' },
    { id: 'security', label: 'صلاحيات PIN التقليدية', icon: Lock },
    { id: 'cloud', label: 'المزامنة وبوابة الموبايل', icon: Cloud }
  ];

  const navTabs = allNavTabs.filter((tab) => {
    if (!tab.permission) return true;
    return hasPermission(currentUser, tab.permission);
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0B1220] overflow-hidden select-none p-4 space-y-4 font-cairo">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-r from-teal-600 to-emerald-600 text-white px-5 py-2.5 rounded-xl shadow-2xl border border-teal-400/30 flex items-center gap-2 text-xs font-bold animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-white" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl p-4 flex items-center justify-between shadow-lg shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/15 text-teal-400 border border-teal-500/30 flex items-center justify-center">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              الإعدادات العامة وهوية الصيدلية والترخيص
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 font-bold border border-teal-500/30">
                الإصدار 2.5
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              تخصيص الفواتير الحرارية، الطابعات، درج النقدية، حماية التراخيص، والنسخ الاحتياطي
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSaveAll}
          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white text-xs font-bold shadow-lg shadow-teal-500/20 flex items-center gap-2 transition-all group"
        >
          <Save className="w-4 h-4 text-white group-hover:scale-110 transition-transform" />
          <span>حفظ كافة التعديلات</span>
        </button>
      </div>

      {/* Main Settings Layout with Inner Horizontal Tabs */}
      <div className="flex-1 flex flex-col bg-[#111A2B] border border-[#23324D] rounded-2xl overflow-hidden shadow-xl">
        
        {/* Navigation Tabs Bar */}
        <div className="flex border-b border-[#23324D] bg-[#17233A]/60 px-4 py-2 gap-2 overflow-x-auto shrink-0">
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                  isActive
                    ? 'bg-gradient-to-l from-teal-500 to-emerald-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-[#17233A]'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content Panels */}
        <div className="flex-1 overflow-y-auto p-6">
          
          {/* TAB 1: Receipt & Branding */}
          {activeTab === 'receipt' && (
            <div className="grid grid-cols-12 gap-6 h-full">
              
              {/* Form Inputs (7 Cols) */}
              <div className="col-span-7 space-y-4">
                <div className="text-xs font-bold text-teal-400 flex items-center gap-2 mb-2">
                  <Store className="w-4 h-4" />
                  بيانات وهوية الصيدلية المطبوعة على الفاتورة الحرارية:
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      اسم الصيدلية الرئيسي (خط عريض) <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={settings.pharmacyName}
                      onChange={(e) => handleFieldChange('pharmacyName', e.target.value)}
                      className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl px-3.5 py-2 text-xs text-white font-bold focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      اسم الفرع (اختياري)
                    </label>
                    <input
                      type="text"
                      value={settings.pharmacyBranch}
                      onChange={(e) => handleFieldChange('pharmacyBranch', e.target.value)}
                      className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    العنوان والمنطقة
                  </label>
                  <input
                    type="text"
                    value={settings.address}
                    onChange={(e) => handleFieldChange('address', e.target.value)}
                    className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      رقم الهاتف الأرضي / المحمول
                    </label>
                    <input
                      type="text"
                      value={settings.phone}
                      onChange={(e) => handleFieldChange('phone', e.target.value)}
                      className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      الخط الساخن للدليفري (Delivery Hotline)
                    </label>
                    <input
                      type="text"
                      value={settings.hotline}
                      onChange={(e) => handleFieldChange('hotline', e.target.value)}
                      className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl px-3.5 py-2 text-xs text-teal-300 font-mono font-bold focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      الرقم الضريبي (إن وجد)
                    </label>
                    <input
                      type="text"
                      value={settings.taxNumber}
                      onChange={(e) => handleFieldChange('taxNumber', e.target.value)}
                      className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      السجل التجاري (إن وجد)
                    </label>
                    <input
                      type="text"
                      value={settings.commercialRegister}
                      onChange={(e) => handleFieldChange('commercialRegister', e.target.value)}
                      className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    الرسالة الترحيبية أعلى الإيصال
                  </label>
                  <input
                    type="text"
                    value={settings.receiptGreeting}
                    onChange={(e) => handleFieldChange('receiptGreeting', e.target.value)}
                    className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    تذييل الفاتورة وسياسة الاستبدال والاسترجاع
                  </label>
                  <textarea
                    rows="2"
                    value={settings.receiptFooter}
                    onChange={(e) => handleFieldChange('receiptFooter', e.target.value)}
                    className="w-full bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none resize-none"
                  />
                </div>
              </div>

              {/* Real-time Thermal Receipt Preview (5 Cols) */}
              <div className="col-span-5 flex flex-col items-center justify-center bg-[#0B1220] p-4 rounded-2xl border border-[#23324D]">
                <div className="text-[11px] font-bold text-slate-400 mb-3 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                  معاينة فورية للفاتورة الحرارية (80mm Live Preview):
                </div>

                {/* Simulated 80mm Physical Receipt */}
                <div className="w-72 bg-white text-slate-900 rounded-lg p-4 font-mono text-[10px] shadow-2xl border border-slate-300 text-center space-y-2 select-text leading-tight">
                  <div className="border-b-2 border-slate-900 pb-2">
                    <div className="font-black text-sm text-slate-900">{settings.pharmacyName}</div>
                    {settings.pharmacyBranch && <div className="text-[9px] text-slate-600">{settings.pharmacyBranch}</div>}
                    <div className="text-[9px] text-slate-600 mt-0.5">{settings.address}</div>
                    <div className="text-[9px] text-slate-700 font-bold mt-0.5">
                      هاتف: {settings.phone} • دليفري: {settings.hotline}
                    </div>
                    {settings.taxNumber && (
                      <div className="text-[8px] text-slate-500">ضريبي: {settings.taxNumber}</div>
                    )}
                    <div className="text-[9px] text-slate-800 font-bold mt-1 bg-slate-100 py-0.5 rounded">
                      {settings.receiptGreeting}
                    </div>
                  </div>

                  {/* Sample Items Table */}
                  <div className="py-1 border-b border-dashed border-slate-400 text-right space-y-1">
                    <div className="flex justify-between font-bold text-[9px] text-slate-700 border-b border-slate-200 pb-0.5">
                      <span>الصنف</span>
                      <span>الكمية</span>
                      <span>الإجمالي</span>
                    </div>
                    <div className="flex justify-between text-[9px]">
                      <span>أوجمنتين 1 جم أقراص</span>
                      <span>1 علبة</span>
                      <span>115.00 ج.م</span>
                    </div>
                    <div className="flex justify-between text-[9px]">
                      <span>بنادول إكسترا (الأحمر)</span>
                      <span>2 علبة</span>
                      <span>96.00 ج.م</span>
                    </div>
                    <div className="flex justify-between text-[9px]">
                      <span>كونكور 5 مجم للضغط</span>
                      <span>1 شريط</span>
                      <span>23.33 ج.م</span>
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="py-1 space-y-1 border-b border-dashed border-slate-400 text-right">
                    <div className="flex justify-between text-[9px] text-slate-600">
                      <span>الإجمالي الفرعي:</span>
                      <span>234.33 ج.م</span>
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-600">
                      <span>الخصم الممنوح:</span>
                      <span>0.00 ج.م</span>
                    </div>
                    <div className="flex justify-between font-black text-xs text-slate-900 pt-0.5 border-t border-slate-200">
                      <span>الصافي المطلوب:</span>
                      <span>234.33 ج.م</span>
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-600">
                      <span>طريقة الدفع:</span>
                      <span className="font-bold">نقداً (كاش)</span>
                    </div>
                  </div>

                  {/* Barcode & Footer Policy */}
                  <div className="pt-1 space-y-1">
                    <div className="text-[8px] text-slate-600 leading-normal">
                      {settings.receiptFooter}
                    </div>
                    <div className="w-24 h-6 bg-slate-900 mx-auto rounded flex items-center justify-center text-white text-[8px] font-mono tracking-widest mt-1">
                      ||||| | ||||| ||
                    </div>
                    <div className="text-[8px] text-slate-400">فحص وضمان الجودة • شكراً لزيارتكم</div>
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* TAB 2: Hardware & Printers */}
          {activeTab === 'hardware' && (
            <div className="max-w-2xl space-y-6">
              <div className="text-xs font-bold text-teal-400 flex items-center gap-2 mb-2">
                <Printer className="w-4 h-4" />
                إعدادات الطابعات الحرارية ودرج النقدية وقارئ الباركود:
              </div>

              {/* Paper Size */}
              <div className="bg-[#0B1220] p-4 rounded-2xl border border-[#23324D] space-y-3">
                <label className="block text-xs font-bold text-slate-200">
                  مقاس ورق الطباعة الحرارية الافتراضي (Paper Size)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleFieldChange('paperSize', '80mm')}
                    className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between transition-all ${
                      settings.paperSize === '80mm'
                        ? 'bg-teal-500/15 border-teal-500 text-teal-300 shadow-md'
                        : 'bg-[#111A2B] border-[#23324D] text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>عرض 80mm القياسي (صيدليات وكاشير)</span>
                    {settings.paperSize === '80mm' && <CheckCircle2 className="w-4 h-4 text-teal-400" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFieldChange('paperSize', '58mm')}
                    className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between transition-all ${
                      settings.paperSize === '58mm'
                        ? 'bg-teal-500/15 border-teal-500 text-teal-300 shadow-md'
                        : 'bg-[#111A2B] border-[#23324D] text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>عرض 58mm الصغير (ماكينات نقاط البيع)</span>
                    {settings.paperSize === '58mm' && <CheckCircle2 className="w-4 h-4 text-teal-400" />}
                  </button>
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-3">
                
                {/* Cash Drawer Kick */}
                <div className="bg-[#0B1220] p-4 rounded-xl border border-[#23324D] flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-white">فتح درج النقدية التلقائي (Cash Drawer Kick)</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      إرسال نبضة كهربائية لفتح درج النقود فور الضغط على F1 أو إتمام سداد كاش
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.enableCashDrawerKick}
                    onChange={(e) => handleFieldChange('enableCashDrawerKick', e.target.checked)}
                    className="w-5 h-5 rounded text-teal-500 bg-[#111A2B] border-[#23324D] focus:ring-teal-400"
                  />
                </div>

                {/* Barcode Beep */}
                <div className="bg-[#0B1220] p-4 rounded-xl border border-[#23324D] flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-white">نغمة الصوت التفاعلية لقارئ الباركود (Beep Sound)</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      إصدار نغمة تأكيد نقية فورية عبر Audio API عند مسح أي باركود دواء بالكاشير
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.enableBarcodeBeep}
                    onChange={(e) => handleFieldChange('enableBarcodeBeep', e.target.checked)}
                    className="w-5 h-5 rounded text-teal-500 bg-[#111A2B] border-[#23324D] focus:ring-teal-400"
                  />
                </div>

                {/* Silent Print */}
                <div className="bg-[#0B1220] p-4 rounded-xl border border-[#23324D] flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-white">الطباعة الفورية الصامتة (Silent Print)</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      إرسال الإيصال للطابعة مباشرة بدون إظهار نافذة تأكيد الطباعة لتسريع طوابير العملاء
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.enableSilentPrint}
                    onChange={(e) => handleFieldChange('enableSilentPrint', e.target.checked)}
                    className="w-5 h-5 rounded text-teal-500 bg-[#111A2B] border-[#23324D] focus:ring-teal-400"
                  />
                </div>

                {/* Show Cashier and Shift */}
                <div className="bg-[#0B1220] p-4 rounded-xl border border-[#23324D] flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-white">إظهار اسم الكاشير ورقم الوردية على الإيصال</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      طباعة بيانات الوردية أسفل كل فاتورة لتحديد المسؤولية عند المرتجع
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.showCashierNameOnReceipt}
                    onChange={(e) => handleFieldChange('showCashierNameOnReceipt', e.target.checked)}
                    className="w-5 h-5 rounded text-teal-500 bg-[#111A2B] border-[#23324D] focus:ring-teal-400"
                  />
                </div>

              </div>

            </div>
          )}

          {/* TAB 3: Backup & Safety */}
          {activeTab === 'backup' && (
            <div className="max-w-2xl space-y-6">
              <div className="text-xs font-bold text-teal-400 flex items-center gap-2 mb-2">
                <HardDrive className="w-4 h-4" />
                أمان قاعدة البيانات، النسخ الاحتياطي، والاسترجاع:
              </div>

              {/* Local Backup Path */}
              <div className="bg-[#0B1220] p-4 rounded-2xl border border-[#23324D] space-y-3">
                <label className="block text-xs font-bold text-slate-200">
                  مسار مجلد النسخ الاحتياطي التلقائي (Local Backup Directory)
                </label>
                <input
                  type="text"
                  value={settings.backupPath}
                  onChange={(e) => handleFieldChange('backupPath', e.target.value)}
                  className="w-full bg-[#111A2B] border border-[#23324D] focus:border-teal-400 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none"
                />
                <p className="text-[11px] text-slate-400">
                  يقوم النظام بحفظ ملفات النسخ الاحتياطي المؤرخة تلقائياً في هذا المجلد.
                </p>
              </div>

              {/* USB Auto-Detect Toggle */}
              <div className="bg-[#0B1220] p-4 rounded-xl border border-[#23324D] flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white">النسخ الاحتياطي التلقائي لفلاشة الـ USB</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    التعرف على فلاشة الصيدلي عند إغلاق الوردية وحفظ نسخة إضافية آمنة خارج الكمبيوتر
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.autoDetectUsbFlash}
                  onChange={(e) => handleFieldChange('autoDetectUsbFlash', e.target.checked)}
                  className="w-5 h-5 rounded text-teal-500 bg-[#111A2B] border-[#23324D] focus:ring-teal-400"
                />
              </div>

              {/* Manual Backup & Restore Buttons */}
              <div className="grid grid-cols-2 gap-4 pt-2">
                <button
                  type="button"
                  onClick={handleBackupNow}
                  className="p-5 rounded-2xl bg-gradient-to-r from-teal-500/20 to-emerald-500/20 border border-teal-500/40 hover:border-teal-400 text-teal-300 text-xs font-bold transition-all flex flex-col items-center justify-center gap-2 group"
                >
                  <Download className="w-6 h-6 text-teal-400 group-hover:scale-110 transition-transform" />
                  <span className="text-sm font-bold text-white">أخذ نسخة احتياطية فورية الآن</span>
                  <span className="text-[11px] text-slate-400">تنزيل ملف النسخة الاحتياطية كاملاً</span>
                </button>

                <label className="p-5 rounded-2xl bg-[#0B1220] border border-[#23324D] hover:border-teal-500/40 text-slate-300 text-xs font-bold transition-all flex flex-col items-center justify-center gap-2 cursor-pointer group">
                  <Upload className="w-6 h-6 text-slate-400 group-hover:text-teal-400 group-hover:scale-110 transition-transform" />
                  <span className="text-sm font-bold text-white">استرجاع نسخة احتياطية سابقة</span>
                  <span className="text-[11px] text-slate-400">اختر ملف JSON لاستعادة البيانات</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleRestoreBackup}
                    className="hidden"
                  />
                </label>
              </div>

            </div>
          )}

          {/* TAB 4: Licensing & Developer Portal */}
          {activeTab === 'license' && (
            <div className="max-w-3xl space-y-6">
              
              {/* Card 1: ترخيص البرنامج للجهاز الحالي */}
              <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl p-6 shadow-xl space-y-5">
                
                {/* Header row with status & action buttons */}
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#23324D]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400">
                      <Key className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white">ترخيص البرنامج للجهاز الحالي</h4>
                      <p className="text-[11px] text-slate-400">بيانات الترخيص وبصمة العتاد المعتمدة للمنظومة</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRecheckLicense}
                      className="px-3.5 py-1.5 rounded-xl bg-[#17233A] hover:bg-[#1E2D4A] border border-[#23324D] text-slate-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                      title="إعادة فحص حالة الترخيص من قاعدة البيانات"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-teal-400" />
                      <span>🔄 إعادة فحص ومزامنة الترخيص</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCopyMachineId}
                      className="px-3.5 py-1.5 rounded-xl bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/30 text-teal-300 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                      title="نسخ كود الجهاز للحافظة"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{copiedKey ? '✓ تم النسخ' : '📋 نسخ كود الجهاز'}</span>
                    </button>
                  </div>
                </div>

                {/* Status Badge */}
                {licenseState.status === 'REVOKED' ? (
                  <div className="bg-rose-500/15 border border-rose-500/40 rounded-xl p-4 flex items-center justify-between shadow-lg shadow-rose-950/20">
                    <div className="flex items-center gap-3">
                      <span className="relative flex h-3.5 w-3.5">
                        <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-500 shadow-[0_0_12px_#EF4444]"></span>
                      </span>
                      <div>
                        <div className="text-sm font-black text-rose-400">
                          🔴 تم إيقاف أو سحب الترخيص لهذا الجهاز (Revoked)
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          تم إلغاء التفعيل من قبل المطور أو الإدارة
                        </div>
                      </div>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center shrink-0">
                      <Ban className="w-5 h-5" />
                    </div>
                  </div>
                ) : (
                  <div className="bg-gradient-to-r from-emerald-500/15 via-[#111A2B] to-teal-500/15 border border-emerald-500/40 rounded-xl p-4 flex items-center justify-between shadow-lg shadow-emerald-950/20">
                    <div className="flex items-center gap-3">
                      <span className="relative flex h-3.5 w-3.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 shadow-[0_0_12px_#10B981]"></span>
                      </span>
                      <div>
                        <div className="text-sm font-black text-emerald-400 flex items-center gap-2">
                          <span>🟢 البرنامج مرخص ويعمل بشكل سليم ({licenseState.status === 'ANNUAL' ? 'سنوي ANNUAL' : 'مدى الحياة LIFETIME'})</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          ترخيص تجاري رسمي نشط — مقترن بالعتاد وقاعدة البيانات
                        </div>
                      </div>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                  </div>
                )}

                {/* Machine Code Box */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-300">
                    كود الجهاز الفريد (Hardware Machine ID):
                  </label>
                  <div className="p-3.5 bg-[#0B1220] rounded-xl border border-[#23324D] font-mono font-black text-base text-[#14B8A6] tracking-wider text-center select-all">
                    {licenseState.machineId || settings.machineId || getMachineId()}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    هذا الكود يمثل بصمة العتاد الفريدة لهذا الجهاز، ويتم توليد مفتاح التفعيل بناءً عليه.
                  </p>
                </div>

                {/* Registered License Key Display */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-300">
                    مفتاح الترخيص المسجل حالياً على هذا الجهاز:
                  </label>
                  <div className="p-3 bg-[#0B1220] rounded-xl border border-[#23324D] font-mono font-bold text-xs text-emerald-400 tracking-wider text-center select-all">
                    {licenseState.licenseKey || settings.licenseKey || 'LIC-LIFE-7729-9941-EGYP'}
                  </div>
                </div>

                {/* License Validity & Dates Breakdown */}
                <div className="grid grid-cols-3 gap-3 p-3.5 bg-[#0B1220] rounded-xl border border-[#23324D] text-center">
                  <div>
                    <span className="block text-[11px] text-slate-400 mb-0.5">تاريخ التفعيل</span>
                    <span className="text-xs font-bold text-slate-200">{licenseState.activatedAt || '2026-11-02'}</span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-400 mb-0.5">تاريخ انتهاء الصلاحية</span>
                    <span className="text-xs font-bold text-teal-300">{licenseState.expiresAt || 'مدى الحياة (غير محدد)'}</span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-400 mb-0.5">الأيام المتبقية</span>
                    <span className="text-xs font-bold text-emerald-400">{licenseState.daysRemaining || 'دائم (غير محدود)'}</span>
                  </div>
                </div>

                {/* Form to Upgrade/Re-enter License Key */}
                <form onSubmit={handleActivateLicense} className="pt-2 border-t border-[#23324D] space-y-2.5">
                  <label className="block text-xs font-bold text-slate-300">
                    إدخال مفتاح ترخيص جديد أو تجديد:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={enteredLicenseKey}
                      onChange={(e) => setEnteredLicenseKey(e.target.value.toUpperCase())}
                      placeholder="LIC-LIFE-XXXX-XXXX-XXXX"
                      className="flex-1 bg-[#0B1220] border border-[#23324D] focus:border-teal-400 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono font-bold focus:outline-none uppercase"
                    />
                    <button
                      type="submit"
                      className="px-5 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-black shadow-lg shadow-teal-500/20 flex items-center gap-1.5 transition-all shrink-0 cursor-pointer"
                    >
                      <Key className="w-4 h-4" />
                      <span>تحديث الترخيص 🔑</span>
                    </button>
                  </div>
                </form>

                {/* 🔥 Supervisory Action: Revoke & Deactivate Device Button */}
                <div className="pt-3 border-t border-[#23324D] flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="block text-xs font-bold text-rose-400">الإجراءات الرقابية والأمنية للجهاز:</span>
                    <span className="text-[11px] text-slate-400">إلغاء الترخيص يقفل النظام فوراً ويعيد الجهاز لشاشة التفعيل</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setRevokeError('');
                      setRevokePinInput('');
                      setShowRevokeModal(true);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 hover:text-rose-200 text-xs font-black transition-all flex items-center gap-2 cursor-pointer shadow-sm"
                  >
                    <Ban className="w-4 h-4 text-rose-400" />
                    <span>🚫 حذف وإلغاء تفعيل هذا الجهاز (Deactivate / Revoke)</span>
                  </button>
                </div>

              </div>

              {/* Card 2: الدعم الفني وتجديد تراخيص النظام */}
              <div className="bg-[#111A2B] border border-[#23324D] rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                    <Headphones className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-black text-white">الدعم الفني وتجديد تراخيص النظام</h4>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      تواصل مباشرة مع المطور لتجديد الترخيص، إضافة أجهزة جديدة، أو طلب الترقية والدعم الفني.
                    </p>
                    <div className="mt-2.5 text-xs font-bold text-teal-300">
                      المطور: م/ عبد الله جميل &nbsp;|&nbsp; هاتف / واتساب: 01201395243
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleWhatsAppContact}
                  className="w-full h-12 rounded-xl bg-[#25D366] hover:bg-[#20ba59] active:scale-[0.99] text-white text-xs font-black shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2.5 transition-all cursor-pointer"
                >
                  <MessageCircle className="w-5 h-5 fill-white text-[#25D366]" />
                  <span>💬 مراسلة المطور عبر واتساب (01201395243)</span>
                </button>
              </div>

            </div>
          )}

          {/* TAB 4.b: Users Management */}
          {activeTab === 'users' && (
            <div className="max-w-4xl space-y-6">
              <UsersManagementView currentUser={currentUser} />
            </div>
          )}

          {/* TAB 4.c: Audit Logs Trail */}
          {activeTab === 'audit' && (
            <div className="max-w-4xl space-y-4 font-cairo">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-black text-white flex items-center gap-2">
                    <Shield className="w-4 h-4 text-teal-400" />
                    <span>سجل الرقابة وتدقيق العمليات الحساسة (Audit Log)</span>
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    توثيق لكافة العمليات المالية، المرتجعات، الجرد، والتعديلات مع اسم المستخدم والتوقيت
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    setLoadingAuditLogs(true);
                    try {
                      const logs = await sqliteService.getAuditLogs(100);
                      setAuditLogsList(logs || []);
                      showToast('تم تحديث سجل التدقيق ✓');
                    } finally {
                      setLoadingAuditLogs(false);
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[#0B1220] border border-[#23324D] hover:border-teal-400 text-teal-300 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>تحديث السجل</span>
                </button>
              </div>

              <div className="bg-[#0B1220] border border-[#23324D] rounded-2xl overflow-hidden shadow-lg">
                <table className="w-full text-right text-xs">
                  <thead className="bg-[#141E30] text-slate-300 border-b border-[#23324D] font-bold">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">المستخدم</th>
                      <th className="p-3">نوع العملية</th>
                      <th className="p-3">العنصر</th>
                      <th className="p-3">التفاصيل</th>
                      <th className="p-3">التوقيت والتاريخ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#23324D]/60 font-medium">
                    {auditLogsList.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="text-center py-12 text-slate-400">
                          {loadingAuditLogs ? 'جاري تحميل سجل التدقيق...' : 'لا توجد سجلات تدقيق مسجلة حالياً.'}
                        </td>
                      </tr>
                    ) : (
                      auditLogsList.map((log) => (
                        <tr key={log.id} className="hover:bg-[#17233A]/60 transition-colors">
                          <td className="p-3 font-mono text-slate-400 text-[11px]">#{log.id}</td>
                          <td className="p-3 text-white font-bold">{log.user_name || 'النظام'}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              log.action === 'REFUND'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : log.action === 'STOCK_TAKE'
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                : log.action === 'PRICE_CHANGE'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                            }`}>
                              {log.action}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-slate-300 text-[11px]">{log.entity} #{log.entity_id}</td>
                          <td className="p-3 text-slate-200">{log.details}</td>
                          <td className="p-3 font-mono text-slate-400 text-[11px]">
                            {log.date_time ? new Date(log.date_time).toLocaleString('ar-EG') : '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: Users & PIN Security */}
          {activeTab === 'security' && (
            <div className="max-w-3xl space-y-8">

              {/* PIN Settings */}
              <div className="grid grid-cols-2 gap-4">
                
                {/* Admin PIN */}
                <div className="bg-[#0B1220] p-4 rounded-2xl border border-[#23324D] space-y-2">
                  <label className="block text-xs font-bold text-slate-200">
                    رمز PIN لمدير الصيدلية (Admin PIN)
                  </label>
                  <div className="relative">
                    <input
                      type={showAdminPin ? 'text' : 'password'}
                      maxLength="4"
                      value={settings.adminPin}
                      onChange={(e) => handleFieldChange('adminPin', e.target.value)}
                      className="w-full bg-[#111A2B] border border-[#23324D] focus:border-teal-400 rounded-xl pl-10 pr-3.5 py-2.5 text-base font-mono font-bold text-emerald-400 text-center tracking-widest focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminPin(!showAdminPin)}
                      className="absolute left-3 top-3 text-slate-400 hover:text-white"
                    >
                      {showAdminPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    الرمز الافتراضي: 1234 (يملك كافة الصلاحيات والأرباح)
                  </p>
                </div>

                {/* Cashier PIN */}
                <div className="bg-[#0B1220] p-4 rounded-2xl border border-[#23324D] space-y-2">
                  <label className="block text-xs font-bold text-slate-200">
                    رمز PIN لكاشير الصيدلية (Cashier PIN)
                  </label>
                  <div className="relative">
                    <input
                      type={showCashierPin ? 'text' : 'password'}
                      maxLength="4"
                      value={settings.cashierPin}
                      onChange={(e) => handleFieldChange('cashierPin', e.target.value)}
                      className="w-full bg-[#111A2B] border border-[#23324D] focus:border-teal-400 rounded-xl pl-10 pr-3.5 py-2.5 text-base font-mono font-bold text-teal-400 text-center tracking-widest focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCashierPin(!showCashierPin)}
                      className="absolute left-3 top-3 text-slate-400 hover:text-white"
                    >
                      {showCashierPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    الرمز الافتراضي: 0000 (صلاحيات بيع كاشير فقط)
                  </p>
                </div>

              </div>

              {/* Cashier Restrictions Toggles */}
              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-300">صلاحيات وقيود الكاشير:</div>

                <div className="bg-[#0B1220] p-4 rounded-xl border border-[#23324D] flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-white">حجب رؤية صافي الأرباح عن الكاشير</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      إخفاء أسعار التكلفة وهامش الربح من شاشات الكاشير لضمان سرية أرباح الصيدلية
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.hideProfitFromCashier}
                    onChange={(e) => handleFieldChange('hideProfitFromCashier', e.target.checked)}
                    className="w-5 h-5 rounded text-teal-500 bg-[#111A2B] border-[#23324D] focus:ring-teal-400"
                  />
                </div>

                <div className="bg-[#0B1220] p-4 rounded-xl border border-[#23324D] flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-white">منع حذف الفواتير الصادرة بدون إذن المدير</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      يتطلب إدخال PIN المدير عند الرغبة في إلغاء أي فاتورة مسجلة
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.preventInvoiceDeleteByCashier}
                    onChange={(e) => handleFieldChange('preventInvoiceDeleteByCashier', e.target.checked)}
                    className="w-5 h-5 rounded text-teal-500 bg-[#111A2B] border-[#23324D] focus:ring-teal-400"
                  />
                </div>

                <div className="bg-[#0B1220] p-4 rounded-xl border border-[#23324D] flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-white">منع تعديل أسعار البيع يدوياً بالكاشير</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      الالتزام الصارم بأسعار التسعيرة الجبرية للأدوية المسجلة بالدليل
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.preventPriceChangeByCashier}
                    onChange={(e) => handleFieldChange('preventPriceChangeByCashier', e.target.checked)}
                    className="w-5 h-5 rounded text-teal-500 bg-[#111A2B] border-[#23324D] focus:ring-teal-400"
                  />
                </div>

              </div>

            </div>
          )}

          {/* TAB 6: Cloud Sync & Mobile Portal */}
          {activeTab === 'cloud' && (
            <div className="max-w-2xl space-y-6">
              <div className="text-xs font-bold text-teal-400 flex items-center gap-2 mb-2">
                <Cloud className="w-4 h-4" />
                المزامنة السحابية وبوابة متابعة الموبايل الذكية:
              </div>

              {/* Cloud Sync Toggle */}
              <div className="bg-[#0B1220] p-4 rounded-xl border border-[#23324D] flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white">المزامنة التلقائية اللحظية في الخلفية</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    رفع الفواتير وإغلاق الورديات فورياً لسحابة الصيدلية المشفرة
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.enableCloudSync}
                  onChange={(e) => handleFieldChange('enableCloudSync', e.target.checked)}
                  className="w-5 h-5 rounded text-teal-500 bg-[#111A2B] border-[#23324D] focus:ring-teal-400"
                />
              </div>

              {/* Sync Endpoint */}
              <div className="bg-[#0B1220] p-4 rounded-xl border border-[#23324D] space-y-2">
                <label className="block text-xs font-bold text-slate-200">
                  رابط سيرفر المزامنة (Sync Endpoint)
                </label>
                <input
                  type="url"
                  dir="ltr"
                  value={settings.syncEndpoint || ''}
                  onChange={(e) => handleFieldChange('syncEndpoint', e.target.value)}
                  placeholder="https://your-server.com/api/pharmacy/sync"
                  className="w-full bg-[#111A2B] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none"
                />
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  كل عملية (بيع/آجل/توريد/مرتجع/مصروف/وردية) تُسجّل في طابور محلي وتُرفع تلقائياً هنا فور عودة الإنترنت.
                  اترك الحقل فارغاً إذا كنت تعمل محلياً — سيحفظ النظام كل العمليات محلياً بدون فقدان أي بيانات.
                </p>
              </div>

              {/* Report Server Base URL (QR → hosted report page) */}
              <div className="bg-[#0B1220] p-4 rounded-xl border border-[#23324D] space-y-2">
                <label className="block text-xs font-bold text-slate-200">
                  رابط سيرفر التقارير (Report Server Base URL)
                </label>
                <input
                  type="url"
                  dir="ltr"
                  value={settings.reportBaseUrl || ''}
                  onChange={(e) => handleFieldChange('reportBaseUrl', e.target.value)}
                  placeholder="https://pharmacy-reports.<name>.workers.dev"
                  className="w-full bg-[#111A2B] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none"
                />
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  عند مسح كود QR الخاص بالوردية سيُفتح تقرير عربي منسق على الموبايل بدلاً من نص طويل.
                  ضع رابط الـ Worker هنا عشان الرابط يبقى دائم، أو اتركه فارغاً لاستخدام
                  السيرفر المحلي المدمج في نسخة الكمبيوتر تلقائياً.
                </p>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    disabled={cloudTestBusy}
                    onClick={async () => {
                      const base = String(settings.reportBaseUrl || '').trim().replace(/\/+$/, '');
                      if (!base) {
                        showToast('اكتب رابط سيرفر التقارير أولاً');
                        return;
                      }
                      setCloudTestBusy(true);
                      try {
                        const token = String(settings.reportToken || '').trim();
                        const url = `${base}/health${token ? `?token=${encodeURIComponent(token)}` : ''}`;
                        const controller = new AbortController();
                        const timer = setTimeout(() => controller.abort(), 12000);
                        const res = await fetch(url, { signal: controller.signal });
                        clearTimeout(timer);
                        if (!res.ok) {
                          showToast(`السيرفر رد بخطأ HTTP ${res.status}`);
                          return;
                        }
                        const info = await res.json().catch(() => ({}));
                        showToast(`✅ السيرفر شغال — ${info.service || 'report server'}`);
                      } catch (e) {
                        showToast(e.name === 'AbortError'
                          ? 'انتهت مهلة الاتصال بالسيرفر'
                          : 'تعذر الاتصال — تأكد من الرابط والإنترنت');
                      } finally {
                        setCloudTestBusy(false);
                      }
                    }}
                    className="px-3 py-2 rounded-lg bg-[#111A2B] hover:bg-[#17233A] border border-[#23324D] text-slate-200 text-[11px] font-bold disabled:opacity-50"
                  >
                    {cloudTestBusy ? 'جارِ الاختبار...' : 'اختبار الاتصال'}
                  </button>
                </div>

                {/* The URL that actually ends up inside the shift QR code */}
                <div className="bg-[#111A2B] border border-teal-500/25 rounded-xl p-3 space-y-1">
                  <div className="text-[11px] font-bold text-slate-200">رابط الـ QR الحالي</div>
                  <div dir="ltr" className="text-[10px] text-teal-300 font-mono break-all text-left">
                    {getPermanentReportBaseUrl() || getReportBaseUrl() || 'غير محدد — استخدم السيرفر المحلي'}
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    ده بالظبط الرابط اللي بيتقرا لما الكاميرا تمسح كود الوردية.
                    لو كان رابط دائم (workers.dev أو دومينك) يفضل شغال للأبد.
                  </p>
                </div>

                {/* Permanent cloud host (Cloudflare Worker) */}
                <div className="bg-gradient-to-r from-violet-500/10 via-[#111A2B] to-sky-500/10 border border-violet-500/30 rounded-xl p-3 space-y-2">
                  <div className="text-[11px] font-bold text-white">الرابط الدائم (Cloudflare Worker)</div>
                  <div dir="ltr" className="text-[10px] text-violet-300 font-mono break-all text-left">
                    {settings.permanentReportUrl || 'غير محدد'}
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    استضافة مجانية دائمة على Cloudflare — الداتا محفوظة ومفيش نوم،
                    وكود QR المطبوع يفضل شغال للأبد. بيتحدّث تلقائياً بعد كل وردية.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const url = String(settings.permanentReportUrl || '').trim().replace(/\/+$/, '');
                        if (!url) {
                          showToast('لا يوجد رابط دائم محفوظ');
                          return;
                        }
                        handleFieldChange('reportBaseUrl', url);
                        try {
                          localStorage.setItem(
                            'PHARMACY_SETTINGS',
                            JSON.stringify({ ...settings, reportBaseUrl: url })
                          );
                        } catch (err) {}
                        showToast('✅ تم ضبط الرابط الدائم في كود QR');
                      }}
                      className="px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-bold"
                    >
                      استخدم الرابط الدائم في QR
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const url = String(settings.permanentReportUrl || '').trim().replace(/\/+$/, '');
                        if (!url) return;
                        setCloudTestBusy(true);
                        try {
                          const token = String(settings.reportToken || '').trim();
                          const res = await fetch(`${url}/health${token ? `?token=${encodeURIComponent(token)}` : ''}`);
                          const info = await res.json().catch(() => ({}));
                          showToast(res.ok
                            ? `✅ الخادم الدائم شغال — ${info.service || 'ok'}`
                            : `الخادم الدائم رد بخطأ HTTP ${res.status}`);
                        } catch (e) {
                          showToast('تعذر الاتصال بالخادم الدائم');
                        } finally {
                          setCloudTestBusy(false);
                        }
                      }}
                      className="px-3 py-2 rounded-lg bg-[#0B1220] hover:bg-[#17233A] border border-[#23324D] text-slate-200 text-[11px] font-bold"
                    >
                      اختبار الخادم الدائم
                    </button>
                  </div>
                </div>

                {/* Permanent daily summary link — the link the owner keeps */}
                <div className="bg-[#111A2B] border border-amber-500/25 rounded-xl p-3 space-y-2">
                  <div className="text-[11px] font-bold text-white">📅 رابط ملخص اليوم الدائم (يحفظه المالك)</div>
                  <div dir="ltr" className="text-[10px] text-amber-300 font-mono break-all text-left">
                    {buildDailySummaryUrl(settings.cloudPharmacyId || 'PHARMACY-LOCAL') || 'غير محدد'}
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    صفحة تفاصيل اليوم كاملة (مبيعات، آجل، توريد، مرتجعات، إتلاف، مصروفات، جرد الدرج).
                    لو الصيدلية بدون إنترنت تعرض آخر بيانات مرفوعة مع وقت آخر مزامنة، وتُحدَّث تلقائياً فور عودة الاتصال.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const url = buildDailySummaryUrl(settings.cloudPharmacyId || 'PHARMACY-LOCAL');
                        if (url) window.open(url, '_blank');
                        else showToast('لا يوجد رابط دائم محفوظ');
                      }}
                      className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-bold"
                    >
                      فتح ملخص اليوم
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const url = buildDailySummaryUrl(settings.cloudPharmacyId || 'PHARMACY-LOCAL');
                        if (!url) {
                          showToast('لا يوجد رابط دائم محفوظ');
                          return;
                        }
                        try {
                          await navigator.clipboard.writeText(url);
                          showToast('✅ تم نسخ رابط ملخص اليوم');
                        } catch (e) {
                          showToast('تعذر نسخ الرابط');
                        }
                      }}
                      className="px-3 py-2 rounded-lg bg-[#0B1220] hover:bg-[#17233A] border border-[#23324D] text-slate-200 text-[11px] font-bold"
                    >
                      نسخ الرابط
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    رمز حماية التقارير (اختياري — REPORT_TOKEN)
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={settings.reportToken || ''}
                    onChange={(e) => handleFieldChange('reportToken', e.target.value)}
                    placeholder="اتركه فارغاً للاستخدام المحلي"
                    className="w-full bg-[#111A2B] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none"
                  />
                </div>

                <div className="bg-[#111A2B] border border-teal-500/25 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-200">السيرفر المحلي المدمج</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${reportServerInfo?.running ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' : 'text-slate-400 border-[#23324D] bg-[#0B1220]'}`}>
                      {reportServerInfo?.running ? `يعمل على المنفذ ${reportServerInfo.port}` : 'غير متاح في المتصفح'}
                    </span>
                  </div>
                  {reportServerInfo?.lanUrl && (
                    <div dir="ltr" className="text-[10px] text-teal-300 font-mono text-left break-all">
                      {reportServerInfo.lanUrl}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const base = (reportServerInfo?.lanUrl || getReportPreviewBaseUrl() || '').replace(/\/+$/, '');
                        if (!base) {
                          showToast('السيرفر المحلي غير متاح — شغّل التطبيق على الكمبيوتر أولاً');
                          return;
                        }
                        handleFieldChange('reportBaseUrl', base);
                        handleFieldChange('syncEndpoint', `${base}/api/pharmacy/sync`);
                        showToast('تم ضبط سيرفر التقارير والمزامنة المحلي بنجاح');
                      }}
                      className="flex-1 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 text-[11px] font-bold"
                    >
                      استخدام السيرفر المحلي
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const liveUrl = buildLiveReportsUrl(settings.cloudPharmacyId || 'PHARMACY-LOCAL');
                        if (liveUrl) window.open(liveUrl, '_blank');
                        else showToast('لا يوجد سيرفر تقارير متاح حالياً');
                      }}
                      className="flex-1 py-2 rounded-lg bg-[#0B1220] hover:bg-[#17233A] border border-[#23324D] text-slate-200 text-[11px] font-bold"
                    >
                      فتح صفحة التقارير
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    السيرفر يعمل تلقائياً داخل نسخة الكمبيوتر ويستقبل كل عمليات الوردية محلياً.
                    تأكد من السماح لـ Node.js في جدار الحماية أول مرة، وأن الموبايل على نفس شبكة الواي فاي.
                  </p>
                </div>

                {/* --- FREE PUBLIC TUNNEL (Cloudflare, no account) --- */}
                <div className="mt-4 bg-gradient-to-r from-violet-500/10 via-[#111A2B] to-sky-500/10 border border-violet-500/30 rounded-xl p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-white flex items-center gap-2">
                      <Globe className="w-4 h-4 text-violet-400" />
                      رابط عام مجاني (نفق Cloudflare) — بدون حساب
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${tunnelState?.running ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' : 'text-slate-400 border-[#23324D] bg-[#0B1220]'}`}>
                      {tunnelState?.running ? 'مفتوح 🌍' : 'مغلق'}
                    </span>
                  </div>

                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    افتح نفقاً عاماً مجانياً من Cloudflare (بدون تسجيل ولا بطاقة) فيصبح كود QR
                    يفتح تقرير الوردية من <b className="text-white">أي مكان في العالم</b> — حتى لو
                    الصيدلية ليست على نفس الواي فاي. الرابط مؤقت ويتغير عند إعادة التشغيل.
                  </p>

                  {tunnelState?.url && (
                    <div className="bg-[#0B1220] border border-emerald-500/30 rounded-lg p-2.5 flex items-center justify-between gap-2">
                      <span dir="ltr" className="text-[11px] text-emerald-300 font-mono truncate">
                        {tunnelState.url}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyTunnelUrl}
                        className="shrink-0 p-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300"
                        title="نسخ الرابط"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!settings.useCloudflareTunnel}
                      onChange={async (e) => {
                        const enabled = e.target.checked;
                        // Persist immediately — the QR builder reads the
                        // setting straight from localStorage.
                        const next = { ...settings, useCloudflareTunnel: enabled };
                        handleFieldChange('useCloudflareTunnel', enabled);
                        try {
                          localStorage.setItem('PHARMACY_SETTINGS', JSON.stringify(next));
                        } catch (err) {}
                        showToast(enabled
                          ? 'تم تفعيل الرابط العام في كود QR'
                          : 'تم الرجوع إلى الرابط المحلي في كود QR');

                        // Turning it on while no tunnel is running: open it
                        // right away so the QR code is usable immediately.
                        if (enabled && !tunnelState?.running && isTunnelSupported()) {
                          await handleStartTunnel();
                        }
                      }}
                      className="w-4 h-4 rounded text-violet-500 bg-[#0B1220] border-[#23324D] focus:ring-violet-400"
                    />
                    <span className="text-[11px] text-slate-300">
                      استخدم هذا الرابط العام في كود QR للوردية
                    </span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.autoStartTunnel !== false}
                      onChange={(e) => {
                        const enabled = e.target.checked;
                        handleFieldChange('autoStartTunnel', enabled);
                        try {
                          localStorage.setItem(
                            'PHARMACY_SETTINGS',
                            JSON.stringify({ ...settings, autoStartTunnel: enabled })
                          );
                        } catch (err) {}
                        showToast(enabled
                          ? 'سيُفتح النفق تلقائياً مع تشغيل البرنامج'
                          : 'لن يُفتح النفق تلقائياً — افتحه يدوياً من الإعدادات');
                      }}
                      className="w-4 h-4 rounded text-violet-500 bg-[#0B1220] border-[#23324D] focus:ring-violet-400"
                    />
                    <span className="text-[11px] text-slate-300">
                      افتح النفق تلقائياً عند تشغيل البرنامج (مهم لكود QR المطبوع)
                    </span>
                  </label>

                  {tunnelDownload.active && (
                    <div className="w-full h-2 rounded-full bg-[#0B1220] overflow-hidden border border-[#23324D]">
                      <div
                        className="h-full bg-gradient-to-l from-violet-500 to-sky-500 transition-all"
                        style={{ width: `${Math.max(4, tunnelDownload.percent || 0)}%` }}
                      />
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {!tunnelState?.available && (
                      <button
                        type="button"
                        disabled={tunnelBusy}
                        onClick={handleDownloadCloudflared}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0B1220] hover:bg-[#17233A] border border-[#23324D] text-slate-200 text-[11px] font-bold disabled:opacity-50"
                      >
                        <Download className="w-3.5 h-3.5" />
                        تنزيل برنامج النفق (مرة واحدة)
                      </button>
                    )}

                    {tunnelState?.running ? (
                      <button
                        type="button"
                        disabled={tunnelBusy}
                        onClick={handleStopTunnel}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-200 text-[11px] font-bold disabled:opacity-50"
                      >
                        <Radio className="w-3.5 h-3.5" />
                        إيقاف النفق
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={tunnelBusy || !isTunnelSupported()}
                        onClick={handleStartTunnel}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-bold disabled:opacity-50"
                      >
                        <Globe className="w-3.5 h-3.5" />
                        {tunnelBusy ? 'جاري الفتح...' : 'افتح رابطاً عاماً مجانياً'}
                      </button>
                    )}

                    {tunnelState?.url && (
                      <button
                        type="button"
                        onClick={() => {
                          const url = `${tunnelState.url}/?pharmacyId=${encodeURIComponent(settings.cloudPharmacyId || 'PHARMACY-LOCAL')}`;
                          window.open(url, '_blank');
                        }}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0B1220] hover:bg-[#17233A] border border-[#23324D] text-slate-200 text-[11px] font-bold"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        فتح البوابة العامة
                      </button>
                    )}
                  </div>

                  {!isTunnelSupported() && (
                    <p className="text-[10px] text-amber-400/80">
                      النفق العام متاح في نسخة سطح المكتب (الملف exe) فقط.
                    </p>
                  )}
                </div>
              </div>

              {/* Live Sync Status */}
              <div className="bg-[#111A2B] p-4 rounded-xl border border-teal-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <RefreshCw className={`w-4 h-4 text-teal-400 ${syncRunning ? 'animate-spin' : ''}`} />
                    حالة المزامنة الحالية
                  </span>
                  <button
                    type="button"
                    disabled={syncRunning}
                    onClick={async () => {
                      setSyncRunning(true);
                      try {
                        const res = await sqliteService.triggerAutoSync();
                        await refreshSyncStatus();
                        setToastMessage(res?.success
                          ? (res.offline
                            ? `تم الرفع محلياً — ${res.cloudPending || 0} عملية بانتظار عودة الإنترنت للرفع السحابي`
                            : (res.mode === 'CLOUD' ? `تم رفع ${res.uploaded} عملية للسحابة` : 'تمت المزامنة المحلية بنجاح'))
                          : 'تعذر الرفع للسحابة، سيعيد النظام المحاولة تلقائياً');
                      } catch (e) {
                        setToastMessage('فشلت المزامنة، البيانات محفوظة محلياً');
                      } finally {
                        setSyncRunning(false);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 text-[11px] font-bold disabled:opacity-50"
                  >
                    مزامنة الآن
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center">
                  <div className="bg-[#0B1220] rounded-xl p-2.5 border border-[#23324D]">
                    <div className="text-[10px] text-slate-400">الاتصال</div>
                    <div className={`text-xs font-bold ${syncStatus?.online ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {syncStatus?.online ? 'متصل' : 'أوفلاين'}
                    </div>
                  </div>
                  <div className="bg-[#0B1220] rounded-xl p-2.5 border border-[#23324D]">
                    <div className="text-[10px] text-slate-400">عمليات معلّقة</div>
                    <div className="text-xs font-bold text-amber-300 font-mono">{syncStatus?.pending ?? 0}</div>
                  </div>
                  <div className="bg-[#0B1220] rounded-xl p-2.5 border border-[#23324D]">
                    <div className="text-[10px] text-slate-400">فشل الرفع</div>
                    <div className="text-xs font-bold text-rose-300 font-mono">{syncStatus?.failed ?? 0}</div>
                  </div>
                  <div className="bg-[#0B1220] rounded-xl p-2.5 border border-[#23324D]">
                    <div className="text-[10px] text-slate-400">آخر مزامنة محلية</div>
                    <div className="text-[11px] font-bold text-teal-300 font-mono">
                      {syncStatus?.lastSyncedAt
                        ? new Date(syncStatus.lastSyncedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </div>
                  </div>
                  <div className="bg-[#0B1220] rounded-xl p-2.5 border border-[#23324D]">
                    <div className="text-[10px] text-slate-400">بانتظار رفع السحابة</div>
                    <div className={`text-xs font-bold font-mono ${(syncStatus?.cloudPending ?? 0) > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
                      {syncStatus?.cloudPending ?? 0}
                    </div>
                  </div>
                  <div className="bg-[#0B1220] rounded-xl p-2.5 border border-[#23324D]">
                    <div className="text-[10px] text-slate-400">آخر رفع سحابي</div>
                    <div className="text-[11px] font-bold text-emerald-300 font-mono">
                      {syncStatus?.lastCloudSyncedAt
                        ? new Date(syncStatus.lastCloudSyncedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  «بانتظار رفع السحابة» = عمليات محفوظة على جهازك ينتظرها الرفع إلى الخادم الدائم.
                  لو الصيدلية بدون إنترنت ستزيد الرقم، وكل شيء مرفوع تلقائياً فور عودة الاتصال.
                </p>
              </div>

              {/* Cloud Pharmacy ID */}
              <div className="bg-[#0B1220] p-5 rounded-2xl border border-[#23324D] space-y-3">
                <span className="text-xs font-bold text-slate-300 block">
                  معرّف الصيدلية السحابي (Pharmacy Cloud ID):
                </span>
                <div className="p-3 bg-[#111A2B] rounded-xl border border-[#23324D] font-mono font-bold text-white text-center">
                  {settings.cloudPharmacyId}
                </div>
              </div>

              {/* Report portal + full backfill */}
              <div className="bg-gradient-to-r from-teal-500/10 via-[#111A2B] to-emerald-500/10 border border-teal-500/30 rounded-2xl p-5 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-bold text-white mb-1">بوابة التقارير لمتابعة الورديات من الهاتف:</div>
                  <div className="text-xs text-slate-400 mb-3">
                    صفحة تفاعلية بها كل الورديات، تفتح من أي موبايل على نفس الواي فاي (أو من أي مكان مع سيرفر سحابي)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const liveUrl = buildLiveReportsUrl(settings.cloudPharmacyId || 'PHARMACY-LOCAL');
                        if (liveUrl) window.open(liveUrl, '_blank');
                        else showToast('لا يوجد سيرفر تقارير متاح حالياً');
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-500 text-slate-950 font-bold text-xs shadow-lg hover:bg-teal-400 transition-colors"
                    >
                      <span>فتح بوابة التقارير</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const url = buildDailySummaryUrl(settings.cloudPharmacyId || 'PHARMACY-LOCAL');
                        if (url) window.open(url, '_blank');
                        else showToast('لا يوجد سيرفر تقارير متاح حالياً');
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0B1220] hover:bg-[#17233A] border border-teal-500/40 text-teal-200 font-bold text-xs transition-colors"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>ملخص اليوم</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const url = buildMonthlySummaryUrl(settings.cloudPharmacyId || 'PHARMACY-LOCAL');
                        if (url) window.open(url, '_blank');
                        else showToast('لا يوجد سيرفر تقارير متاح حالياً');
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0B1220] hover:bg-[#17233A] border border-teal-500/40 text-teal-200 font-bold text-xs transition-colors"
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      <span>ملخص الشهر</span>
                    </button>
                    <button
                      type="button"
                      disabled={syncRunning}
                      onClick={async () => {
                        setSyncRunning(true);
                        try {
                          const res = await sqliteService.backfillReportSnapshot();
                          if (res?.success) {
                            showToast(`تم رفع ${res.shifts || 0} وردية و${res.invoices || 0} فاتورة للتقارير`);
                          } else {
                            showToast(res?.error || 'تعذر رفع التقارير — تأكد من إعداد السيرفر');
                          }
                        } catch (e) {
                          showToast('فشل رفع التقارير، البيانات محفوظة محلياً');
                        } finally {
                          setSyncRunning(false);
                        }
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0B1220] hover:bg-[#17233A] border border-teal-500/40 text-teal-200 font-bold text-xs transition-colors disabled:opacity-50"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>رفع كامل للتقارير (كل الورديات)</span>
                    </button>
                  </div>
                </div>

                <div className="w-24 h-24 bg-white p-2 rounded-xl shadow-lg border border-teal-500/30 flex items-center justify-center shrink-0">
                  <QrCode className="w-20 h-20 text-slate-900" />
                </div>
              </div>

              {/* Program auto-updater */}
              <div className="bg-[#0B1220] p-4 rounded-xl border border-[#23324D] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <RefreshCw className={`w-4 h-4 text-teal-400 ${updateBusy ? 'animate-spin' : ''}`} />
                    تحديثات البرنامج تلقائياً
                  </span>
                  <span className="text-[10px] font-mono text-teal-300 px-2 py-0.5 rounded-full border border-teal-500/30 bg-teal-500/10">
                    v{appInfo?.version || '1.0.0'}
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    رابط حزمة التحديثات (Update Feed URL)
                  </label>
                  <input
                    type="url"
                    dir="ltr"
                    value={settings.updateFeedUrl || ''}
                    onChange={(e) => handleFieldChange('updateFeedUrl', e.target.value)}
                    placeholder="http://192.168.1.20:4100/updates/"
                    className="w-full bg-[#111A2B] border border-[#23324D] focus:border-teal-400 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                    اتركه فارغاً ليستخدم سيرفر التقارير المحلي (تحديث داخل شبكة الصيدلية بدون إنترنت).
                    للنشر السحابي ارفع محتويات مجلد <span className="font-mono">server/updates</span> إلى السيرفر السحابي واكتب رابطه هنا.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={updateBusy}
                    onClick={handleCheckUpdates}
                    className="px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-[11px] font-bold disabled:opacity-50"
                  >
                    {updateBusy ? 'جاري الفحص...' : 'تحقق من التحديثات'}
                  </button>
                  <button
                    type="button"
                    disabled={updateBusy || updateState.status !== 'available'}
                    onClick={handleDownloadUpdate}
                    className="px-4 py-2 rounded-xl bg-[#17233A] hover:bg-[#202E4C] border border-[#23324D] text-slate-200 text-[11px] font-bold disabled:opacity-40"
                  >
                    تحميل التحديث
                  </button>
                  <button
                    type="button"
                    disabled={updateState.status !== 'downloaded'}
                    onClick={handleInstallUpdate}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold disabled:opacity-40"
                  >
                    تثبيت الآن
                  </button>
                </div>

                {updateState.status === 'downloading' && (
                  <div className="w-full h-2 rounded-full bg-[#111A2B] overflow-hidden border border-[#23324D]">
                    <div
                      className="h-full bg-gradient-to-l from-teal-500 to-emerald-500 transition-all"
                      style={{ width: `${Math.max(4, updateState.progress || 0)}%` }}
                    />
                  </div>
                )}

                <div className="text-[11px] text-slate-400 leading-relaxed">
                  {updateState.status === 'downloaded'
                    ? '✅ التحديث جاهز — اضغط «تثبيت الآن» أو سيُثبَّت تلقائياً عند إغلاق البرنامج.'
                    : updateState.message || 'لم يتم التحقق من التحديثات بعد.'}
                </div>
              </div>

            </div>
          )}

        </div>

      </div>

      {/* ======================================================== */}
      {/* REVOKE & DEACTIVATE CONFIRMATION MODAL                   */}
      {/* ======================================================== */}
      {showRevokeModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111A2B] border border-rose-500/40 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            
            <div className="flex items-center gap-3 text-rose-400">
              <div className="w-12 h-12 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center shrink-0">
                <AlertOctagon className="w-6 h-6 text-rose-400" />
              </div>
              <div>
                <h4 className="text-base font-black text-white">تأكيد إلغاء وتجريد ترخيص هذا الجهاز</h4>
                <p className="text-xs text-rose-400 font-semibold">إجراء رقابي حاسم وخاص بالإدارة والمطور</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200 leading-relaxed">
              ⚠️ تحذير: سيتم فوراً مسح مفتاح الترخيص من قاعدة البيانات وتسجيل الجهاز كجهاز ملغي (Revoked)، وسيتم قفل النظام فوراً وإعادته لشاشة التفعيل الإجبارية لمنع العميل من الدخول نهائياً.
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-200">
                أدخل رمز PIN للمدير أو المطور لتأكيد الإلغاء:
              </label>
              <input
                type="password"
                maxLength="6"
                value={revokePinInput}
                onChange={(e) => {
                  setRevokePinInput(e.target.value);
                  setRevokeError('');
                }}
                placeholder="****"
                className="w-full bg-[#0B1220] border border-[#23324D] focus:border-rose-400 rounded-xl px-4 py-3 text-center text-lg text-white font-mono tracking-widest focus:outline-none"
                autoFocus
              />
              {revokeError && (
                <div className="text-xs font-bold text-rose-400 text-center">
                  {revokeError}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowRevokeModal(false);
                  setRevokePinInput('');
                  setRevokeError('');
                }}
                className="flex-1 py-2.5 rounded-xl bg-[#17233A] hover:bg-[#23324D] text-slate-300 text-xs font-bold transition-all"
              >
                إلغاء التراجع
              </button>

              <button
                type="button"
                onClick={handleConfirmRevoke}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black shadow-lg shadow-rose-900/40 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Ban className="w-4 h-4" />
                <span>تأكيد الإلغاء والقفل 🚫</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
