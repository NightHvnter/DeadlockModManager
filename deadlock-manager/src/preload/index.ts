import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  ApplyProfileResult,
  GameinfoStatus,
  InstalledMod,
  InstalledModInfo,
  InstallProgress,
  InterchangeExportResult,
  InterchangeImportResult,
  InterfaceColors,
  InterfaceColorsResult,
  IpcResult,
  LocalInstallResult,
  ModChangelogEntry,
  AcceptedConflict,
  ModConflict,
  ModDownload,
  ModFilters,
  ModSearchResult,
  ProfilesState,
  Settings,
  Status,
  UpdateStatus
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
  /**
   * Installa mod da file sul computer: i percorsi dati (es. trascinati nella finestra) oppure,
   * senza percorsi, quelli scelti dall'utente; `data` è `null` se annulla.
   */
  installLocalFiles: (paths?: string[]): Promise<IpcResult<LocalInstallResult[] | null>> =>
    ipcRenderer.invoke('mods:installLocal', paths),
  /** Percorso sul disco di un file trascinato nella finestra. */
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  getProfiles: (): Promise<ProfilesState> => ipcRenderer.invoke('profiles:list'),
  /** Crea un profilo con le mod attive adesso (e lo rende attivo) oppure vuoto. */
  createProfile: (name: string, fromCurrent: boolean): Promise<IpcResult<ProfilesState>> =>
    ipcRenderer.invoke('profiles:create', name, fromCurrent),
  renameProfile: (id: string, name: string): Promise<IpcResult<ProfilesState>> =>
    ipcRenderer.invoke('profiles:rename', id, name),
  deleteProfile: (id: string): Promise<IpcResult<ProfilesState>> =>
    ipcRenderer.invoke('profiles:delete', id),
  /** Attiva le mod del profilo, disattiva le altre e ne imposta l'ordine di caricamento. */
  applyProfile: (id: string): Promise<IpcResult<ApplyProfileResult>> =>
    ipcRenderer.invoke('profiles:apply', id),
  /** Mod attive che contengono gli stessi file, con quella che vince. */
  getConflicts: (): Promise<IpcResult<ModConflict[]>> => ipcRenderer.invoke('mods:conflicts'),
  /**
   * Accetta (o, con `accepted = false`, torna a segnalare) i conflitti tra le coppie di mod date;
   * restituisce i conflitti aggiornati.
   */
  acceptConflicts: (
    pairs: AcceptedConflict[],
    accepted: boolean
  ): Promise<IpcResult<ModConflict[]>> =>
    ipcRenderer.invoke('mods:acceptConflicts', pairs, accepted),
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

  /** Versione dell'app, come in `package.json`. */
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  getUpdateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke('updates:status'),
  /** Controlla subito se c'è una versione nuova dell'app (e la scarica dove si può). */
  checkForUpdates: (): Promise<UpdateStatus> => ipcRenderer.invoke('updates:check'),
  /** Chiude l'app e installa la versione scaricata. */
  installUpdate: (): Promise<void> => ipcRenderer.invoke('updates:install'),
  /** Registra `listener` per i cambi di stato degli aggiornamenti; restituisce la funzione per rimuoverlo. */
  onUpdateStatus: (listener: (status: UpdateStatus) => void): (() => void) => {
    const handler = (_: IpcRendererEvent, status: UpdateStatus): void => listener(status)
    ipcRenderer.on('updates:status', handler)
    return () => ipcRenderer.removeListener('updates:status', handler)
  },

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
