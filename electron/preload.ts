import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  getToken: () => ipcRenderer.invoke('store:getToken'),
  setToken: (token: string) => ipcRenderer.invoke('store:setToken', token),
  clearToken: () => ipcRenderer.invoke('store:clearToken'),
  getUser: () => ipcRenderer.invoke('store:getUser'),
  setUser: (user: unknown) => ipcRenderer.invoke('store:setUser', user),
  clearUser: () => ipcRenderer.invoke('store:clearUser'),
  getTheme: () => ipcRenderer.invoke('store:getTheme'),
  setTheme: (theme: string) => ipcRenderer.invoke('store:setTheme', theme),
  getWindowBounds: () => ipcRenderer.invoke('store:getWindowBounds'),
  setWindowBounds: (bounds: { width: number; height: number }) =>
    ipcRenderer.invoke('store:setWindowBounds', bounds),
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  blockGet: () => ipcRenderer.invoke('block:get'),
  blockSet: (code: string) => ipcRenderer.invoke('block:set', code),
  blockClear: () => ipcRenderer.invoke('block:clear'),
  getPlatform: () => process.platform,
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  onMenuAction: (callback: (action: string) => void) => {
    ipcRenderer.on('menu:action', (_event, action) => callback(action))
  },
  onMaximizeChange: (callback: (maximized: boolean) => void) => {
    ipcRenderer.on('window:maximize-change', (_event, maximized) => callback(maximized))
  },
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  isWindows: () => process.platform === 'win32',
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
