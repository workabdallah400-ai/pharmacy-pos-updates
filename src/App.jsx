import { ErrorBoundary } from './components/ErrorBoundary';
import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, Bell, X } from 'lucide-react';
import { LoginScreen } from './components/LoginScreen';
import { TopHeader } from './components/TopHeader';
import { Sidebar } from './components/Sidebar';
import { POSView } from './components/POSView';
import { ProductsView } from './components/ProductsView';
import { PurchasesView } from './components/PurchasesView';
import { ShortagesView } from './components/ShortagesView';
import { ExpiryView } from './components/ExpiryView';
import { CustomersView } from './components/CustomersView';
import { ShiftsView } from './components/ShiftsView';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';
import { PlaceholderView } from './components/PlaceholderView';
import { ActivationScreen } from './components/ActivationScreen';
import { FirstRunSetupScreen } from './components/FirstRunSetupScreen';
import { OpenShiftModal } from './components/OpenShiftModal';
import { ConfirmHost } from './components/ConfirmDialog';
import { checkLicenseStatus } from './utils/licenseManager';
import {
  initReportServer,
  readSettings,
  setTunnelUrl,
  claimCloudIdentity,
  ensureCloudToken
} from './utils/reportServer';
import {
  getTunnelState,
  startTunnel,
  downloadCloudflared,
  isTunnelSupported,
  onTunnelUrl
} from './utils/tunnel';
import { checkForUpdates, downloadUpdate, installUpdate, onUpdateStatus } from './utils/updater';
import { sqliteService } from './db/sqliteService';
import { hasPermission } from './utils/permissions';
import { INITIAL_MEDICINES } from './data/mockMedicines';
import { INITIAL_SUPPLIERS, INITIAL_PURCHASES } from './data/mockPurchases';

// Deep-link support: `#tab=settings&settingsTab=cloud` opens that screen
// directly. Handy for support, for bookmarks and for quick access from a
// browser (the desktop app normally starts on the POS screen).
const VALID_TABS = [
  'pos', 'products', 'purchases', 'shortages', 'expiry',
  'customers', 'shifts', 'reports', 'settings'
];
const VALID_SETTINGS_TABS = [
  'receipt', 'hardware', 'backup', 'license', 'users', 'security', 'cloud'
];

