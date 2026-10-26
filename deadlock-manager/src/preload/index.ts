import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  GameinfoStatus,
  InstalledMod,
  InstalledModInfo,
  InstallProgress,
  InterchangeExportResult,
  InterchangeImportResult,
  InterfaceColors,
  InterfaceColorsResult,
  IpcResult,
  ModChangelogEntry,
  ModDownload,
  ModFilters,
  ModSearchResult,
  Settings,
  Status
} from '../mission/types'

const api = {
  searchMods: (filters?: ModFilters, page?: number): Promise<IpcResult<ModSearchResult>> =>
    ipcRenderer.invoke('mods:search', filters, page),
  getModsStatus: (): Promise<Status> => ipcRenderer.invoke('mods:status'),
  /** Riscarica la lista; `data` è `true` se è cambiata. */
  refreshMods: (): Promise<IpcResult<boolean>> => ipcRenderer.invoke('mods:refresh'),
  /** Registra `listener` per quando la lista delle mod è stata sostituita; restituisce la funzione per rimuoverlo. */
  onModsUpdated: (listener: () => void): (() => void) => {
    const handler = (): void => listener()
    ipcRenderer.on('mods:updated', handler)
    return () => ipcRenderer.removeListener('mods:updated', handler)
  },
  getDownloads: (modId: string): Promise<IpcResult<ModDownload[]>> =>
    ipcRenderer.invoke('mods:downloads', modId),
  getChangelog: (modId: string): Promise<IpcResult<ModChangelogEntry[]>> =>
    ipcRenderer.invoke('mods:changelog', modId),
  installMod: (modId: string, fileName?: string): Promise<IpcResult<string[]>> =>
    ipcRenderer.invoke('mods:install', modId, fileName),
  updateMod: (modId: string): Promise<IpcResult<string[]>> =>
    ipcRenderer.invoke('mods:update', modId),
  uninstallMod: (modId: string): Promise<IpcResult<null>> =>
    ipcRenderer.invoke('mods:uninstall', modId),
  setModEnabled: (modId: string, enabled: boolean): Promise<IpcResult<InstalledMod>> =>
    ipcRenderer.invoke('mods:setEnabled', modId, enabled),
  /** Collega la mod esterna `localId` alla mod di GameBanana `modId`, di cui prende i dati. */
  linkMod: (localId: string, modId: string): Promise<IpcResult<InstalledMod>> =>
    ipcRenderer.invoke('mods:link', localId, modId),
  getInstalledMods: (): Promise<string[]> => ipcRenderer.invoke('mods:installed'),
  getInstalledModsInfo: (): Promise<InstalledModInfo[]> => ipcRenderer.invoke('mods:installedInfo'),
  /** Mod attive dalla priorità più alta (`pak01`) alla più bassa. */
  getLoadOrder: (): Promise<InstalledMod[]> => ipcRenderer.invoke('mods:loadOrder'),
  setLoadOrder: (modIds: string[]): Promise<IpcResult<InstalledMod[]>> =>
    ipcRenderer.invoke('mods:setLoadOrder', modIds),
  getCategories: (): Promise<string[]> => ipcRenderer.invoke('mods:categories'),
  /** Registra `listener` per l'avanzamento dei download; restituisce la funzione per rimuoverlo. */
  onInstallProgress: (listener: (progress: InstallProgress) => void): (() => void) => {
    const handler = (_: IpcRendererEvent, progress: InstallProgress): void => listener(progress)
    ipcRenderer.on('mods:progress', handler)
    return () => ipcRenderer.removeListener('mods:progress', handler)
  },

  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Partial<Settings>): Promise<IpcResult<Settings>> =>
    ipcRenderer.invoke('settings:set', patch),
  detectGamePath: (): Promise<IpcResult<Settings>> => ipcRenderer.invoke('settings:detectGamePath'),
  /** Apre la scelta della cartella; `data` è `null` se l'utente annulla. */
  browseGamePath: (): Promise<IpcResult<Settings | null>> =>
    ipcRenderer.invoke('settings:browseGamePath'),
  openAddonsFolder: (): Promise<IpcResult<null>> => ipcRenderer.invoke('settings:openAddons'),

  /** Salva i colori dell'interfaccia e rigenera il loro VPK in `addons` (lo toglie se sono tutti originali). */
  applyInterfaceColors: (colors: InterfaceColors): Promise<IpcResult<InterfaceColorsResult>> =>
    ipcRenderer.invoke('colors:apply', colors),

  /** Esporta le mod in un pacchetto per altri manager; `data` è `null` se l'utente annulla. */
  exportMods: (): Promise<IpcResult<InterchangeExportResult | null>> =>
    ipcRenderer.invoke('interchange:export'),
  /** Importa un pacchetto di un altro manager; `data` è `null` se l'utente annulla. */
  importMods: (): Promise<IpcResult<InterchangeImportResult | null>> =>
    ipcRenderer.invoke('interchange:import'),

  /** Controlla `gameinfo.gi` (e lo ripara se la riparazione automatica è attiva). */
  checkGameinfo: (): Promise<IpcResult<GameinfoStatus>> => ipcRenderer.invoke('game:checkGameinfo'),
  /** Rimette in `gameinfo.gi` la riga che carica le mod, anche con la riparazione automatica spenta. */
  repairGameinfo: (): Promise<IpcResult<GameinfoStatus>> =>
    ipcRenderer.invoke('game:repairGameinfo'),
  /** Controlla `gameinfo.gi` e avvia Deadlock tramite Steam. */
  play: (): Promise<IpcResult<GameinfoStatus>> => ipcRenderer.invoke('game:play')
}

export type Api = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
