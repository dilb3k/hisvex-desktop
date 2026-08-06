import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  getToken: () => ipcRenderer.invoke('store:getToken'),
  setToken: (token: string) => ipcRenderer.invoke('store:setToken', token),
  clearToken: () => ipcRenderer.invoke('store:clearToken'),
  getRefreshToken: () => ipcRenderer.invoke('store:getRefreshToken'),
  setRefreshToken: (refreshToken: string) => ipcRenderer.invoke('store:setRefreshToken', refreshToken),
  clearRefreshToken: () => ipcRenderer.invoke('store:clearRefreshToken'),
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
  // Both return an unsubscribe function so callers (e.g. Titlebar.tsx) can
  // remove the listener on unmount — without this, repeated mount/unmount
  // cycles (every login/logout on a shared kiosk PC re-mounts the app's
  // component tree) pile up ipcRenderer listeners for the lifetime of the
  // process, each firing on every subsequent event.
  onMenuAction: (callback: (action: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: string) => callback(action)
    ipcRenderer.on('menu:action', listener)
    return () => ipcRenderer.removeListener('menu:action', listener)
  },
  onMaximizeChange: (callback: (maximized: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, maximized: boolean) => callback(maximized)
    ipcRenderer.on('window:maximize-change', listener)
    return () => ipcRenderer.removeListener('window:maximize-change', listener)
  },
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  isWindows: () => process.platform === 'win32',
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
