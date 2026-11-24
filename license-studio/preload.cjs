const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('studio', {
  getState: () => ipcRenderer.invoke('state:get'),
  importKeyFile: () => ipcRenderer.invoke('key:import-file'),
  importKeyText: (text) => ipcRenderer.invoke('key:import-text', text),
  forgetKey: () => ipcRenderer.invoke('key:forget'),
  issue: (input) => ipcRenderer.invoke('license:issue', input),
  revoke: (input) => ipcRenderer.invoke('license:revoke', input),
  removeRevocation: (mid) => ipcRenderer.invoke('revocation:remove', mid),
  chooseProject: () => ipcRenderer.invoke('project:choose'),
  exportRevocations: () => ipcRenderer.invoke('revocations:export'),
  openFolder: (dir) => ipcRenderer.invoke('shell:open-folder', dir),
  inspectToken: (token) => ipcRenderer.invoke('token:inspect', token)
});
