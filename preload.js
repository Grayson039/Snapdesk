'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('snapdeskNative', {
  capture: (delay) => ipcRenderer.invoke('capture', delay | 0),
  onImage: (cb) => { ipcRenderer.on('image', (_e, bytes) => cb(bytes)); },
  copyPng: (bytes) => ipcRenderer.invoke('copy-png', bytes),
  saveFile: (bytes, name, ext) => ipcRenderer.invoke('save-file', bytes, name, ext),
  readClipboardImage: () => ipcRenderer.invoke('read-clipboard-image'),
  setDirty: (d) => ipcRenderer.send('set-dirty', !!d),
  info: () => ipcRenderer.invoke('info')
});
