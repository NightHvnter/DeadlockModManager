import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { basename, join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { checkForUpdates, getUpdateStatus, initUpdater, installUpdate } from './updater'
import { GameBananaCatalog, INCREMENTAL_INTERVAL_MS } from '../mission/gamebanana'
import {
  ManageMods,
  getInstalledModIds,
  getInstalledMods,
  applyProfile,
  createProfile,
  deleteProfile,
  readProfiles,
  renameProfile,
  syncActiveProfile,
  type ExternalLookup
} from '../mission/deadlock'
import {
  detectGamePath,
  isValidGamePath,
  readSettings,
  requireGamePath,
  writeSettings
} from '../mission/settings'
import type {
  AcceptedConflict,
  GameinfoStatus,
  InstalledModInfo,
  InstallProgress,
  InterfaceColors,
  IpcResult,
  LocalInstallResult,
  ModFilters,
  Settings
} from '../mission/types'
import { AppError, describeError, detectLanguage, translate, type Language } from '../mission/i18n'

/** Catalogo delle mod di GameBanana, `undefined` finché il primo caricamento non è finito. */
let catalog: GameBananaCatalog | undefined
/** Primo caricamento delle mod: i gestori IPC che hanno bisogno dei dati lo attendono. */
let catalogReady: Promise<GameBananaCatalog>
/** Lingua usata per i messaggi del processo main (errori e finestre di dialogo). */
let language: Language = 'en'

/** Lingua scelta nelle impostazioni o, se non c'è, quella del sistema. */
const resolveLanguage = (settings: Settings): Language =>
  settings.language ?? detectLanguage(app.getLocale())

/** Esegue `fn` e ne converte l'esito in un `IpcResult`, catturando gli errori. */
async function toResult<T>(fn: () => T | Promise<T>): Promise<IpcResult<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (e) {
    return { ok: false, error: describeError(e, language) }
  }
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 700,
    minHeight: 500,
    show: false,
    autoHideMenuBar: true,
    title: 'Deadlock Mod Manager',
    // icona della finestra e della barra delle applicazioni (su macOS vale quella del pacchetto)
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    // apre nel browser solo i link web
    if (/^https?:\/\//.test(details.url)) shell.openExternal(details.url)
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

/**
 * Aggiunge al manifest le mod messe in `addons` senza passare dall'app (vedi
 * `ManageMods.syncExternal`). Senza una cartella di Deadlock valida non fa nulla; un errore
 * non deve impedire di mostrare le mod già note.
 */
async function syncExternalMods(): Promise<void> {
  const { gamePath } = await readSettings()
  if (!gamePath || !(await isValidGamePath(gamePath))) return
  await ManageMods.syncExternal(gamePath, await remoteLookup()).catch((e) =>
    console.error('[external]', e)
  )
}

/** Cerca nel catalogo (atteso se non è ancora caricato) le mod per id numerico di GameBanana. */
async function remoteLookup(): Promise<ExternalLookup> {
  const ready = await catalogReady.catch(() => undefined)
  return (remoteId) => ready?.getById(`Mod-${remoteId}`) ?? ready?.getById(`Sound-${remoteId}`)
}

/** Mod installate con l'indicazione degli aggiornamenti disponibili. */
async function installedWithInfo(): Promise<InstalledModInfo[]> {
  await syncExternalMods()
  return (await getInstalledMods()).map((entry) => {
    // le mod esterne non hanno una pagina su GameBanana da cui controllare gli aggiornamenti
    if (entry.external) return { ...entry, available: true, updateAvailable: false }
    // finché l'elenco non è caricato non si può sapere se ci sono aggiornamenti
    if (!catalog) return { ...entry, available: true, updateAvailable: false }
    const mod = catalog.getById(entry.id)
    const updatedAt = mod?.filesUpdatedAt ?? mod?.remoteUpdatedAt
    return {
      ...entry,
      available: !!mod,
      updateAvailable: !!(updatedAt && entry.installedAt && updatedAt > entry.installedAt)
    }
  })
}

function registerIpc(): void {
  ipcMain.handle('mods:categories', async () => (await catalogReady).categories())
  ipcMain.handle('mods:search', (_, filters?: ModFilters, page?: number) =>
    toResult(async () => (await catalogReady).pagination(page, filters))
  )
  ipcMain.handle(
    'mods:status',
    () => catalog?.status(language) ?? { lastError: undefined, lastUpdated: undefined, total: 0 }
  )
  ipcMain.handle('mods:refresh', () => toResult(async () => (await catalogReady).refresh()))
  ipcMain.handle('mods:downloads', (_, modId: string) =>
    toResult(async () => {
      const mod = (await catalogReady).getById(modId)
      if (!mod) throw new AppError('error.modNotFound')
      return ManageMods.getDownloads(mod.id)
    })
  )
  ipcMain.handle('mods:changelog', (_, modId: string) =>
    toResult(() => ManageMods.getChangelog(modId))
  )
  ipcMain.handle('mods:install', (event, modId: string, fileName?: string) =>
    toResult(async () => {
      const mod = (await catalogReady).getById(modId)
      if (!mod) throw new AppError('error.modNotFound')
      const gamePath = await requireGamePath()
      const download = fileName
        ? (await ManageMods.getDownloads(mod.id)).find((d) => d.name === fileName)
        : undefined
      if (fileName && !download) throw new AppError('error.fileNotFound')
      return ManageMods.installMod(mod, gamePath, download, (received, total) => {
        const progress: InstallProgress = { modId, received, total }
        if (!event.sender.isDestroyed()) event.sender.send('mods:progress', progress)
      })
    })
  )
  ipcMain.handle('mods:update', (event, modId: string) =>
    toResult(async () => {
      const mod = (await catalogReady).getById(modId)
      if (!mod) throw new AppError('error.modUnavailable')
      const gamePath = await requireGamePath()
      await ManageMods.uninstallMod(modId, gamePath)
      return ManageMods.installMod(mod, gamePath, undefined, (received, total) => {
        const progress: InstallProgress = { modId, received, total }
        if (!event.sender.isDestroyed()) event.sender.send('mods:progress', progress)
      })
    })
  )
  ipcMain.handle('mods:uninstall', (_, modId: string) =>
    toResult(async () => {
      await ManageMods.uninstallMod(modId, await requireGamePath())
      return null
    })
  )
  ipcMain.handle('mods:setEnabled', (_, modId: string, enabled: boolean) =>
    toResult(async () => ManageMods.setEnabled(modId, enabled, await requireGamePath()))
  )
  ipcMain.handle('mods:link', (_, localId: string, modId: string) =>
    toResult(async () => {
      const mod = (await catalogReady).getById(modId)
      if (!mod) throw new AppError('error.modNotFound')
      return ManageMods.linkMod(localId, mod)
    })
  )
  ipcMain.handle('mods:installed', () => getInstalledModIds())
  ipcMain.handle('mods:installedInfo', () => installedWithInfo())
  ipcMain.handle('mods:loadOrder', async () => {
    await syncExternalMods()
    return ManageMods.getLoadOrder()
  })
  // installazione da file sul computer: i percorsi arrivano dal trascinamento, altrimenti si
  // chiedono all'utente; un file che non si installa non ferma gli altri
  ipcMain.handle('mods:installLocal', (event, paths?: string[]) =>
    toResult(async () => {
      const gamePath = await requireGamePath()
      let files = paths ?? []
      if (!paths) {
        const window = BrowserWindow.fromWebContents(event.sender)
        const options: Electron.OpenDialogOptions = {
          title: translate(language, 'dialog.chooseModFiles'),
          properties: ['openFile', 'multiSelections'],
          filters: [{ name: 'Mod (.zip, .rar, .vpk)', extensions: ['zip', 'rar', 'vpk'] }]
        }
        const { canceled, filePaths } = window
          ? await dialog.showOpenDialog(window, options)
          : await dialog.showOpenDialog(options)
        if (canceled) return null
        files = filePaths
      }
      const results: LocalInstallResult[] = []
      for (const path of files) {
        try {
          await ManageMods.installLocal(path, gamePath)
          results.push({ file: basename(path) })
        } catch (e) {
          results.push({ file: basename(path), error: describeError(e, language) })
        }
      }
      BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('mods:updated'))
      return results
    })
  )
  // profili: l'elenco delle mod da tenere attive, con il loro ordine
  ipcMain.handle('profiles:list', () => readProfiles())
  ipcMain.handle('profiles:create', (_, name: string, fromCurrent: boolean) =>
    toResult(() => createProfile(name, fromCurrent))
  )
  ipcMain.handle('profiles:rename', (_, id: string, name: string) =>
    toResult(() => renameProfile(id, name))
  )
  ipcMain.handle('profiles:delete', (_, id: string) => toResult(() => deleteProfile(id)))
  ipcMain.handle('profiles:apply', (_, id: string) =>
    toResult(async () => {
      const result = await applyProfile(id, await requireGamePath())
      BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('mods:updated'))
      return result
    })
  )
  ipcMain.handle('mods:conflicts', () =>
    toResult(async () =>
      ManageMods.getConflicts(await requireGamePath(), (await readSettings()).acceptedConflicts)
    )
  )
  ipcMain.handle('mods:acceptConflicts', (_, pairs: AcceptedConflict[], accepted: boolean) =>
    toResult(async () => {
      const key = (c: AcceptedConflict): string => `${c.winner}\n${c.loser}`
      const changed = new Set(pairs.map(key))
      const rest = (await readSettings()).acceptedConflicts.filter((c) => !changed.has(key(c)))
      const acceptedConflicts = accepted
        ? [...rest, ...pairs.map(({ winner, loser }) => ({ winner, loser }))]
        : rest
      await writeSettings({ acceptedConflicts })
      return ManageMods.getConflicts(await requireGamePath(), acceptedConflicts)
    })
  )
  ipcMain.handle('mods:setLoadOrder', (_, modIds: string[]) =>
    toResult(async () => ManageMods.setLoadOrder(modIds, await requireGamePath()))
  )

  ipcMain.handle('settings:get', () => readSettings())
  ipcMain.handle('settings:set', (_, patch: Partial<Settings>) =>
    toResult(async () => {
      if (patch.gamePath && !(await isValidGamePath(patch.gamePath)))
        throw new AppError('error.invalidGameFolder')
      const settings = await writeSettings(patch)
      language = resolveLanguage(settings)
      return settings
    })
  )
  ipcMain.handle('settings:detectGamePath', () =>
    toResult(async () => {
      const gamePath = await detectGamePath()
      if (!gamePath) throw new AppError('error.deadlockNotFound')
      return writeSettings({ gamePath })
    })
  )
  ipcMain.handle('settings:browseGamePath', (event) =>
    toResult(async () => {
      const window = BrowserWindow.fromWebContents(event.sender)
      const options: Electron.OpenDialogOptions = {
        title: translate(language, 'dialog.chooseGameFolder'),
        properties: ['openDirectory']
      }
      const { canceled, filePaths } = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options)
      if (canceled || !filePaths[0]) return null
      if (!(await isValidGamePath(filePaths[0]))) throw new AppError('error.invalidGameFolder')
      return writeSettings({ gamePath: filePaths[0] })
    })
  )
  ipcMain.handle('settings:openAddons', () =>
    toResult(async () => {
      const error = await shell.openPath(join(await requireGamePath(), 'game', 'citadel', 'addons'))
      if (error) throw new Error(error)
      return null
    })
  )

  // importazione ed esportazione nel formato "Deadlock Mod Interchange" del manager ufficiale
  ipcMain.handle('interchange:export', (event) =>
    toResult(async () => {
      const gamePath = await requireGamePath()
      const window = BrowserWindow.fromWebContents(event.sender)
      const options: Electron.OpenDialogOptions = {
        title: translate(language, 'dialog.chooseExportFolder'),
        properties: ['openDirectory', 'createDirectory']
      }
      const { canceled, filePaths } = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options)
      if (canceled || !filePaths[0]) return null
      return ManageMods.exportMods(gamePath, filePaths[0], app.getVersion())
    })
  )
  ipcMain.handle('interchange:import', (event) =>
    toResult(async () => {
      const gamePath = await requireGamePath()
      const window = BrowserWindow.fromWebContents(event.sender)
      const options: Electron.OpenDialogOptions = {
        title: translate(language, 'dialog.chooseImportFile'),
        properties: ['openFile'],
        filters: [{ name: 'mod-interchange.json', extensions: ['json'] }]
      }
      const { canceled, filePaths } = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options)
      if (canceled || !filePaths[0]) return null
      const ready = await catalogReady
      const result = await ManageMods.importMods(gamePath, filePaths[0], (id) => ready.getById(id))
      BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('mods:updated'))
      return result
    })
  )

  ipcMain.handle('colors:apply', (_, colors: InterfaceColors) =>
    toResult(async () => {
      const gamePath = await requireGamePath()
      const result = await ManageMods.applyInterfaceColors(gamePath, colors)
      await writeSettings({ interfaceColors: colors })
      return result
    })
  )

  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('updates:status', () => getUpdateStatus())
  ipcMain.handle('updates:check', () => checkForUpdates())
  ipcMain.handle('updates:install', () => installUpdate())

  // gameinfo.gi viene controllato solo all'avvio dell'app (dal renderer), con "Gioca" e con
  // "Ripara": mai in background mentre l'app è aperta
  ipcMain.handle('game:checkGameinfo', () => toResult(() => checkGameinfo()))
  ipcMain.handle('game:repairGameinfo', () => toResult(() => checkGameinfo(true)))
  ipcMain.handle('game:play', () =>
    toResult(async () => {
      // i colori si rigenerano dagli stili attuali: un aggiornamento del gioco può averli cambiati
      const settings = await readSettings()
      if (settings.gamePath && Object.keys(settings.interfaceColors).length > 0)
        await ManageMods.applyInterfaceColors(settings.gamePath, settings.interfaceColors).catch(
          (e) => console.error('[colors]', e)
        )
      // un errore nel controllo non deve impedire di giocare: si avvia comunque e lo si segnala
      const status = await checkGameinfo().catch((): GameinfoStatus => 'needsRepair')
      await shell.openExternal(`steam://rungameid/${DEADLOCK_STEAM_APP_ID}`)
      return status
    })
  )
}

