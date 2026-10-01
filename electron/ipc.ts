import { trustedRendererUrl } from "./trust";
import { requestBackend } from "./backend-request";
import { app, IpcMain, BrowserWindow, dialog, nativeTheme, safeStorage, shell } from 'electron'
import Store from 'electron-store'
import fs from 'node:fs'

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
// Logged at most once per process, not once per read/write — encryptSecret/
// decryptSecret are called on every token access, and this condition (no OS
// keychain/keyring backing safeStorage) is a machine-level fact that doesn't
// change mid-session, so repeating the warning would just be console noise
// that buries the one time it actually matters: someone auditing why a
// credential ended up in the store as plain text on this machine.
let warnedNoSafeStorage = false
function warnNoSafeStorageOnce(): void {
  if (warnedNoSafeStorage) return
  warnedNoSafeStorage = true
  // eslint-disable-next-line no-console
  console.warn(
    '[hisvex] safeStorage encryption is unavailable on this machine (no OS keychain/DPAPI/keyring backend found). ' +
    'Credential and queue writes are blocked until OS encryption is available.',
  )
}

function encryptSecret(value: string): string {
  if (!value) return ''
  if (!safeStorage.isEncryptionAvailable()) {
    warnNoSafeStorageOnce()
    throw Error("OS credential encryption is unavailable")
  }
  try {
    return safeStorage.encryptString(value).toString('base64')
  } catch {
    throw Error("OS credential encryption is unavailable")
  }
}

