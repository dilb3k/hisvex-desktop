import { app, IpcMain, BrowserWindow, safeStorage } from 'electron'
import Store from 'electron-store'

function encryptBlockCode(code: string): string {
  if (!safeStorage.isEncryptionAvailable()) return ''
  try {
    return safeStorage.encryptString(code).toString('base64')
  } catch {
    return ''
  }
}

function decryptBlockCode(stored: string): string | null {
  if (!stored) return null
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'))
  } catch {
    return null
  }
}

export function initIpcHandlers(ipcMain: IpcMain, store: Store): void {
  ipcMain.handle('store:getToken', () => store.get('token', ''))
  ipcMain.handle('store:setToken', (_event, token: string) => {
    store.set('token', token)
  })
  ipcMain.handle('store:clearToken', () => store.set('token', ''))
  ipcMain.handle('store:getRefreshToken', () => store.get('refreshToken', ''))
  ipcMain.handle('store:setRefreshToken', (_event, refreshToken: string) => {
    store.set('refreshToken', refreshToken)
  })
  ipcMain.handle('store:clearRefreshToken', () => store.set('refreshToken', ''))
  ipcMain.handle('store:getUser', () => store.get('user', {}))
  ipcMain.handle('store:setUser', (_event, user: unknown) => store.set('user', user))
  ipcMain.handle('store:clearUser', () => store.set('user', {}))
  ipcMain.handle('store:getTheme', () => store.get('theme', 'dark'))
  ipcMain.handle('store:setTheme', (_event, theme: string) => store.set('theme', theme))
  ipcMain.handle('store:getWindowBounds', () => store.get('windowBounds'))
  ipcMain.handle(
    'store:setWindowBounds',
    (_event, bounds: { width: number; height: number }) =>
      store.set('windowBounds', bounds),
  )
  ipcMain.handle('app:getVersion', () => app.getVersion())

  ipcMain.handle('block:get', () => decryptBlockCode(store.get('blockCode', '') as string))
  ipcMain.handle('block:set', (_event, code: string) => {
    store.set('blockCode', encryptBlockCode(code))
  })
  ipcMain.handle('block:clear', () => store.set('blockCode', ''))
  ipcMain.handle('block:has', () => Boolean(store.get('blockCode', '')))

  ipcMain.handle('window:minimize', () => {
    const win = BrowserWindow.getFocusedWindow()
    win?.minimize()
  })
  ipcMain.handle('window:maximize', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })
  ipcMain.handle('window:close', () => {
    const win = BrowserWindow.getFocusedWindow()
    win?.close()
  })
}
