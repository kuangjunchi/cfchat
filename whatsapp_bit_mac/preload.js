const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('monitor', {
  groups: () => ipcRenderer.invoke('groups'),
  chooseMode: (mode, groupId) => ipcRenderer.invoke('choose-mode', mode, groupId),
  refresh: () => ipcRenderer.invoke('refresh'),
  activate: id => ipcRenderer.invoke('activate', id),
  onState: callback => ipcRenderer.on('state', (_event, state) => callback(state))
});
