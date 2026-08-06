import { app, IpcMain, BrowserWindow, nativeTheme, safeStorage } from 'electron'
import Store from 'electron-store'

// electron-store's own `encryptionKey` (see electron/main.ts) is a fixed
// string baked into every install, so it only obfuscates the file on disk —
// anyone who unpacks the asar gets the same key every install ships with.
// For the actual credentials (auth token/refresh token), and the block-code
// PIN, we additionally encrypt with Electron's safeStorage, which is backed
// by an OS-level, per-machine/per-user secret (Keychain on macOS, DPAPI on
// Windows, a keyring-backed secret on Linux where available) — something
// that never leaves this device and isn't in the shipped binary.
//
// Migration note: a value written before this change is plain text (only
// ever passed through electron-store's static-key encryption). Trying to
// safeStorage.decryptString() plain text throws, since it isn't validly
// encrypted ciphertext — decryptSecret() catches that and returns '', which
// callers (authStorage.ts's readStoredAuth / block:get) treat the same as
// "nothing stored". That's a deliberate, graceful degrade: the app prompts
// a normal re-login / block-code re-setup instead of crashing or trying to
// use garbled data as a bearer token.
function encryptSecret(value: string): string {
  if (!value) return ''
  if (!safeStorage.isEncryptionAvailable()) return value
  try {
    return safeStorage.encryptString(value).toString('base64')
  } catch {
    return value
  }
}

function decryptSecret(stored: string): string {
  if (!stored) return ''
  if (!safeStorage.isEncryptionAvailable()) return stored
  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'))
  } catch {
    return ''
  }
}

function decryptBlockCode(stored: string): string | null {
  return decryptSecret(stored) || null
}

export function initIpcHandlers(ipcMain: IpcMain, store: Store): void {
  ipcMain.handle('store:getToken', () => decryptSecret(store.get('token', '') as string))
  ipcMain.handle('store:setToken', (_event, token: string) => {
    store.set('token', encryptSecret(token))
  })
  ipcMain.handle('store:clearToken', () => store.set('token', ''))
  ipcMain.handle('store:getRefreshToken', () => decryptSecret(store.get('refreshToken', '') as string))
  ipcMain.handle('store:setRefreshToken', (_event, refreshToken: string) => {
    store.set('refreshToken', encryptSecret(refreshToken))
  })
  ipcMain.handle('store:clearRefreshToken', () => store.set('refreshToken', ''))
  ipcMain.handle('store:getUser', () => store.get('user', {}))
  ipcMain.handle('store:setUser', (_event, user: unknown) => store.set('user', user))
  ipcMain.handle('store:clearUser', () => store.set('user', {}))
  ipcMain.handle('store:getTheme', () => store.get('theme', 'dark'))
  ipcMain.handle('store:setTheme', (_event, theme: string) => {
    store.set('theme', theme)
    // Keep native window chrome (title bar, system controls) following the
    // in-app choice instead of only applying it once at window creation.
    nativeTheme.themeSource = theme === 'light' ? 'light' : 'dark'
  })
  ipcMain.handle('store:getWindowBounds', () => store.get('windowBounds'))
  ipcMain.handle(
    'store:setWindowBounds',
    (_event, bounds: { width: number; height: number }) =>
      store.set('windowBounds', bounds),
  )
  ipcMain.handle('app:getVersion', () => app.getVersion())

  ipcMain.handle('block:get', () => decryptBlockCode(store.get('blockCode', '') as string))
  ipcMain.handle('block:set', (_event, code: string) => {
    store.set('blockCode', encryptSecret(code))
  })
  ipcMain.handle('block:clear', () => store.set('blockCode', ''))
  ipcMain.handle('block:has', () => Boolean(store.get('blockCode', '')))

  // Resolve the window that actually sent the IPC message rather than
  // whichever window happens to have OS focus — the focused window isn't
  // guaranteed to be the sender (e.g. focus can be elsewhere, such as a
  // devtools panel, at the moment the renderer's button click fires). Only
  // one window exists today, but this keeps the handlers correct if that
  // ever changes.
  ipcMain.handle('window:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.minimize()
  })
  ipcMain.handle('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })
  ipcMain.handle('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.close()
  })
}