function resolveDeepLinkTab() {
  try {
    const hash = String(window.location.hash || '');
    const m = /[#&]tab=([a-z]+)/i.exec(hash);
    if (m && VALID_TABS.includes(m[1].toLowerCase())) return m[1].toLowerCase();
  } catch (e) {}
  return '';
}

function resolveDeepLinkSettingsTab() {
  try {
    const hash = String(window.location.hash || '');
    const m = /[#&]settingsTab=([a-z]+)/i.exec(hash);
    if (m && VALID_SETTINGS_TABS.includes(m[1].toLowerCase())) return m[1].toLowerCase();
  } catch (e) {}
  return '';
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState(() => resolveDeepLinkTab() || 'pos');
  const [pendingPurchaseData, setPendingPurchaseData] = useState(null);
  
  // Shifts State
  const [currentShift, setCurrentShift] = useState(() => {
    try {
      const saved = localStorage.getItem('PHARMACY_ACTIVE_SHIFT');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed) return parsed;
      }
    } catch (e) {}
    return null;
  });
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false);

  // Discover the embedded LAN report server (Electron) as early as possible,
  // so the sync engine can point at it and shift QRs open the hosted report.
  useEffect(() => {
    initReportServer()
      .then((info) => {
        if (typeof window !== 'undefined' && info) {
          window.dispatchEvent(new CustomEvent('pharmacy:report-server-ready', { detail: info }));
        }
      })
      .catch(() => {});
  }, []);

  // --- Cloud identity ------------------------------------------------------
  // Every installation owns its pharmacy id and its own token on the
  // permanent cloud host, so two pharmacies never share a report.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      ensureCloudToken();
      const res = await claimCloudIdentity().catch(() => null);
      if (cancelled || !res) return;
      if (res.ok) {
        // The cloud copy may be missing (new machine) — push the database.
        setTimeout(() => {
          sqliteService.refreshCloudReports().catch(() => {});
        }, 4000);
      }
    };
    const timer = setTimeout(run, 2500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // --- Auto-start the free public Cloudflare tunnel -----------------------
  // When the pharmacy chose the public URL for the shift QR code, the tunnel
  // must be alive as soon as the app starts — otherwise a printed QR code
  // would point to a dead address. The tunnel URL is re-resolved every time
  // the main process announces a new public URL.
  useEffect(() => {
    let cancelled = false;

    const off = onTunnelUrl((url) => {
      setTunnelUrl(url);
      initReportServer(true).catch(() => {});
    });

    const run = async () => {
      const settings = readSettings();
      if (!settings.useCloudflareTunnel) return;
      if (settings.autoStartTunnel === false) return;
      if (!isTunnelSupported()) return;
      // A permanent cloud host (Worker / VPS) is already configured — the
      // temporary quick tunnel is not needed and would only waste traffic.
      if (String(settings.reportBaseUrl || '').trim()) return;
      if (String(settings.permanentReportUrl || '').trim()) return;

      const state = await getTunnelState().catch(() => null);
      if (cancelled) return;
      if (state && state.running && state.url) {
        setTunnelUrl(state.url);
        await initReportServer(true).catch(() => {});
        return;
      }

      // First launch on this machine: fetch the small Cloudflare helper
      // once (53 MB) so the tunnel can open without any manual step.
      if (!state || !state.available) {
        const dl = await downloadCloudflared().catch(() => null);
        if (cancelled) return;
        if (!dl || !dl.ok) return;
      }

      const res = await startTunnel().catch(() => null);
      if (cancelled || !res || !res.ok) return;
      setTunnelUrl(res.url);
      await initReportServer(true).catch(() => {});
    };

    // Give the embedded report server a moment to boot before the tunnel
    // points at its port.
    const timer = setTimeout(run, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (typeof off === 'function') off();
    };
  }, []);

  // --- Silent auto-update check -----------------------------------------
  const [updateBanner, setUpdateBanner] = useState(null);

  // Keep the hosted reports fresh (every 60 min). Free cloud tiers wipe their
  // disk when they sleep, so the pharmacy PC periodically re-pushes a full
  // snapshot — that is what makes the public QR link always work.
  useEffect(() => {
    let settings = {};
    try {
      settings = JSON.parse(localStorage.getItem('PHARMACY_SETTINGS') || '{}') || {};
    } catch (e) {}
    if (settings.enableCloudSync === false) return undefined;

    // A permanent cloud host (the Cloudflare Worker) gets a fresh snapshot
    // every 15 minutes; the local LAN server can wait an hour.
    const remoteReport = String(settings.reportBaseUrl || settings.permanentReportUrl || '').trim();
    sqliteService.startHeartbeat(remoteReport ? 15 * 60 * 1000 : 60 * 60 * 1000);
    // Also refresh shortly after start-up so a restarted PC restores the
    // cloud copy without waiting for the next heartbeat.
    const initial = setTimeout(() => {
      claimCloudIdentity().catch(() => {});
      sqliteService.refreshCloudReports().catch(() => {});
    }, 15000);

    // The internet came back → push everything that was waiting in the
    // outbox right now, so the owner sees the new numbers immediately.
    const handleOnline = () => {
      claimCloudIdentity().catch(() => {});
      sqliteService.refreshCloudReports().catch(() => {});
    };
    window.addEventListener('online', handleOnline);

    return () => {
      clearTimeout(initial);
      window.removeEventListener('online', handleOnline);
      sqliteService.stopHeartbeat();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let settings = {};
    try {
      settings = JSON.parse(localStorage.getItem('PHARMACY_SETTINGS') || '{}') || {};
    } catch (e) {}
    if (settings.autoCheckUpdates === false) return undefined;

    const run = async () => {
      const info = await initReportServer().catch(() => null);
      const configured = String(settings.updateFeedUrl || '').trim();
      const feed = configured || (info && info.autoBase ? `${info.autoBase}/updates/` : '');
      if (!feed) return;
      const res = await checkForUpdates(feed);
      if (!cancelled && res && res.available) {
        setUpdateBanner({ version: res.version });
      }
    };
    run();

    const off = onUpdateStatus((payload) => {
      if (payload && payload.status === 'available' && !cancelled) {
        setUpdateBanner({ version: payload.version });
      }
    });
    return () => {
      cancelled = true;
      if (typeof off === 'function') off();
    };
  }, []);

  const handleApplyUpdate = async () => {
    await downloadUpdate();
    await installUpdate();
  };

  const updateBannerNode = updateBanner ? (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] bg-gradient-to-l from-teal-600 to-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-2xl border border-teal-300/40 flex items-center gap-3 text-xs font-bold animate-fadeIn">
      <span>⬆️ يتوفر تحديث جديد للبرنامج {updateBanner.version ? `v${updateBanner.version}` : ''}</span>
      <button
        type="button"
        onClick={handleApplyUpdate}
        className="px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-[11px] font-bold"
      >
        تحميل وتثبيت الآن
      </button>
      <button
        type="button"
        onClick={() => setUpdateBanner(null)}
        className="px-2 py-1 rounded-lg hover:bg-white/20 text-[11px]"
      >
        ✕
      </button>
    </div>
  ) : null;

  // Sync Shift from SQLite on initial load
  useEffect(() => {
    let isCurrent = true;
    sqliteService.getCurrentShift().then((shift) => {
      // The database is the source of truth: a shift restored from
      // localStorage must not keep the POS "open" after a DB reset/restore.
      if (isCurrent) setCurrentShift(shift || null);
    }).catch(() => {});
    return () => { isCurrent = false; };
  }, []);

  // Persist Shift to localStorage
  useEffect(() => {
    try {
      if (currentShift) {
        localStorage.setItem('PHARMACY_ACTIVE_SHIFT', JSON.stringify(currentShift));
      } else {
        localStorage.removeItem('PHARMACY_ACTIVE_SHIFT');
      }
    } catch (e) {}
  }, [currentShift]);

  const handleOpenShift = async (newShift) => {
    try {
      await sqliteService.openShift(newShift);
    } catch (e) {
      console.warn('SQLite open shift error:', e);
    }
    setCurrentShift(newShift);
    localStorage.setItem('PHARMACY_ACTIVE_SHIFT', JSON.stringify(newShift));
    setShowOpenShiftModal(false);
  };

  // Startup License & Activation Guard State
  const [licenseInfo, setLicenseInfo] = useState(null);
  const [isCheckingLicense, setIsCheckingLicense] = useState(true);
  const [settingsInitialTab, setSettingsInitialTab] = useState(() => resolveDeepLinkSettingsTab() || 'receipt');
  const [setupState, setSetupState] = useState(null);
  const [isCheckingSetup, setIsCheckingSetup] = useState(true);

  // Check Setup State (Needs owner account creation?)
  const refreshSetupState = async () => {
    try {
      const state = await sqliteService.getSetupState();
      setSetupState(state);
    } catch (e) {
      console.warn('Setup state error:', e);
    } finally {
      setIsCheckingSetup(false);
    }
  };

  useEffect(() => {
    refreshSetupState();
  }, []);



  // Check License on Application Startup
  useEffect(() => {
    let isCurrent = true;
    const verifyLicense = async () => {
      try {
        const info = await checkLicenseStatus();
        if (isCurrent) {
          setLicenseInfo(info);
        }
      } catch (err) {
        console.warn('License verification error:', err);
      } finally {
        if (isCurrent) setIsCheckingLicense(false);
      }
    };

    verifyLicense();
    return () => { isCurrent = false; };
  }, []);

  const [pharmacyName, setPharmacyName] = useState(() => {
    try {
      const saved = localStorage.getItem('PHARMACY_SETTINGS');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.pharmacyName) return parsed.pharmacyName;
      }
    } catch (e) {}
    return 'صيدلية النخبة الحديثة';
  });

  // Sync pharmacy name & settings from SQLite DB on boot
  useEffect(() => {
    sqliteService.getSettings().then((s) => {
      if (s && s.pharmacyName) {
        setPharmacyName(s.pharmacyName);
      }
    }).catch(() => {});
  }, []);

  // 1. Shared Master Medicines State (Clean 0 items)
  const [medicines, setMedicines] = useState([]);
  const [hasUnreadShortages, setHasUnreadShortages] = useState(false);
  const [shortageToast, setShortageToast] = useState(null); // { id, message }
  const prevMedicineStockMap = useRef(new Map());
  const isInitialMedsLoad = useRef(true);

  // Load the full medicine catalog from SQLite so shared views
  // (shortages, purchases, reports) always see the real quantities.
  const reloadMedicinesFromDb = async () => {
    try {
      const rows = await sqliteService.getAllMedicines(100000);
      if (Array.isArray(rows)) {
        // Detect items that just crossed/reached the reorder_level
        if (!isInitialMedsLoad.current && prevMedicineStockMap.current.size > 0) {
          const newlyShort = [];
          for (const med of rows) {
            const reorder = Number(med.reorder_level != null ? med.reorder_level : 3);
            const currentBoxes = Number(med.stock_boxes) || 0;
            const prevBoxes = prevMedicineStockMap.current.get(med.id);
            if (prevBoxes !== undefined && prevBoxes > reorder && currentBoxes <= reorder) {
              newlyShort.push(med);
            }
          }
          if (newlyShort.length > 0) {
            const first = newlyShort[0];
            const name = first.trade_name_ar || first.trade_name;
            const msg = newlyShort.length === 1
              ? `المنتج [${name}] وصل إلى حد الطلب وتم إضافته إلى كشكول النواقص`
              : `المنتج [${name}] و (${newlyShort.length - 1}) أصناف أخرى وصلت إلى حد الطلب وتم إضافتها إلى كشكول النواقص`;
            
            setShortageToast({ id: Date.now(), message: msg });
            setHasUnreadShortages(true);
          }
        }

        // Update tracking map
        const newMap = new Map();
        for (const m of rows) {
          newMap.set(m.id, Number(m.stock_boxes) || 0);
        }
        prevMedicineStockMap.current = newMap;
        isInitialMedsLoad.current = false;

        setMedicines(rows);
      }
    } catch (e) {
      console.warn('Failed to load medicines from SQLite:', e);
    }
  };

  // Clear red shortage badge when navigating to shortages tab
  const handleSelectTab = (tabId) => {
    if (tabId === 'shortages') {
      setHasUnreadShortages(false);
    }
    setActiveTab(tabId);
  };

  // Auto-dismiss shortage toast after 7 seconds
  useEffect(() => {
    if (shortageToast) {
      const timer = setTimeout(() => {
        setShortageToast(null);
      }, 7000);
      return () => clearTimeout(timer);
    }
  }, [shortageToast]);

  useEffect(() => {
    reloadMedicinesFromDb();
  }, []);

  // 2. Shared Suppliers State
  const [suppliers, setSuppliers] = useState(() => {
    try {
      const saved = localStorage.getItem('PHARMACY_SUPPLIERS_LIST');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return [];
  });

  // 3. Shared Purchases Invoices State
  const [purchases, setPurchases] = useState(() => {
    try {
      const saved = localStorage.getItem('PHARMACY_PURCHASES_LIST');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return [];
  });

  // Sync Suppliers & Purchases from SQLite on startup
  useEffect(() => {
    let isCurrent = true;
    sqliteService.getSuppliers().then((dbSups) => {
      if (isCurrent && dbSups && dbSups.length > 0) {
        setSuppliers(dbSups);
      }
    }).catch(console.warn);

    sqliteService.getPurchases().then((dbPurchases) => {
      if (isCurrent && dbPurchases && dbPurchases.length > 0) {
        setPurchases(dbPurchases);
      }
    }).catch(console.warn);

    return () => { isCurrent = false; };
  }, []);

  useEffect(() => {
    try {
      if (suppliers.length > 0) {
        localStorage.setItem('PHARMACY_SUPPLIERS_LIST', JSON.stringify(suppliers));
      } else {
        localStorage.removeItem('PHARMACY_SUPPLIERS_LIST');
      }
    } catch (e) {}
  }, [suppliers]);

  useEffect(() => {
    try {
      if (purchases.length > 0) {
        localStorage.setItem('PHARMACY_PURCHASES_LIST', JSON.stringify(purchases));
      } else {
        localStorage.removeItem('PHARMACY_PURCHASES_LIST');
      }
    } catch (e) {}
  }, [purchases]);

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    try {
      sqliteService.setCurrentUser(user);
    } catch (e) {}
    // Respect a deep-linked screen (e.g. #tab=settings&settingsTab=cloud).
    setActiveTab(resolveDeepLinkTab() || 'pos');
  };

  // Only admins (or users explicitly granted settings access) may open Settings.
  const canManageSettings = hasPermission(currentUser, 'canManageSettings');

  const handleOpenLicenseSettings = () => {
    if (!canManageSettings) return;
    setSettingsInitialTab('license');
    setActiveTab('settings');
  };

  const handleLogout = () => {
    try {
      sqliteService.clearCurrentUser();
    } catch (e) {}
    setCurrentUser(null);
  };

  // Save / Add / Update Medicine from ProductsView
  const handleSaveMedicine = (savedMedicine) => {
    setMedicines((prev) => {
      const index = prev.findIndex((m) => m.id === savedMedicine.id);
      if (index > -1) {
        const updated = [...prev];
        updated[index] = savedMedicine;
        return updated;
      } else {
        return [savedMedicine, ...prev];
      }
    });
  };

  // Delete Medicine from ProductsView
  const handleDeleteMedicine = (id) => {
    setMedicines((prev) => prev.filter((m) => m.id !== id));
  };

  // Save New Purchase Supply Invoice & Augment Stock in Real-time!
  const handleSavePurchase = async (newInvoice) => {
    // 1. Persist to SQLite first (source of truth). Abort UI updates on failure.
    await sqliteService.savePurchase(newInvoice);

    // 2. Add to purchases list (refresh from DB so aliases/items are consistent)
    try {
      const dbPurchases = await sqliteService.getPurchases();
      setPurchases(dbPurchases && dbPurchases.length > 0 ? dbPurchases : [newInvoice]);
    } catch (e) {
      setPurchases((prev) => [newInvoice, ...prev]);
    }

    // 3. Augment Stock in Medicines Catalog
    setMedicines((prevMeds) => {
      const copy = [...prevMeds];
      newInvoice.items.forEach((item) => {
        const idx = copy.findIndex((m) => m.id === item.medicine_id);
        if (idx > -1) {
          const med = { ...copy[idx] };
          const addedBoxes = item.quantity + (item.bonus || 0);
          med.stock_boxes = (med.stock_boxes || 0) + addedBoxes;
          if (item.price_box > 0) med.price_box = item.price_box;
          copy[idx] = med;
        }
      });
      return copy;
    });

    // 4. Ensure supplier in state & increase debt balance if credit
    setSuppliers((prevSups) => {
      const exists = prevSups.some((s) => s.id === newInvoice.supplier_id || s.name === newInvoice.supplier_name);
      if (exists) {
        if (newInvoice.payment_method === 'آجل') {
          return prevSups.map((s) => {
            if (s.id === newInvoice.supplier_id || s.name === newInvoice.supplier_name) {
              return { ...s, balance: (s.balance || 0) + newInvoice.net_total };
            }
            return s;
          });
        }
        return prevSups;
      } else {
        const newSup = {
          id: newInvoice.supplier_id || Date.now(),
          name: newInvoice.supplier_name,
          contact_person: 'مسؤول التوريد',
          phone: '',
          balance: newInvoice.payment_method === 'آجل' ? newInvoice.net_total : 0
        };
        return [...prevSups, newSup];
      }
    });
  };

  // Pay Supplier Debt
  const handlePaySupplier = (supplierId, amount) => {
    const target = suppliers.find((s) => s.id === supplierId);
    if (target?.name) {
      sqliteService.adjustSupplierBalanceByName(target.name, -Math.abs(amount)).catch(console.warn);
    }
    setSuppliers((prevSups) =>
      prevSups.map((s) => {
        if (s.id === supplierId) {
          const newBal = Math.max(0, s.balance - amount);
          return { ...s, balance: newBal };
        }
        return s;
      })
    );
  };

  // Convert Shortage items directly to a new Purchase invoice!
  const handleConvertToPurchase = (shortageItems, companyFilter) => {
    // Determine supplier id
    let matchedSupplier = suppliers[0];
    if (companyFilter && companyFilter !== 'ALL') {
      const found = suppliers.find((s) => s.name.includes(companyFilter));
      if (found) matchedSupplier = found;
    } else if (shortageItems[0]?.preferred_supplier) {
      const found = suppliers.find((s) => s.name.includes(shortageItems[0].preferred_supplier));
      if (found) matchedSupplier = found;
    }

    // Convert shortage items into purchase line items
    const purchaseLines = shortageItems.map((item) => {
      const unitPrice = item.price_box || 40;
      const discount = 25.0; // standard 25% pharmacist margin
      const netUnit = unitPrice * (1 - discount / 100);
      const qty = item.order_quantity || 5;

      return {
        medicine_id: typeof item.id === 'number' ? item.id : null,
        trade_name_ar: item.trade_name_ar || item.trade_name,
        trade_name: item.trade_name,
        quantity: qty,
        bonus: 0,
        price_box: unitPrice,
        discount_pct: discount,
        net_box_price: parseFloat(netUnit.toFixed(2)),
        total_net: parseFloat((qty * netUnit).toFixed(2)),
        batch_no: `BCH-${Math.floor(1000 + Math.random() * 9000)}`,
        expiry: '12/2028'
      };
    });

    setPendingPurchaseData({
      supplierId: matchedSupplier.id,
      items: purchaseLines
    });

    setActiveTab('purchases');
  };

  // Supplier return deduction (reduces supplier debt balance)
  const handleReturnToSupplier = async (supplierName, amount) => {
    try {
      await sqliteService.adjustSupplierBalanceByName(supplierName, -Math.abs(amount));
    } catch (e) {
      console.warn('Failed to persist supplier return balance:', e);
    }
    setSuppliers((prevSups) =>
      prevSups.map((s) => {
        if (s.name.includes(supplierName) || supplierName.includes(s.name)) {
          const newBal = Math.max(0, s.balance - amount);
          return { ...s, balance: newBal };
        }
        return s;
      })
    );
  };

  // Deduct stock for expired / disposed medicines
  const handleDeductMedicineStock = (medicineId, boxes) => {
    if (!medicineId) return;
    sqliteService.adjustMedicineStock(medicineId, -Math.abs(boxes)).catch(console.warn);
    setMedicines((prevMeds) =>
      prevMeds.map((m) => {
        if (m.id === medicineId) {
          return { ...m, stock_boxes: Math.max(0, m.stock_boxes - boxes) };
        }
        return m;
      })
    );
  };

  // --- STARTUP ACTIVATION GUARD CHECKS ---

  // 1. Loading splash while verifying license
  if (isCheckingLicense) {
    return (
      <div className="h-screen w-screen bg-[#0B1220] flex flex-col items-center justify-center font-cairo select-none text-slate-200">
        <div className="w-14 h-14 rounded-2xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-3xl shadow-glow-teal mb-4 animate-pulse">
          💊
        </div>
        <div className="text-base font-bold text-white mb-1">صيدليتي - نقاط البيع الذكية</div>
        <div className="text-xs text-teal-400 font-medium">جارٍ فحص ترخيص وحماية النظام...</div>
      </div>
    );
  }

  // 2. Strict Full-Screen Activation Screen (Locks the app completely if unlicensed)
  if (!licenseInfo || !licenseInfo.isLicensed || licenseInfo.isExpired) {
    return (
      <ActivationScreen
        machineId={licenseInfo?.machineId || ''}
        initialStatus={licenseInfo?.status || 'UNLICENSED'}
        expiresDate={licenseInfo?.expiresAt || ''}
        onActivationSuccess={async (status) => {
          // Re-read the real persisted license so expiry/days remaining are accurate
          try {
            const fresh = await checkLicenseStatus();
            setLicenseInfo(fresh);
            await refreshSetupState();
          } catch (e) {
            setLicenseInfo((prev) => ({
              ...prev,
              isLicensed: true,
              isTrial: false,
              isExpired: false,
              status
            }));
          }
        }}
        onRevoke={() => {
          setLicenseInfo((prev) => ({
            ...prev,
            isLicensed: false,
            isExpired: true,
            status: 'REVOKED'
          }));
        }}
      />
    );
  }

  // 3. First-Run Owner Setup Guard (After license activation)
  if (setupState?.needsSetup) {
    return (
      <FirstRunSetupScreen
        onSetupSuccess={async (ownerUser) => {
          await refreshSetupState();
          handleLoginSuccess(ownerUser);
        }}
      />
    );
  }

  // 4. Missing Owner Account State (setup completed but 0 users remain)
  if (setupState?.setupCompleted && setupState.userCount === 0) {
    return (
      <div className="h-screen w-screen bg-[#0B1220] flex flex-col items-center justify-center font-cairo select-none text-slate-200 p-4" dir="rtl">
        <div className="max-w-md w-full bg-[#111A2B] border border-rose-500/30 rounded-3xl p-6 text-center space-y-4 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center justify-center mx-auto text-2xl font-black">
            ⚠️
          </div>
          <h2 className="text-lg font-black text-white">لا يوجد حساب مالك مسجل</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            تم إعداد النظام مسبقاً ولكن لا توجد أي حسابات مستخدمين حالياً في قاعدة البيانات. لأسباب أمنية لا يمكن إنشاء حساب مالك جديد. يرجى استيراد نسخة احتياطية رسمية لقاعدة البيانات للمتابعة.
          </p>
        </div>
      </div>
    );
  }

  // 5. User Authentication Login Screen
  if (!currentUser) {
    return (
      <>
        {updateBannerNode}
        <LoginScreen onLoginSuccess={handleLoginSuccess} />
      </>
    );
  }

  

  // 4. Master Shell & Workspace
  return (
    <div className="h-screen w-screen flex flex-col bg-[#0B1220] text-slate-100 overflow-hidden font-cairo">
      {updateBannerNode}
      {/* Top Header Bar with Live License Status Badge */}
      <TopHeader
        pharmacyName={pharmacyName}
        shiftNumber={currentShift?.shift_number || 1}
        isShiftOpen={!!currentShift}
        licenseInfo={licenseInfo}
        onOpenActivation={canManageSettings ? handleOpenLicenseSettings : null}
      />

      {/* Main Workspace with Sidebar on Right (RTL) */}
      <div className="flex-1 flex flex-row overflow-hidden relative">
        {/* Shortage Reorder Alert Toast Notification */}
        {shortageToast && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gradient-to-r from-rose-950 via-slate-900 to-rose-950 border-2 border-rose-500/70 text-white px-5 py-3 rounded-2xl shadow-2xl shadow-rose-950/80 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0 shadow-inner animate-bounce">
              <Bell className="w-5 h-5 text-rose-400" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-rose-300">تنبيه حد الطلب والنواقص</span>
              <span className="text-sm font-extrabold text-white">{shortageToast.message}</span>
            </div>
            <div className="flex items-center gap-2 mr-2">
              <button
                type="button"
                onClick={() => {
                  handleSelectTab('shortages');
                  setShortageToast(null);
                }}
                className="text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white px-3 py-1.5 rounded-lg transition-colors shadow-sm"
              >
                عرض كشكول النواقص
              </button>
              <button
                type="button"
                onClick={() => setShortageToast(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                title="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Right Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          currentUser={currentUser}
          onLogout={handleLogout}
          hasUnreadShortages={hasUnreadShortages}
        />

        {/* Center Main Content Area */}
        <main className="flex-1 flex flex-col overflow-hidden bg-[#0B1220] relative">
          <ErrorBoundary>
          {activeTab === 'pos' ? (
            <POSView
              currentUser={currentUser}
              medicines={medicines}
              onUpdateMedicines={setMedicines}
              currentShift={currentShift}
              isShiftOpen={!!currentShift}
              pharmacyName={pharmacyName}
              onOpenShiftModal={() => setShowOpenShiftModal(true)}
              onSaleCompleted={async () => {
                await reloadMedicinesFromDb();
                try {
                  const freshShift = await sqliteService.getCurrentShift();
                  if (freshShift) setCurrentShift(freshShift);
                } catch (e) {}
              }}
            />
          ) : activeTab === 'products' ? (
            <ProductsView
              currentUser={currentUser}
              medicines={medicines}
              onSaveMedicine={handleSaveMedicine}
              onDeleteMedicine={handleDeleteMedicine}
            />
          ) : activeTab === 'purchases' ? (
            <PurchasesView
              purchases={purchases}
              suppliers={suppliers}
              medicines={medicines}
              onSavePurchase={handleSavePurchase}
              onSaveMedicine={handleSaveMedicine}
              onPaySupplier={handlePaySupplier}
              initialPurchaseData={pendingPurchaseData}
              onClearInitialPurchaseData={() => setPendingPurchaseData(null)}
            />
          ) : activeTab === 'shortages' ? (
            <ShortagesView
              medicines={medicines}
              suppliers={suppliers}
              onConvertToPurchase={handleConvertToPurchase}
            />
          ) : activeTab === 'expiry' ? (
            <ExpiryView
              suppliers={suppliers}
              onReturnToSupplier={handleReturnToSupplier}
              onDeductMedicineStock={handleDeductMedicineStock}
            />
          ) : activeTab === 'customers' ? (
            <CustomersView />
          ) : activeTab === 'shifts' ? (
            <ShiftsView
              currentShift={currentShift}
              currentUser={currentUser}
              onUpdateCurrentShift={setCurrentShift}
            />
          ) : activeTab === 'reports' ? (
            <ReportsView currentUser={currentUser} />
          ) : activeTab === 'settings' && canManageSettings ? (
            <SettingsView
              currentUser={currentUser}
              initialTab={settingsInitialTab}
              onUpdatePharmacyName={setPharmacyName}
              onRevokeDevice={() => {
                setCurrentUser(null);
                setLicenseInfo((prev) => ({
                  ...prev,
                  isLicensed: false,
                  isExpired: true,
                  status: 'REVOKED'
                }));
              }}
            />
          ) : (
            <PlaceholderView activeTabId={activeTab} />
          )}
        </ErrorBoundary>
        </main>
      </div>

      {/* Global Open Shift Modal triggered from POS or Header */}
      {showOpenShiftModal && (
        <OpenShiftModal
          isOpen={true}
          currentUser={currentUser}
          onClose={() => setShowOpenShiftModal(false)}
          onOpenShift={handleOpenShift}
        />
      )}

      {/* Global non-blocking confirmation host (replaces window.confirm) */}
      <ConfirmHost />
    </div>
  );
}
