import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { IpcResult, ModFilters, ModSearchResult } from '../mission/types'

const api = {
  searchMods: (filters?: ModFilters, page?: number): Promise<IpcResult<ModSearchResult>> =>
    ipcRenderer.invoke('mods:search', filters, page),
  getModsStatus: () => ipcRenderer.invoke('mods:status'),
  installMod: (modId: string): Promise<IpcResult<string[]>> =>
    ipcRenderer.invoke('mods:install', modId),
  uninstallMod: (modId: string): Promise<IpcResult<null>> =>
    ipcRenderer.invoke('mods:uninstall', modId),
  getInstalledMods: (): Promise<string[]> => ipcRenderer.invoke('mods:installed'),
  getCategories: (): Promise<string[]> => ipcRenderer.invoke('mods:categories'),
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