// Default System Configuration & Settings
export const DEFAULT_SETTINGS = {
  // 1. Branding & Receipt Customization
  pharmacyName: 'صيدليتي',
  pharmacyBranch: 'الفرع الرئيسي - مدينة نصر',
  address: 'شارع مصطفى النحاس - تقاطع مكرم عبيد - القاهرة',
  phone: '0226710099',
  hotline: '19011',
  taxNumber: 'TR-782-901-443',
  commercialRegister: 'CR-104928',
  receiptGreeting: 'أهلاً وسهلاً بكم • نتمنى لكم دوام الصحة والشفاء العاجل',
  receiptFooter: 'البضاعة المباعة ترد وتستبدل خلال 14 يوماً من تاريخ الفاتورة مع أصل الإيصال وفق تعليمات وزارة الصحة.',

  // 2. Hardware & Printer Settings
  paperSize: '80mm', // '80mm' or '58mm'
  enableCashDrawerKick: true,
  enableBarcodeBeep: true,
  enableSilentPrint: false,
  showCashierNameOnReceipt: true,
  showShiftNumberOnReceipt: true,

  // 3. Backup & Safety
  backupPath: 'C:\\PharmacyPOS\\backups\\',
  autoBackupOnShiftClose: true,
  autoDetectUsbFlash: true,

  // 4. Licensing (Unlicensed by default on fresh install)
  machineId: '',
  licenseStatus: 'UNLICENSED', // Requires explicit activation key
  licenseKey: '',
  trialDaysRemaining: 0,

  // 5. Cashier Restrictions
  hideProfitFromCashier: true,
  preventInvoiceDeleteByCashier: true,
  preventPriceChangeByCashier: true,

  // 6. Cloud Sync
  enableCloudSync: true,
  syncEndpoint: '',
  reportBaseUrl: '',
  // Permanent public host (Cloudflare Worker) — the shift QR code uses it
  // unless another address is configured explicitly.
  permanentReportUrl: 'https://pharmacy-reports.pharmacypos-eg.workers.dev',
  reportToken: '', // generated per installation on first run
  autoCheckUpdates: true,
  updateFeedUrl: '',
  // Use the free Cloudflare quick-tunnel URL in the shift QR code.
  // On by default: the quick tunnel needs no account and makes the printed
  // QR code openable from any phone, anywhere.
  useCloudflareTunnel: true,
  // Open the public tunnel automatically when the app starts (so the printed
  // QR code always points to a live address).
  autoStartTunnel: true,
  cloudPharmacyId: 'PH-EGYP-9102',
  cloudPortalUrl: 'https://pharmacy-monitor.app/portal?id=PH-EGYP-9102'
};
