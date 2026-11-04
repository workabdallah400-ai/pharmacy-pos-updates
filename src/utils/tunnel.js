// Bridge to the Cloudflare quick-tunnel helper running in the Electron main
// process. Every function is a safe no-op when the app runs in a plain
// browser (Vite dev mode).

function getIpc() {
  try {
    if (typeof window !== 'undefined' && window.require) {
      const electron = window.require('electron');
      if (electron && electron.ipcRenderer) return electron.ipcRenderer;
    }
  } catch (e) {}
  return null;
}

export function isTunnelSupported() {
  return !!getIpc();
}

export async function getTunnelState() {
  const ipc = getIpc();
  if (!ipc) return { url: '', running: false, available: false, supported: false };
  try {
    const res = await ipc.invoke('report:tunnelUrl');
    return { ...(res || {}), supported: true };
  } catch (e) {
    return { url: '', running: false, available: false, supported: true, error: e.message };
  }
}

export async function startTunnel() {
  const ipc = getIpc();
  if (!ipc) return { ok: false, error: 'المعروف متاح في نسخة سطح المكتب فقط' };
  try {
    return await ipc.invoke('report:startTunnel');
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function stopTunnel() {
  const ipc = getIpc();
  if (!ipc) return { ok: false, error: 'غير مدعوم' };
  try {
    return await ipc.invoke('report:stopTunnel');
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function downloadCloudflared() {
  const ipc = getIpc();
  if (!ipc) return { ok: false, error: 'غير مدعوم' };
  try {
    return await ipc.invoke('report:downloadCloudflared');
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export function onTunnelUrl(callback) {
  const ipc = getIpc();
  if (!ipc) return () => {};
  const listener = (_event, payload) => callback((payload && payload.url) || '');
  ipc.on('report:tunnel-url', listener);
  return () => {
    try { ipc.removeListener('report:tunnel-url', listener); } catch (e) {}
  };
}

export function onTunnelDownload(callback) {
  const ipc = getIpc();
  if (!ipc) return () => {};
  const listener = (_event, payload) => callback(payload || {});
  ipc.on('report:tunnel-download', listener);
  return () => {
    try { ipc.removeListener('report:tunnel-download', listener); } catch (e) {}
  };
}