function decryptSecret(stored: string): string {
  if (!stored) return ''
  if (!safeStorage.isEncryptionAvailable()) {
    warnNoSafeStorageOnce()
    throw Error("OS credential decryption is unavailable")
  }
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
  const isDev=process.env.NODE_ENV==='development'||!app.isPackaged
  const handle: IpcMain['handle']=(channel,listener)=>ipcMain.handle(channel,(event,...args)=>{
    if(event.senderFrame!==event.sender.mainFrame || !trustedRendererUrl(event.senderFrame?.url??'',isDev)) throw Error('Untrusted IPC sender')
    return listener(event,...args)
  })
  handle('api:request',(_event,input)=>requestBackend(input,isDev))
  handle('window:isMaximized',event=>BrowserWindow.fromWebContents(event.sender)?.isMaximized()??false)

  handle('store:getToken', () => decryptSecret(store.get('token', '') as string))
  handle('store:setToken', (_event, token: string) => {
    store.set('token', encryptSecret(token))
  })
  handle('store:clearToken', () => store.set('token', ''))
  handle('store:getRefreshToken', () => decryptSecret(store.get('refreshToken', '') as string))
  handle('store:setRefreshToken', (_event, refreshToken: string) => {
    store.set('refreshToken', encryptSecret(refreshToken))
  })
  handle('store:clearRefreshToken', () => store.set('refreshToken', ''))
  // Token this device held right before another device logged into the
  // same account and got it kicked (see SESSION_REPLACED in api/client.ts).
  // Kept separately from 'token' so the normal login/logout lifecycle never
  // touches it — only the phone-verification screen's read-only "view
  // products" link uses it, and only until it naturally expires.
  handle('store:getStaleToken', () => decryptSecret(store.get('staleToken', '') as string))
  handle('store:setStaleToken', (_event, token: string) => {
    store.set('staleToken', encryptSecret(token))
  })
  handle('store:clearStaleToken', () => store.set('staleToken', ''))
  handle('store:getUser', () => store.get('user', {}))
  handle('store:setUser', (_event, user: unknown) => store.set('user', user))
  handle('store:clearUser', () => store.set('user', {}))
  handle('store:getTheme', () => store.get('theme', 'dark'))
  handle('store:setTheme', (_event, theme: string) => {
    store.set('theme', theme)
    // Keep native window chrome (title bar, system controls) following the
    // in-app choice instead of only applying it once at window creation.
    nativeTheme.themeSource = theme === 'light' ? 'light' : 'dark'
  })
  handle('store:getWindowBounds', () => store.get('windowBounds'))
  handle(
    'store:setWindowBounds',
    (_event, bounds: { width: number; height: number }) =>
      store.set('windowBounds', bounds),
  )
  handle('app:getVersion', () => app.getVersion())

  // Generic safeStorage passthrough for the renderer's own localStorage-backed
  // data (the offline sync queue — see src/store/offlineQueue.ts) that isn't
  // an electron-store key itself: the renderer owns where/how it persists the
  // ciphertext, this just does the OS-level encrypt/decrypt safeStorage can
  // only perform from the main process.
  //
  // Deliberately NOT reusing encryptSecret/decryptSecret above: those return
  // '' on a decrypt failure, which is correct for a credential (garbled ==
  // "nothing stored", prompt a re-login) but wrong here — a queue entry
  // written *before* this encryption existed is plain JSON, not ciphertext,
  // so decrypting it throws, and the renderer needs the original string back
  // (to parse as plain JSON) rather than an empty one that would look like a
  // legitimately-decrypted "no data" and silently drop a pending sale.
  handle('safeStorage:encrypt', (_event, plaintext: string) => {
    if (!plaintext) return plaintext
    if (!safeStorage.isEncryptionAvailable()) {
      warnNoSafeStorageOnce()
      throw Error("OS credential encryption is unavailable")
    }
    try {
      return safeStorage.encryptString(plaintext).toString('base64')
    } catch {
      throw Error("OS credential encryption is unavailable")
    }
  })
  handle('safeStorage:decrypt', (_event, stored: string) => {
    if (!stored) return stored
    if (!safeStorage.isEncryptionAvailable()) {
      warnNoSafeStorageOnce()
      throw Error("OS credential decryption is unavailable")
    }
    try {
      return safeStorage.decryptString(Buffer.from(stored, 'base64'))
    } catch {
      // Not valid ciphertext under this OS key — most likely a pre-encryption
      // plaintext blob. Hand it back unchanged so the caller can fall back
      // to treating it as plain JSON instead of losing it.
      throw Error("OS credential decryption is unavailable")
    }
  })

  handle('block:get', () => decryptBlockCode(store.get('blockCode', '') as string))
  handle('block:set', (_event, code: string) => {
    store.set('blockCode', encryptSecret(code))
  })
  handle('block:clear', () => store.set('blockCode', ''))
  handle('block:has', () => Boolean(store.get('blockCode', '')))

  // Resolve the window that actually sent the IPC message rather than
  // whichever window happens to have OS focus — the focused window isn't
  // guaranteed to be the sender (e.g. focus can be elsewhere, such as a
  // devtools panel, at the moment the renderer's button click fires). Only
  // one window exists today, but this keeps the handlers correct if that
  // ever changes.
  handle('window:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.minimize()
  })
  handle('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })
  handle('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.close()
  })

  // Exports (Statistics CSV, etc.) go through a native Save dialog instead
  // of silently dropping into the OS default Downloads folder — the cashier
  // picks the destination (and can rename the file) every time, same as
  // "Save As" in any desktop app. Content is written as-is (renderer already
  // includes the UTF-8 BOM + sep=, hint needed for it to open cleanly in
  // Excel), so this handler only owns the dialog + disk write.
  // Opens a URL in the OS default browser (e.g. the update-available modal's
  // "Download" button). Restricted to http(s) — the renderer is sandboxed
  // but still not trusted to hand the main process an arbitrary
  // file://, javascript:, or custom-protocol string to shell.openExternal.
  handle('shell:openExternal', (_event, url: string) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    } catch {
      return false
    }
    shell.openExternal(url)
    return true
  })

  handle('file:saveCsv', async (event, defaultName: string, content: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const dialogOpts = { defaultPath: defaultName, filters: [{ name: 'CSV', extensions: ['csv'] }] }
    const { canceled, filePath } = win
      ? await dialog.showSaveDialog(win, dialogOpts)
      : await dialog.showSaveDialog(dialogOpts)
    if (canceled || !filePath) return { saved: false as const }
    await fs.promises.writeFile(filePath, content, 'utf8')
    return { saved: true as const, filePath }
  })
}
