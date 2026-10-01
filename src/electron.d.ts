interface ElectronAPI {
  requestBackend:(request:unknown)=>Promise<{networkError?:boolean;timeout?:boolean;status?:number;statusText?:string;headers?:Record<string,string>;data?:string}>
  getToken: () => Promise<string>
  setToken: (token: string) => Promise<void>
  clearToken: () => Promise<void>
  getRefreshToken: () => Promise<string>
  setRefreshToken: (refreshToken: string) => Promise<void>
  clearRefreshToken: () => Promise<void>
  getStaleToken: () => Promise<string>
  setStaleToken: (token: string) => Promise<void>
  clearStaleToken: () => Promise<void>
  getUser: () => Promise<unknown>
  setUser: (user: unknown) => Promise<void>
  clearUser: () => Promise<void>
  getTheme: () => Promise<string>
  setTheme: (theme: string) => Promise<void>
  getWindowBounds: () => Promise<{ width: number; height: number }>
  setWindowBounds: (bounds: { width: number; height: number }) => Promise<void>
  getAppVersion: () => Promise<string>
  blockGet: () => Promise<string | null>
  blockSet: (code: string) => Promise<void>
  blockClear: () => Promise<void>
  getPlatform: () => string
  minimizeWindow: () => Promise<void>
  maximizeWindow: () => Promise<void>
  closeWindow: () => Promise<void>
  onMenuAction: (callback: (action: string) => void) => () => void
  onMaximizeChange: (callback: (maximized: boolean) => void) => () => void
  isMaximized: () => Promise<boolean>
  isWindows: () => boolean
  saveCsv: (defaultName: string, content: string) => Promise<{ saved: true; filePath: string } | { saved: false }>
  openExternal: (url: string) => Promise<boolean>
  safeStorageEncrypt: (plaintext: string) => Promise<string>
  safeStorageDecrypt: (stored: string) => Promise<string>
}

interface Window {
  electronAPI?: ElectronAPI
}