/** Id di Deadlock su Steam, per avviarlo con `steam://rungameid/`. */
const DEADLOCK_STEAM_APP_ID = 1422450

/**
 * Controlla `gameinfo.gi` e, se la riparazione automatica è attiva (o `forceRepair`), rimette
 * la riga che carica le mod quando un aggiornamento del gioco l'ha tolta.
 */
async function checkGameinfo(forceRepair = false): Promise<GameinfoStatus> {
  const settings = await readSettings()
  if (!settings.gamePath || !(await isValidGamePath(settings.gamePath))) return 'noGame'
  return ManageMods.checkGameinfo(
    settings.gamePath,
    forceRepair || settings.autoRepairGameinfo,
    await remoteLookup()
  )
}

// su KDE Wayland la gestione colore di Chromium riempie il terminale di errori inutili
if (process.platform === 'linux')
  app.commandLine.appendSwitch('disable-features', 'WaylandWpColorManagerV1')

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.deadlockmodmanager.app')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  language = resolveLanguage(await readSettings())

  // Primo caricamento delle mod, in parallelo all'apertura della finestra.
  // Il catalogo arriva da GameBanana: con un catalogo salvato è immediato, al primo avvio
  // basta la prima pagina; il resto si sincronizza in background e, a sincronizzazione
  // finita, il renderer viene avvisato con `mods:updated`. I log `[gamebanana]` nel
  // terminale di `npm run dev` mostrano tempi e numero di richieste.
  // Se fallisce senza catalogo salvato l'app non può funzionare.
  catalogReady = GameBananaCatalog.create(
    INCREMENTAL_INTERVAL_MS,
    join(app.getPath('userData'), 'gamebanana-catalog.json'),
    () => BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('mods:updated')),
    (message) => console.log(`[gamebanana] ${message}`)
  )
  catalogReady.then(
    (instance) => (catalog = instance),
    (e) => {
      dialog.showErrorBox(
        translate(language, 'dialog.errorTitle'),
        translate(language, 'dialog.loadModsFailed', { message: describeError(e, language) })
      )
      app.quit()
    }
  )

  // Al primo avvio prova a trovare Deadlock da solo
  if (!(await readSettings()).gamePath) {
    const gamePath = await detectGamePath()
    if (gamePath) await writeSettings({ gamePath })
  }

  // il profilo attivo segue ogni modifica alle mod
  ManageMods.onChange = syncActiveProfile
  registerIpc()
  createWindow()
  // gli aggiornamenti dell'app si controllano all'avvio, se l'utente non li ha spenti
  initUpdater((await readSettings()).autoUpdate)

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
app.on('before-quit', () => catalog?.stop())
