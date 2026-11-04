// Thin wrapper around the Electron auto-updater IPC bridge.
// Safe to import in a normal browser: every call becomes a no-op there.

function getIpc() {
  try {
    if (typeof window !== 'undefined' && window.require) {
      const electron = window.require('electron');
      if (electron && electron.ipcRenderer) return electron.ipcRenderer;
    }
  } catch (e) {}
  return null;
}

export function isUpdateSupported() {
  return !!getIpc();
}

export async function getAppInfo() {
  const ipc = getIpc();
  if (!ipc) return { version: '1.0.0', packaged: false };
  try {
    return await ipc.invoke('app:version');
  } catch (e) {
    return { version: '1.0.0', packaged: false, error: e.message };
  }
}

export async function checkForUpdates(feedUrl) {
  const ipc = getIpc();
  if (!ipc) return { available: false, reason: 'browser' };
  try {
    return await ipc.invoke('app:update-check', { feedUrl });
  } catch (e) {
    return { available: false, reason: 'error', error: e.message };
  }
}

export async function downloadUpdate() {
  const ipc = getIpc();
  if (!ipc) return { success: false, error: 'غير مدعوم' };
  try {
    return await ipc.invoke('app:update-download');
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export async function installUpdate() {
  const ipc = getIpc();
  if (!ipc) return { success: false, error: 'غير مدعوم' };
  try {
    return await ipc.invoke('app:update-install');
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export function onUpdateStatus(callback) {
  const ipc = getIpc();
  if (!ipc) return () => {};
  const listener = (_event, payload) => callback(payload || {});
  ipc.on('app:update-status', listener);
  return () => {
    try { ipc.removeListener('app:update-status', listener); } catch (e) {}
  };
}
