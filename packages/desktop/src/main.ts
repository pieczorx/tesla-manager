import { app, BrowserWindow, Menu, protocol } from 'electron'
import * as path from 'node:path'
import { registerIpc, setMainWindow, setupMainWindowListeners } from './ipc'
import { registerAssetProtocol } from './protocol/assetProtocol'
import { getScanFolders, mergeClips, saveClips } from './storage'
import { DashcamScanner } from './services/dashcamScanner'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'tesla-asset',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      bypassCSP: true,
      stream: true,
    },
  },
])

let mainWindow: BrowserWindow | null = null

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    backgroundColor: '#0b1020',
    title: 'Dashcam Viewer',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  Menu.setApplicationMenu(null)
  mainWindow.removeMenu()
  setMainWindow(mainWindow)
  setupMainWindowListeners(mainWindow)

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    await mainWindow.loadURL(devUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    const indexHtml = app.isPackaged
      ? path.join(process.resourcesPath, 'client', 'dist', 'index.html')
      : path.join(__dirname, '..', '..', 'client', 'dist', 'index.html')

    await mainWindow.loadFile(indexHtml)
  }
}

async function scanOnStartup() {
  const folders = getScanFolders()
  if (folders.length === 0) {
    const merged = await mergeClips([])
    await saveClips(merged, new Date().toISOString())
    return
  }

  const scanner = new DashcamScanner()
  const discovered = await scanner.scanRoots(folders.map((folder) => folder.path), () => {
    // silent startup scan
  })

  const merged = await mergeClips(discovered)
  await saveClips(merged, new Date().toISOString())
}

app.whenReady().then(async () => {
  registerAssetProtocol()
  registerIpc()
  await createWindow()
  await scanOnStartup()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
