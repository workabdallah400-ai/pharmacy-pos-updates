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
  Link2,
  PackagePlus,
  FileWarning
} from 'lucide-react';
import { DEFAULT_SETTINGS } from '../data/mockSettings';
import { playBarcodeBeep, playCashDrawerSound } from '../utils/sound';
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
import { isValidPhone } from '../utils/validation';
import { digitsOnly, nameInput, phoneInput } from '../utils/inputGuards';
import { notifyPharmacyIdentityUpdated } from '../utils/pharmacyIdentity';

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

  const [activeTab, setActiveTab] = useState(initialTab === 'cloud' || initialTab === 'security' ? 'receipt' : initialTab); // 'receipt', 'hardware', 'backup', 'users', 'audit', 'updates'
  const [toastMessage, setToastMessage] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);
  const [enteredLicenseKey, setEnteredLicenseKey] = useState(settings.licenseKey || '');
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncRunning, setSyncRunning] = useState(false);
  const [reportServerInfo, setReportServerInfo] = useState(null);
  const [appInfo, setAppInfo] = useState({
    version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.5.5',
    packaged: false
  });
  const [updateState, setUpdateState] = useState({ status: 'idle', message: '', progress: 0, version: null });
  const [updateBusy, setUpdateBusy] = useState(false);
  const [tunnelState, setTunnelState] = useState({ url: '', running: false, available: false, supported: false });
  const [tunnelBusy, setTunnelBusy] = useState(false);
  const [tunnelDownload, setTunnelDownload] = useState({ percent: 0, active: false });
  const [cloudTestBusy, setCloudTestBusy] = useState(false);
  const [sqliteRestore, setSqliteRestore] = useState({
    busy: false,
    progress: 0,
    copied: 0,
    total: 0,
    info: null,
    backups: [],
    error: ''
  });
  // Counts from the LIVE database, so the preview can warn when the chosen
  // backup is older and would drop newer invoices/shifts.
  const [currentDataCounts, setCurrentDataCounts] = useState(null);
  const restoreSummary = sqliteRestore.info?.summary || null;
  const backupOlderThanLive = !!(
    sqliteRestore.info &&
    sqliteRestore.info.kind !== 'estock' &&
    currentDataCounts &&
    (Number(sqliteRestore.info.counts?.invoices || 0) < currentDataCounts.invoices ||
      Number(sqliteRestore.info.counts?.shifts || 0) < currentDataCounts.shifts ||
      Number(sqliteRestore.info.counts?.purchases || 0) < currentDataCounts.purchases ||
      Number(sqliteRestore.info.counts?.expenses || 0) < currentDataCounts.expenses)
  );

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
  
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
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

  // Load settings from SQLite on mount
  useEffect(() => {
    sqliteService.getSettings().then((s) => {
      if (s) {
        setSettings((prev) => ({ ...prev, ...s }));
        if (s.pharmacyName && onUpdatePharmacyName) {
          onUpdatePharmacyName(s.pharmacyName);
        }
      }
    }).catch(() => {});
  }, []);

  const handleFieldChange = (field, value) => {
    let clean = value;
    if (field === 'phone' || field === 'hotline') clean = phoneInput(value);
    else if (field === 'pharmacyName' || field === 'pharmacyBranch') clean = nameInput(value);
    else if (field === 'taxNumber' || field === 'commercialRegister') clean = digitsOnly(value, 20);
    setSettings((prev) => ({ ...prev, [field]: clean }));
    // Notify the shell OUTSIDE the state updater. Calling the parent setState
    // from inside setSettings' updater triggered React's
    // "Cannot update a component while rendering a different component" warning.
    if (field === 'pharmacyName' && onUpdatePharmacyName) {
      onUpdatePharmacyName(clean);
    }
  };

  const handleSaveAll = async () => {
    const pharmacyName = String(settings.pharmacyName || '').trim();
    if (!pharmacyName) {
      showToast('اسم الصيدلية إجباري لأنه يُطبع على كل فاتورة وإيصال.');
      return;
    }

    const phone = String(settings.phone || '').trim();
    const hotline = String(settings.hotline || '').trim();
    if (phone && !isValidPhone(phone)) {
      showToast('رقم هاتف الصيدلية غير صحيح. أدخل 7 إلى 15 رقماً.');
      return;
    }
    if (hotline && !isValidPhone(hotline)) {
      showToast('رقم الخط الساخن غير صحيح. أدخل 7 إلى 15 رقماً.');
      return;
    }

    const cleanSettings = {
      ...settings,
      pharmacyName,
      phone,
      hotline
    };

    try {
      localStorage.setItem('PHARMACY_SETTINGS', JSON.stringify(cleanSettings));
      await sqliteService.saveSettings(cleanSettings);
      setSettings(cleanSettings);
      if (onUpdatePharmacyName) {
        onUpdatePharmacyName(pharmacyName);
      }
      // Refresh the header branding (name + branch + phone/tax) without a reload.
      notifyPharmacyIdentityUpdated();
      showToast('تم حفظ كافة الإعدادات والخيارات وهوية الصيدلية بنجاح ✓');
      playBarcodeBeep();
    } catch (e) {
      notifyPharmacyIdentityUpdated();
      showToast('تم الحفظ محلياً');
    }
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
      const res = await checkForUpdates();
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
      if (res?.success) {
        showToast('تم تحميل التحديث — سيتم تثبيته وإعادة تشغيل البرنامج الآن…');
        await installUpdate();
      } else {
        showToast(res?.error || 'تعذر تحميل التحديث');
      }
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

      const content = JSON.stringify(backupPayload, null, 2);

      // In the packaged Electron app use the native "Save As" dialog: writing
      // the file directly avoids the browser download path that silently
      // produced a 0-byte file for multi-megabyte Blobs on some Windows PCs.
      if (typeof window !== 'undefined' && window.require) {
        try {
          const { ipcRenderer } = window.require('electron');
          const res = await ipcRenderer.invoke('backup:save-json', { filename, content });
          if (res?.success) {
            showToast(`تم حفظ نسخة احتياطية كاملة في: [${res.fileName}] 💾`);
            playCashDrawerSound();
            return;
          }
          if (res?.canceled) {
            showToast('تم إلغاء حفظ النسخة الاحتياطية.');
            return;
          }
        } catch (ipcErr) {
          console.warn('Native backup save failed, falling back to download:', ipcErr);
        }
      }

      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      // The anchor must be in the document for large blobs, and the object URL
      // must stay alive until the browser has finished reading it. Revoking it
      // immediately after click() produced a 0-byte download for the 8MB DB.
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try { URL.revokeObjectURL(url); } catch (e) {}
        try { a.remove(); } catch (e) {}
      }, 60_000);

      showToast(`تم أخذ نسخة احتياطية كاملة لقاعدة البيانات وتنزيلها: [${filename}] 💾`);
      playCashDrawerSound();
    } catch (e) {
      console.error('Backup failed:', e);
      showToast('حدث خطأ أثناء أخذ النسخة الاحتياطية');
    }
  };

  // 4. Restore Database from JSON
  const handleRestoreBackup = (e) => {    const file = e.target.files?.[0];
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

  /* ----------------------------------------------------------------------- *
   * 4b. Restore from an SQLite backup (.bak / .db) — any size.
   * The file never travels through the renderer: the main process validates
   * it, stores a safety snapshot and copies it in chunks with progress.
   * ----------------------------------------------------------------------- */

  const sqliteIpc = () => {
    try {
      if (typeof window !== 'undefined' && window.require) {
        return window.require('electron').ipcRenderer;
      }
    } catch (e) {}
    return null;
  };

  const refreshLocalBackups = async () => {
    const ipc = sqliteIpc();
    if (!ipc) return;
    try {
      const res = await ipc.invoke('backup:list-local');
      if (res?.ok) {
        setSqliteRestore((prev) => ({ ...prev, backups: res.files || [] }));
      }
    } catch (e) {
      // listing older snapshots is best-effort only
    }
  };

  const refreshCurrentDataCounts = async () => {
    try {
      setCurrentDataCounts(await sqliteService.getDataCounts());
    } catch (e) {
      setCurrentDataCounts(null);
    }
  };

  useEffect(() => {
    if (activeTab === 'backup') {
      refreshLocalBackups();
      refreshCurrentDataCounts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handlePickSqliteBackup = async () => {
    const ipc = sqliteIpc();
    if (!ipc) {
      showToast('الاستعادة من ملف .bak متاحة في نسخة الديسكتوب فقط');
      return;
    }
    setSqliteRestore((prev) => ({ ...prev, error: '', progress: 0 }));
    try {
      const res = await ipc.invoke('backup:pick-sqlite');
      if (!res || res.canceled) return;
      if (!res.ok) {
        setSqliteRestore((prev) => ({ ...prev, info: null, error: res.error || 'تعذر قراءة الملف' }));
        showToast(res.error || 'تعذر قراءة الملف');
        return;
      }
      setSqliteRestore((prev) => ({ ...prev, info: res.info, error: '' }));
      refreshCurrentDataCounts();
    } catch (e) {
      setSqliteRestore((prev) => ({ ...prev, error: e.message }));
    }
  };

  const handleInspectLocalBackup = async (backupPath) => {
    const ipc = sqliteIpc();
    if (!ipc) return;
    setSqliteRestore((prev) => ({ ...prev, error: '', progress: 0 }));
    try {
      const res = await ipc.invoke('backup:inspect-sqlite', backupPath);
      if (!res?.ok) {
        setSqliteRestore((prev) => ({ ...prev, info: null, error: res?.error || 'تعذر قراءة النسخة' }));
        showToast(res?.error || 'تعذر قراءة النسخة');
        return;
      }
      setSqliteRestore((prev) => ({ ...prev, info: res.info, error: '' }));
      refreshCurrentDataCounts();
    } catch (e) {
      setSqliteRestore((prev) => ({ ...prev, error: e.message }));
    }
  };

  const handleCancelSqliteRestore = () => {
    setSqliteRestore((prev) => ({ ...prev, info: null, error: '', progress: 0, copied: 0, total: 0 }));
  };

  const handleConfirmEStockImport = async () => {
    const ipc = sqliteIpc();
    const info = sqliteRestore.info;
    if (!ipc || !info || sqliteRestore.busy) return;

    const ok = window.confirm(
      `تأكيد استيراد بيانات eStock من:\n${info.name}\n\n` +
        `الأصناف: ${Number(info.counts?.medicines || 0).toLocaleString('en-US')}\n` +
        `أصناف بها رصيد: ${Number(info.counts?.productsInStock || 0).toLocaleString('en-US')}\n` +
        `التشغيلات: ${Number(info.counts?.batches || 0).toLocaleString('en-US')}\n\n` +
        'سيتم دمج البيانات مع الكتالوج الحالي (لن تُحذف بياناتك).'
    );
    if (!ok) return;

    setSqliteRestore((prev) => ({ ...prev, busy: true, progress: 0, copied: 0, total: info.size || 0, error: '' }));

    const onProgress = (_event, payload) => {
      if (!payload) return;
      setSqliteRestore((prev) => {
        const total = Number(payload.total || prev.total || 0);
        const copied = Number(payload.copied || 0);
        return {
          ...prev,
          copied,
          total,
          progress: total > 0 ? Math.min(100, Math.round((copied / total) * 100)) : 0
        };
      });
    };

    ipc.on('backup:restore-progress', onProgress);
    try {
      const res = await ipc.invoke('backup:read-estock-catalog', info.catalogPath);
      if (!res?.ok || !res.payload) {
        setSqliteRestore((prev) => ({ ...prev, busy: false, error: res?.error || 'تعذر قراءة بيانات eStock' }));
        showToast(res?.error || 'تعذر قراءة بيانات eStock');
        return;
      }

      setSqliteRestore((prev) => ({ ...prev, progress: 45 }));
      const stats = await sqliteService.importExternalCatalog(res.payload);
      setSqliteRestore((prev) => ({ ...prev, busy: false, progress: 100 }));
      setCatalogImport({
        fileName: info.name,
        payload: null,
        preview: null,
        working: false,
        done: stats,
        error: ''
      });
      showToast(
        `تم استيراد eStock: ${Number(stats.addedProducts || 0).toLocaleString('en-US')} صنف جديد، ` +
          `${Number(stats.restoredStock || 0).toLocaleString('en-US')} صنف بأرصدة، ` +
          `${Number(stats.addedBatches || 0).toLocaleString('en-US')} تشغيلة ✓`
      );
      playCashDrawerSound();
      setTimeout(() => window.location.reload(), 2000);
    } catch (e) {
      console.error('eStock import failed:', e);
      setSqliteRestore((prev) => ({ ...prev, busy: false, error: e?.message || 'فشل استيراد بيانات eStock' }));
      showToast(e?.message || 'فشل استيراد بيانات eStock');
    } finally {
      ipc.removeListener('backup:restore-progress', onProgress);
    }
  };

  const handleConfirmSqliteRestore = async () => {
    const ipc = sqliteIpc();
    const info = sqliteRestore.info;
    if (!ipc || !info || sqliteRestore.busy) return;

    const medicines = info.counts?.medicines;
    const detail = medicines != null ? ` (${Number(medicines).toLocaleString('en-US')} صنف)` : '';
    const summary = info.summary;
    const salesDetail = summary
      ? `\nالمبيعات: ${Number(summary.invoices || 0).toLocaleString('en-US')} فاتورة` +
        ` · الورديات: ${Number(summary.shifts || 0).toLocaleString('en-US')}` +
        ` · الأرباح: ${Number(summary.profit || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} ج.م`
      : '';
    const olderWarning = backupOlderThanLive
      ? `\n\n⚠️ هذه النسخة أقدم من بياناتك الحالية (${Number(currentDataCounts?.invoices || 0).toLocaleString('en-US')} فاتورة و${Number(currentDataCounts?.shifts || 0).toLocaleString('en-US')} وردية حالياً).`
      : '';
    const ok = window.confirm(
      `تأكيد استعادة قاعدة البيانات من:\n${info.name}${detail}${salesDetail}\n\n` +
        'سيتم أخذ نسخة أمان من القاعدة الحالية أولاً، ثم استبدالها بالكامل.\n' +
        'ستُفقد أي بيانات أحدث من النسخة المختارة.' +
        olderWarning
    );
    if (!ok) return;

    setSqliteRestore((prev) => ({ ...prev, busy: true, progress: 0, copied: 0, total: info.size || 0, error: '' }));

    const onProgress = (_event, payload) => {
      if (!payload) return;
      setSqliteRestore((prev) => {
        const total = Number(payload.total || prev.total || 0);
        const copied = Number(payload.copied || 0);
        return {
          ...prev,
          copied,
          total,
          progress: total > 0 ? Math.min(100, Math.round((copied / total) * 100)) : 0
        };
      });
    };

    ipc.on('backup:restore-progress', onProgress);
    try {
      // Persist the newest state first, then stop this renderer from writing
      // its (now stale) in-memory copy over the file being restored.
      try { await sqliteService.flushToDisk(); } catch (e) {}
      sqliteService.suspendPersistence();

      const res = await ipc.invoke('backup:restore-sqlite', info.path);
      if (!res?.ok) {
        sqliteService.resumePersistence();
        setSqliteRestore((prev) => ({ ...prev, busy: false, error: res?.error || 'فشلت الاستعادة' }));
        showToast(res?.error || 'فشلت الاستعادة');
        return;
      }
      showToast(`تمت الاستعادة من ${res.sourceName} — جارٍ إعادة التشغيل...`);
      playCashDrawerSound();
      setTimeout(() => window.location.reload(), 1600);
    } catch (e) {
      sqliteService.resumePersistence();
      setSqliteRestore((prev) => ({ ...prev, busy: false, error: e.message }));
    } finally {
      ipc.removeListener('backup:restore-progress', onProgress);
    }
  };

  // 5. Import an external catalogue (eStock converter output) — merge only missing items
  const [catalogImport, setCatalogImport] = useState({
    fileName: '',
    payload: null,
    preview: null,
    working: false,
    done: null,
    error: ''
  });

  const handleCatalogFileChosen = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCatalogImport({ fileName: file.name, payload: null, preview: null, working: true, done: null, error: '' });
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        const payload = data?.catalog || data;
        if (!payload || !Array.isArray(payload.products)) {
          throw new Error('الملف لا يحتوي على بيانات أصناف صالحة');
        }
        const preview = await sqliteService.importExternalCatalog(payload, { dryRun: true });
        setCatalogImport({ fileName: file.name, payload, preview, working: false, done: null, error: '' });
      } catch (err) {
        console.error('Catalog preview failed:', err);
        setCatalogImport({
          fileName: file.name, payload: null, preview: null, working: false, done: null,
          error: err?.message || 'تعذّر قراءة ملف الاستيراد'
        });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCatalogImportConfirm = async () => {
    const { payload, fileName } = catalogImport;
    if (!payload) return;
    setCatalogImport((prev) => ({ ...prev, working: true, error: '' }));
    try {
      const stats = await sqliteService.importExternalCatalog(payload);
      setCatalogImport({ fileName, payload: null, preview: null, working: false, done: stats, error: '' });
      showToast(`تم الاستيراد: ${stats.addedProducts} صنف جديد، ${stats.updatedProducts || 0} محدَّث، ${stats.addedSuppliers} مورد ✓`);
      playCashDrawerSound();
    } catch (err) {
      console.error('Catalog import failed:', err);
      setCatalogImport((prev) => ({
        ...prev, working: false, error: err?.message || 'فشل الاستيراد'
      }));
    }
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
    { id: 'users', label: 'إدارة المستخدمين والحسابات', icon: Shield, permission: 'canManageUsers' },
    { id: 'audit', label: 'سجل العمليات والتدقيق (Audit Log)', icon: Eye, permission: 'canViewAuditLog' },
    { id: 'updates', label: 'تحديثات البرنامج', icon: RefreshCw }
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
                v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : (appInfo?.version || '1.0.0')}
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
        <div className="flex flex-wrap border-b border-[#23324D] bg-[#17233A]/60 px-4 py-2 gap-2 shrink-0">
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
                      required
                      maxLength={80}
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

              {/* Restore from an SQLite backup (.bak / .db) */}
              <div className="bg-[#0B1220] p-4 rounded-2xl border border-[#23324D] space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-teal-400" />
                      استعادة من نسخة احتياطية (PharmacyPOS أو eStock)
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                      نسخة PharmacyPOS (‎.db) تُستعاد كاملة مع أخذ نسخة أمان أولاً — وتشمل
                      المبيعات والورديات والفواتير والأرباح والمشتريات والمصروفات والعملاء.
                      أما نسخة eStock القديمة (SQL Server ‎.bak) فيتم قراءة الأصناف والأرصدة والصلاحيات والموردين والعملاء
                      منها ودمجها مع بياناتك الحالية دون حذف المبيعات أو الورديات.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handlePickSqliteBackup}
                    disabled={sqliteRestore.busy}
                    className="shrink-0 px-4 py-2.5 rounded-xl bg-teal-500/15 border border-teal-500/40 hover:border-teal-400 text-teal-300 text-[11px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    اختيار ملف .bak
                  </button>
                </div>

                {sqliteRestore.error && (
                  <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-300 text-[11px] font-bold p-3 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{sqliteRestore.error}</span>
                  </div>
                )}

                {sqliteRestore.info && !sqliteRestore.busy && (
                  <div className="rounded-xl border border-teal-500/40 bg-teal-500/5 p-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-bold text-white truncate" title={sqliteRestore.info.path}>
                        {sqliteRestore.info.name}
                      </div>
                      <span className="shrink-0 text-[10px] font-mono text-slate-400">
                        {sqliteRestore.info.sizeText}
                      </span>
                    </div>

                    {sqliteRestore.info.kind === 'estock' ? (
                      <>
                        <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[10.5px] leading-relaxed p-2.5">
                          نسخة eStock قديمة (SQL Server). سيتم دمج الأصناف والأرصدة والصلاحيات والموردين والعملاء
                          مع بياناتك الحالية — لن تُحذف أو تُستبدل أي بيانات موجودة،
                          وتبقى مبيعاتك ووردياتك وفواتيرك وأرباحك كما هي.
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] text-slate-300">
                          <div>
                            الأصناف:{' '}
                            <b className="text-teal-300">
                              {Number(sqliteRestore.info.counts?.medicines || 0).toLocaleString('en-US')}
                            </b>
                          </div>
                          <div>
                            أصناف بها رصيد:{' '}
                            <b className="text-teal-300">
                              {Number(sqliteRestore.info.counts?.productsInStock || 0).toLocaleString('en-US')}
                            </b>
                          </div>
                          <div>
                            التشغيلات/الصلاحيات:{' '}
                            <b className="text-white">
                              {Number(sqliteRestore.info.counts?.batches || 0).toLocaleString('en-US')}
                            </b>
                          </div>
                          <div>
                            الموردون:{' '}
                            <b className="text-white">
                              {Number(sqliteRestore.info.counts?.suppliers || 0).toLocaleString('en-US')}
                            </b>
                          </div>
                          <div>
                            العملاء:{' '}
                            <b className="text-white">
                              {Number(sqliteRestore.info.counts?.customers || 0).toLocaleString('en-US')}
                            </b>
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {sqliteRestore.info.modifiedAt
                              ? new Date(sqliteRestore.info.modifiedAt).toLocaleString('ar-EG')
                              : '—'}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={handleConfirmEStockImport}
                            disabled={sqliteRestore.busy}
                            className="px-4 py-2 rounded-xl bg-teal-500/15 border border-teal-500/40 hover:border-teal-400 text-teal-300 text-[11px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            تأكيد استيراد بيانات eStock
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelSqliteRestore}
                            className="px-4 py-2 rounded-xl bg-[#111A2B] border border-[#23324D] hover:border-slate-400 text-slate-300 text-[11px] font-bold transition-all"
                          >
                            إلغاء
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] text-slate-300">
                          <div>
                            الأدوية:{' '}
                            <b className="text-teal-300">
                              {sqliteRestore.info.counts?.medicines != null
                                ? Number(sqliteRestore.info.counts.medicines).toLocaleString('en-US')
                                : '—'}
                            </b>
                          </div>
                          <div>
                            الفواتير (المبيعات):{' '}
                            <b className="text-white">
                              {sqliteRestore.info.counts?.invoices != null
                                ? Number(sqliteRestore.info.counts.invoices).toLocaleString('en-US')
                                : '—'}
                            </b>
                          </div>
                          <div>
                            الورديات:{' '}
                            <b className="text-white">
                              {sqliteRestore.info.counts?.shifts != null
                                ? Number(sqliteRestore.info.counts.shifts).toLocaleString('en-US')
                                : '—'}
                            </b>
                          </div>
                          <div>
                            المشتريات:{' '}
                            <b className="text-white">
                              {sqliteRestore.info.counts?.purchases != null
                                ? Number(sqliteRestore.info.counts.purchases).toLocaleString('en-US')
                                : '—'}
                            </b>
                          </div>
                          <div>
                            المصروفات:{' '}
                            <b className="text-white">
                              {sqliteRestore.info.counts?.expenses != null
                                ? Number(sqliteRestore.info.counts.expenses).toLocaleString('en-US')
                                : '—'}
                            </b>
                          </div>
                          <div>
                            إجمالي الأرباح المسجلة:{' '}
                            <b className="text-emerald-300">
                              {restoreSummary
                                ? `${Number(restoreSummary.profit || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} ج.م`
                                : '—'}
                            </b>
                          </div>
                          <div>
                            العملاء:{' '}
                            <b className="text-white">
                              {sqliteRestore.info.counts?.customers != null
                                ? Number(sqliteRestore.info.counts.customers).toLocaleString('en-US')
                                : '—'}
                            </b>
                          </div>
                          <div>
                            المستخدمون:{' '}
                            <b className="text-white">
                              {sqliteRestore.info.counts?.app_users != null
                                ? Number(sqliteRestore.info.counts.app_users).toLocaleString('en-US')
                                : '—'}
                            </b>
                          </div>
                          <div className="col-span-2 text-[10px] text-slate-400">
                            آخر فاتورة في النسخة:{' '}
                            {restoreSummary?.lastInvoiceAt
                              ? new Date(restoreSummary.lastInvoiceAt).toLocaleString('ar-EG')
                              : 'لا توجد مبيعات مسجلة'}
                            {' · '}
                            آخر تعديل للملف:{' '}
                            {sqliteRestore.info.modifiedAt
                              ? new Date(sqliteRestore.info.modifiedAt).toLocaleString('ar-EG')
                              : '—'}
                            {sqliteRestore.info.integrity && sqliteRestore.info.integrity !== 'skipped'
                              ? ` · فحص السلامة: ${sqliteRestore.info.integrity}`
                              : ''}
                          </div>
                        </div>

                        {backupOlderThanLive && (
                          <div className="rounded-lg bg-rose-500/10 border border-rose-500/40 text-rose-200 text-[11px] leading-relaxed p-2.5">
                            <b>⚠️ هذه النسخة أقدم من بياناتك الحالية.</b>{' '}
                            بها {Number(sqliteRestore.info.counts?.invoices || 0).toLocaleString('en-US')} فاتورة
                            و{Number(sqliteRestore.info.counts?.shifts || 0).toLocaleString('en-US')} وردية،
                            بينما قاعدة البيانات الحالية بها {Number(currentDataCounts?.invoices || 0).toLocaleString('en-US')} فاتورة
                            و{Number(currentDataCounts?.shifts || 0).toLocaleString('en-US')} وردية.
                            الاستعادة ستستبدل القاعدة الحالية وتفقد أي مبيعات أو ورديات أو مشتريات
                            أو مصروفات أحدث منها. لو تقصد استرجاع الأصناف فقط، استخدم استيراد eStock بدلاً منها.
                          </div>
                        )}

                        {(sqliteRestore.info.blocking || []).map((msg, i) => (
                          <div key={`block-${i}`} className="text-[11px] font-bold text-rose-300 flex items-start gap-2">
                            <AlertOctagon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>{msg}</span>
                          </div>
                        ))}
                        {(sqliteRestore.info.warnings || []).map((msg, i) => (
                          <div key={`warn-${i}`} className="text-[11px] text-amber-300 flex items-start gap-2">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>{msg}</span>
                          </div>
                        ))}

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={handleConfirmSqliteRestore}
                            disabled={(sqliteRestore.info.blocking || []).length > 0}
                            className="px-4 py-2 rounded-xl bg-rose-500/15 border border-rose-500/40 hover:border-rose-400 text-rose-300 text-[11px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            تأكيد الاستعادة واستبدال القاعدة الحالية
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelSqliteRestore}
                            className="px-4 py-2 rounded-xl bg-[#111A2B] border border-[#23324D] hover:border-slate-400 text-slate-300 text-[11px] font-bold transition-all"
                          >
                            إلغاء
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {sqliteRestore.busy && (
                  <div className="rounded-xl border border-teal-500/40 bg-teal-500/5 p-3 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold text-teal-300">
                      <span className="flex items-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        جارٍ معالجة النسخة الاحتياطية...
                      </span>
                      <span className="font-mono">{sqliteRestore.progress}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-[#111A2B] overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 transition-all"
                        style={{ width: `${sqliteRestore.progress}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {(sqliteRestore.copied / (1024 * 1024)).toFixed(1)} MB /{' '}
                      {(sqliteRestore.total / (1024 * 1024)).toFixed(1)} MB
                    </div>
                  </div>
                )}

                {sqliteRestore.backups.length > 0 && (
                  <div className="space-y-2 pt-1 border-t border-[#1B2940]">
                    <div className="flex items-center justify-between pt-2">
                      <div className="text-[11px] font-bold text-slate-300">
                        نسخ تلقائية موجودة على هذا الجهاز
                      </div>
                      <button
                        type="button"
                        onClick={refreshLocalBackups}
                        className="text-[10px] font-bold text-slate-400 hover:text-teal-300 flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" />
                        تحديث
                      </button>
                    </div>
                    <div className="max-h-44 overflow-auto space-y-1.5 pl-1">
                      {sqliteRestore.backups.map((b) => (
                        <div
                          key={b.path}
                          className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-[#111A2B] border border-[#23324D]"
                        >
                          <div className="min-w-0">
                            <div className="text-[10.5px] text-slate-200 font-mono truncate" title={b.name}>
                              {b.name}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {new Date(b.modifiedAt).toLocaleString('ar-EG')} · {b.sizeText}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleInspectLocalBackup(b.path)}
                            className="shrink-0 px-2.5 py-1 rounded-md border border-[#2E4162] hover:border-teal-400 text-[10px] font-bold text-slate-300 hover:text-teal-300"
                          >
                            استعادة
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* External Catalogue Import (eStock converter output) */}
              <div className="bg-[#0B1220] p-4 rounded-2xl border border-[#23324D] space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      <PackagePlus className="w-4 h-4 text-teal-400" />
                      استيراد كتالوج من برنامج آخر (eStock)
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                      يضيف الأصناف والباركود والموردين غير الموجودين عندك، ويحدّث أسعار وتعبئة الأصناف المتشابهة.
                      لا يضيف أرصدة ولا دفعات مخزون — الكتالوج فقط.
                    </p>
                  </div>
                  <label className="shrink-0 px-3.5 py-2 rounded-xl bg-teal-500/15 border border-teal-500/40 hover:border-teal-400 text-teal-300 text-xs font-bold cursor-pointer flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" />
                    اختيار ملف
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleCatalogFileChosen}
                      className="hidden"
                      disabled={catalogImport.working}
                    />
                  </label>
                </div>

                {catalogImport.fileName && (
                  <div className="text-[11px] text-slate-300 font-mono bg-[#111A2B] border border-[#23324D] rounded-lg px-3 py-2 truncate">
                    {catalogImport.fileName}
                  </div>
                )}

                {catalogImport.working && (
                  <div className="flex items-center gap-2 text-xs text-teal-300">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    جارٍ التحليل...
                  </div>
                )}

                {catalogImport.error && (
                  <div className="flex items-start gap-2 text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
                    <FileWarning className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{catalogImport.error}</span>
                  </div>
                )}

                {catalogImport.preview && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                      {[
                        { label: 'أصناف جديدة', value: catalogImport.preview.addedProducts, tone: 'text-emerald-300' },
                        { label: 'أصناف ستُحدَّث', value: catalogImport.preview.updatedProducts, tone: 'text-amber-300' },
                        { label: 'موردون جدد', value: catalogImport.preview.addedSuppliers, tone: 'text-cyan-300' },
                        { label: 'إجمالي الملف', value: catalogImport.preview.totalInFile, tone: 'text-slate-300' }
                      ].map((s) => (
                        <div key={s.label} className="bg-[#111A2B] border border-[#23324D] rounded-xl py-2">
                          <div className={`text-base font-black font-mono ${s.tone}`}>
                            {Number(s.value || 0).toLocaleString('en-US')}
                          </div>
                          <div className="text-[10px] text-slate-400">{s.label}</div>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleCatalogImportConfirm}
                        className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 text-slate-950 text-xs font-black hover:brightness-110 transition-all"
                      >
                        تأكيد الاستيراد ({Number(catalogImport.preview.addedProducts || 0).toLocaleString('en-US')} جديد · {Number(catalogImport.preview.updatedProducts || 0).toLocaleString('en-US')} تحديث)
                      </button>
                      <button
                        type="button"
                        onClick={() => setCatalogImport({ fileName: '', payload: null, preview: null, working: false, done: null, error: '' })}
                        className="px-4 py-2.5 rounded-xl bg-[#111A2B] border border-[#23324D] text-slate-300 text-xs font-bold hover:border-slate-500"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                )}

                {catalogImport.done && (
                  <div className="text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2 leading-relaxed">
                    تم الاستيراد بنجاح: أُضيف {Number(catalogImport.done.addedProducts || 0).toLocaleString('en-US')} صنفاً،
                    وحُدِّث {Number(catalogImport.done.updatedProducts || 0).toLocaleString('en-US')} صنفاً،
                    و{Number(catalogImport.done.addedSuppliers || 0).toLocaleString('en-US')} مورداً.
                  </div>
                )}
              </div>

            </div>
          )}
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

          {/* TAB 5: Hardware & Cashier Restrictions */}
          {activeTab === 'hardware' && (
            <div className="max-w-3xl space-y-6">
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
                      يتطلب صلاحية المدير عند الرغبة في إلغاء أي فاتورة مسجلة
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

          {/* TAB 6: App Updates */}
          {activeTab === 'updates' && (
            <div className="max-w-2xl space-y-6">
              <div className="bg-[#0B1220] p-6 rounded-2xl border border-[#23324D] space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-[#23324D]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-teal-500/15 text-teal-400 border border-teal-500/30 flex items-center justify-center">
                      <RefreshCw className={`w-5 h-5 ${updateBusy ? 'animate-spin' : ''}`} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">تحديثات برنامج صيدليتي</div>
                      <div className="text-xs text-slate-400">فحص وتنزيل أحدث التحديثات السحابية عبر GitHub بنقرة واحدة</div>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-teal-300 px-3 py-1 rounded-full border border-teal-500/30 bg-teal-500/10">
                    الإصدار الحالي: v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : (appInfo?.version || '1.5.1')}
                  </span>
                </div>

                <div className="bg-[#111A2B] p-4 rounded-xl border border-[#23324D] space-y-2">
                  <div className="text-xs font-bold text-slate-300">مستودع التحديثات المعتمد (GitHub Releases):</div>
                  <div className="font-mono text-xs text-teal-400" dir="ltr">workabdallah400-ai/pharmacy-pos-updates</div>
                  <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
                    البرنامج يفحص GitHub تلقائياً عند التشغيل وكل دقيقة. عند توفر إصدار جديد يظهر هنا، وبالضغط على التحميل يتم تثبيته ثم إغلاق البرنامج وإعادة تشغيله تلقائياً.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={updateBusy}
                    onClick={handleCheckUpdates}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-2 shadow-lg shadow-teal-500/20 disabled:opacity-50 transition-all"
                  >
                    <RefreshCw className={`w-4 h-4 ${updateBusy ? 'animate-spin' : ''}`} />
                    <span>{updateBusy ? 'جاري الفحص الآن...' : 'فحص آخر تحديث (Check for Updates)'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={updateBusy || updateState.status !== 'available'}
                    onClick={handleDownloadUpdate}
                    className="px-5 py-2.5 rounded-xl bg-[#17233A] hover:bg-[#202E4C] border border-[#23324D] text-slate-200 text-xs font-bold disabled:opacity-40 transition-all"
                  >
                    تحميل التحديث
                  </button>
                  <button
                    type="button"
                    disabled={updateState.status !== 'downloaded'}
                    onClick={handleInstallUpdate}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-40 transition-all"
                  >
                    تثبيت التحديث وإعادة التشغيل الآن
                  </button>
                </div>

                {updateState.status === 'downloading' && (
                  <div className="w-full h-2.5 rounded-full bg-[#111A2B] overflow-hidden border border-[#23324D]">
                    <div
                      className="h-full bg-gradient-to-l from-teal-500 to-emerald-500 transition-all"
                      style={{ width: `${Math.max(4, updateState.progress || 0)}%` }}
                    />
                  </div>
                )}

                <div className="p-3.5 rounded-xl bg-[#111A2B] border border-[#23324D] text-xs text-slate-300 flex items-center gap-2">
                  <span className="text-teal-400 font-bold">الحالة:</span>
                  <span>
                    {updateState.status === 'downloaded'
                      ? '✅ التحديث جاهز ومُحمَّل بنجاح — انقر فوق «تثبيت التحديث وإعادة التشغيل الآن».'
                      : updateState.message || 'أنت على أحدث إصدار معتمد ✓'}
                  </span>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
