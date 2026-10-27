import { app, BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import electronUpdater from 'electron-updater'
import type { UpdateStatus } from '../mission/types'

// electron-updater è un modulo CommonJS: l'import predefinito funziona sia in sviluppo che nel pacchetto
const { autoUpdater } = electronUpdater

let status: UpdateStatus = { state: 'idle' }

function setStatus(next: UpdateStatus): void {
  status = next
  BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('updates:status', status))
}

export const getUpdateStatus = (): UpdateStatus => status

/**
 * `true` se questa installazione può aggiornarsi da sola: l'installer di Windows e l'AppImage di
 * Linux. Su macOS l'aggiornamento richiede un'app firmata; `deb`, `rpm`, `snap` e `flatpak` si
 * aggiornano con il loro gestore di pacchetti.
 */
function canSelfUpdate(): boolean {
  if (is.dev || !app.isPackaged) return false
  if (process.platform === 'win32') return true
  if (process.platform === 'linux') return !!process.env.APPIMAGE
  return false
}

/**
 * Prepara gli aggiornamenti dell'app dai release pubblicati su GitHub (le bozze non contano).
 * La versione nuova si scarica in background e si installa alla chiusura dell'app, o subito con
 * `installUpdate`. Con `checkNow` il primo controllo parte subito.
 */
export function initUpdater(checkNow: boolean): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = null

  autoUpdater.on('checking-for-update', () => setStatus({ state: 'checking' }))
  autoUpdater.on('update-not-available', () => setStatus({ state: 'upToDate' }))
  autoUpdater.on('update-available', (info) =>
    setStatus({ state: 'downloading', version: info.version, percent: 0 })
  )
  autoUpdater.on('download-progress', (progress) => {
    if (status.state === 'downloading')
      setStatus({ ...status, percent: Math.round(progress.percent) })
  })
  autoUpdater.on('update-downloaded', (info) =>
    setStatus({ state: 'ready', version: info.version })
  )
  autoUpdater.on('error', (e) => setStatus({ state: 'error', message: e?.message ?? String(e) }))

  if (checkNow) void checkForUpdates()
}

/**
 * Controlla se c'è una versione nuova. Dove l'app non si aggiorna da sola legge soltanto
 * l'ultima versione pubblicata, per segnalarla con il link alla pagina dei release.
 */
export async function checkForUpdates(): Promise<UpdateStatus> {
  if (status.state === 'checking' || status.state === 'downloading' || status.state === 'ready')
    return status
  if (!canSelfUpdate()) {
    setStatus({ state: 'unsupported', latest: await latestPublishedVersion() })
    return status
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (e) {
    setStatus({ state: 'error', message: e instanceof Error ? e.message : String(e) })
  }
  return status
}

/** Chiude l'app e installa la versione scaricata. */
export function installUpdate(): void {
  if (status.state === 'ready') autoUpdater.quitAndInstall()
}

/** Versione dell'ultimo release pubblicato su GitHub (senza la `v`); `null` se non si legge. */
async function latestPublishedVersion(): Promise<string | null> {
  try {
    const res = await fetch(
      'https://api.github.com/repos/NightHvnter/DeadlockModManager/releases/latest',
      { headers: { Accept: 'application/vnd.github+json' } }
    )
    if (!res.ok) return null
    const tag = ((await res.json()) as { tag_name?: string }).tag_name
    return tag ? tag.replace(/^v/, '') : null
  } catch {
    return null
  }
}
