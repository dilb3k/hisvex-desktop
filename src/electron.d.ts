interface ElectronAPI {
  getToken: () => Promise<string>
  setToken: (token: string) => Promise<void>
  clearToken: () => Promise<void>
  getRefreshToken: () => Promise<string>
  setRefreshToken: (refreshToken: string) => Promise<void>
  clearRefreshToken: () => Promise<void>
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
}

interface Window {
  electronAPI?: ElectronAPI
}
