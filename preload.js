const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => {
  ipcRenderer.on(channel, (_event, data) => cb(data));
};

contextBridge.exposeInMainWorld('deedlerAPI', {
  // eventos vindos do processo principal
  onDownloadStarted: on('download-started'),
  onDownloadProgress: on('download-progress'),
  onDownloadCompleted: on('download-completed'),
  onShortcut: on('shortcut'),
  onOpenInNewTab: on('open-in-new-tab'),

  // ações
  showInFolder: (p) => ipcRenderer.invoke('show-in-folder', p),
  openPath: (p) => ipcRenderer.invoke('open-path', p),
  setAdblock: (v) => ipcRenderer.invoke('set-adblock', !!v),
  clearData: () => ipcRenderer.invoke('clear-data'),
  capturePage: (id) => ipcRenderer.invoke('capture-page', id),
  copyText: (t) => ipcRenderer.invoke('copy-text', String(t)),
  toggleDevTools: (id) => ipcRenderer.invoke('toggle-devtools', id),
  info: () => ipcRenderer.invoke('app-info')
});