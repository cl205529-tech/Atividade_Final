'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('findout', {
  getData: () => ipcRenderer.invoke('data:get'),
  setData: (data) => ipcRenderer.invoke('data:set', data),
  info: () => ipcRenderer.invoke('app:info'),
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),
  auth: {
    register: (d) => ipcRenderer.invoke('auth:register', d),
    login: (d) => ipcRenderer.invoke('auth:login', d),
    logout: () => ipcRenderer.invoke('auth:logout'),
    me: () => ipcRenderer.invoke('auth:me')
  },
  pessoa: {
    update: (d) => ipcRenderer.invoke('pessoa:update', d),
    changePassword: (d) => ipcRenderer.invoke('pessoa:password', d),
    remove: (d) => ipcRenderer.invoke('pessoa:remove', d)
  },
  admin: {
    list: () => ipcRenderer.invoke('admin:list'),
    create: (d) => ipcRenderer.invoke('admin:create', d),
    update: (d) => ipcRenderer.invoke('admin:update', d),
    setStatus: (d) => ipcRenderer.invoke('admin:status', d),
    resetPassword: (d) => ipcRenderer.invoke('admin:password', d),
    remove: (d) => ipcRenderer.invoke('admin:remove', d),
    exportCsv: () => ipcRenderer.invoke('admin:export')
  },
  win: {
    minimize: () => ipcRenderer.send('win:minimize'),
    maximize: () => ipcRenderer.send('win:maximize'),
    close: () => ipcRenderer.send('win:close')
  },
  onNavigate: (cb) => ipcRenderer.on('nav', (_e, view) => cb(view))
});
