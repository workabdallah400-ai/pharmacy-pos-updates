import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Global Clean Slate Zero: Clears all previous test/mock data from browser localStorage
try {
  const PURGE_TOKEN = 'PHARMACY_CLEAN_SLATE_ZERO_V6';
  if (localStorage.getItem(PURGE_TOKEN) !== 'YES') {
    const keepKeys = [
      // License & hardware identity — must survive app updates
      'PHARMACY_LICENSE_DATA',
      'PHARMACY_MACHINE_ID',
      'PHARMACY_SYS_CLOCK_TIMESTAMP',
      'PHARMACY_POS_DEVICE_MACHINE_ID',
      'PHARMACY_POS_MASTER_LICENSE_PROD',
      'PHARMACY_POS_LAST_SEEN_TIME_KEY',
      // Real operational data (never wipe on update)
      'PHARMACY_SETTINGS',
      'PHARMACY_ACTIVE_SHIFT',
      'PHARMACY_ACTIVE_CART',
      'PHARMACY_SHIFTS_HISTORY',
      'PHARMACY_SUPPLIERS_LIST',
      'PHARMACY_PURCHASES_LIST',
      'PHARMACY_PARKED_BILLS'
    ];
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && !keepKeys.includes(k)) {
        toRemove.push(k);
      }
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
    localStorage.setItem(PURGE_TOKEN, 'YES');
    console.log('✨ Clean slate zero: Purged all legacy test/mock data from browser storage.');
  }
} catch (e) {}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
