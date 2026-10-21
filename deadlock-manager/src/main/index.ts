import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { homedir } from 'node:os'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { DeadlockApiData } from '../mission/deadlock_api'
import { ManageMods, getInstalledModIds } from '../mission/deadlock'
import type { IpcResult, ModFilters } from '../mission/types'

/** Istanza dell'API delle mod, creata all'avvio dell'app. */
let api: DeadlockApiData

/** Esegue `fn` e ne converte l'esito in un `IpcResult`, catturando gli errori. */
async function toResult<T>(fn: () => T | Promise<T>): Promise<IpcResult<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Errore sconosciuto' }
  }
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Primo caricamento delle mod: se fallisce l'app non può funzionare
  try {
    api = await DeadlockApiData.create(10 * 60_000)
  } catch (e) {
    dialog.showErrorBox('Errore', `Impossibile caricare le mod: ${(e as Error).message}`)
    app.quit()
    return
  }

  // Percorso tipico di Steam su Linux; renderlo un'impostazione in futuro
  const gamePath = join(homedir(), '.local/share/Steam/steamapps/common/Deadlock')

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))
  
  ipcMain.handle('mods:search', (_, filters?: ModFilters, page?: number) =>
    toResult(() => api.pagination(page, filters))   // ora prima la pagina, poi i filtri
  )
  ipcMain.handle('mods:status', () => api.status())
  ipcMain.handle('mods:install', (_, modId: string) =>
    toResult(async () => {
      const mod = api.getById(modId)
      if (!mod) throw new Error('Mod non trovata')
      return ManageMods.installMod(mod, gamePath)
    })
  )
  ipcMain.handle('mods:uninstall', (_, modId: string) =>
    toResult(async () => {
      await ManageMods.uninstallMod(modId, gamePath)
      return null
    })
  )
  ipcMain.handle('mods:installed', () => getInstalledModIds())

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Ferma l'aggiornamento automatico della cache alla chiusura
app.on('before-quit', () => api?.stop())