'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('snapOverlay', {
  onShot: (cb) => { ipcRenderer.on('shot', (_e, d) => cb(d)); },
  done: (p) => ipcRenderer.send('overlay-done', p || null)
});
