import { app, BrowserWindow, ipcMain, Menu, nativeTheme } from 'electron'
import path from 'path'
import Store from 'electron-store'
import { initIpcHandlers } from './ipc'

const store = new Store({
  encryptionKey: 'hisvex-store-key',
  schema: {
    token: { type: 'string', default: '' },
    user: { type: 'object', default: {} },
    theme: { type: 'string', default: 'dark' },
    windowBounds: {
      type: 'object',
      default: { width: 1280, height: 800 },
    },
    blockCode: { type: 'string', default: '' },
  },
})

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
const isWin = process.platform === 'win32'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const bounds = store.get('windowBounds') as { width: number; height: number }
  const savedTheme = store.get('theme', 'dark') as string

  if (savedTheme === 'light') {
    nativeTheme.themeSource = 'light'
  } else {
    nativeTheme.themeSource = 'dark'
  }

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: 1024,
    minHeight: 680,
    title: 'Hisvex',
    show: false,
    frame: !isWin,
    titleBarStyle: isWin ? 'hidden' : 'default',
    backgroundColor: '#0f0f11',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'build', 'renderer', 'index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    if (isWin) {
      mainWindow?.webContents.send('window:maximize-change', mainWindow?.isMaximized())
    }
  })

  mainWindow.on('resize', () => {
    if (mainWindow) {
      const [width, height] = mainWindow.getSize()
      store.set('windowBounds', { width, height })
    }
  })

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximize-change', true)
  })

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximize-change', false)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  Menu.setApplicationMenu(null)
}

ipcMain.handle('window:isMaximized', () => {
  return mainWindow?.isMaximized() ?? false
})

app.whenReady().then(() => {
  initIpcHandlers(ipcMain, store as unknown as Store)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
