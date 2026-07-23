const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsAPI', {
  save: (config) => ipcRenderer.send('save-settings', config),
});
