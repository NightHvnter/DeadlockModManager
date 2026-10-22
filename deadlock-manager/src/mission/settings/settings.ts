import { app } from 'electron'
import { execFile } from 'node:child_process'
import { access, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { AppError } from '../i18n'
import { DEFAULT_SETTINGS, type Settings } from '../types'

const settingsPath = (): string => join(app.getPath('userData'), 'settings.json')

export async function readSettings(): Promise<Settings> {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(await readFile(settingsPath(), 'utf8')) }
  } catch {
    return { ...DEFAULT_SETTINGS } // file assente o illeggibile: impostazioni di default
  }
}

/** Unisce `patch` alle impostazioni salvate e restituisce il risultato. */
export async function writeSettings(patch: Partial<Settings>): Promise<Settings> {
  const settings = { ...(await readSettings()), ...patch }
  await writeFile(settingsPath(), JSON.stringify(settings, null, 2))
  return settings
}

const exists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false
  )

/** `true` se `path` è la cartella di Deadlock (contiene `game/citadel/gameinfo.gi`). */
export function isValidGamePath(path: string): Promise<boolean> {
  return exists(join(path, 'game', 'citadel', 'gameinfo.gi'))
}

/** Restituisce il percorso del gioco salvato, o un errore se manca o non è valido. */
export async function requireGamePath(): Promise<string> {
  const { gamePath } = await readSettings()
  if (!gamePath) throw new AppError('error.gamePathNotSet')
  if (!(await isValidGamePath(gamePath)))
    throw new AppError('error.gamePathInvalid', { path: gamePath })
  return gamePath
}

/** Cartella di Steam letta dal registro di Windows, se presente. */
async function steamPathFromRegistry(): Promise<string | null> {
  if (process.platform !== 'win32') return null
  try {
    const { stdout } = await promisify(execFile)('reg', [
      'query',
      'HKCU\\Software\\Valve\\Steam',
      '/v',
      'SteamPath'
    ])
    return /SteamPath\s+REG_SZ\s+(.+)/.exec(stdout)?.[1].trim() ?? null
  } catch {
    return null
  }
}

/** Possibili cartelle di installazione di Steam per il sistema corrente. */
async function steamRoots(): Promise<string[]> {
  const home = homedir()
  switch (process.platform) {
    case 'win32':
      return [
        await steamPathFromRegistry(),
        join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Steam'),
        join(process.env['ProgramFiles'] ?? 'C:\\Program Files', 'Steam')
      ].filter((p): p is string => !!p)
    case 'darwin':
      return [join(home, 'Library', 'Application Support', 'Steam')]
    default:
      return [
        join(home, '.local', 'share', 'Steam'),
        join(home, '.steam', 'steam'),
        join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam')
      ]
  }
}

/** Librerie di Steam elencate in `libraryfolders.vdf`, più la cartella di Steam stessa. */
async function steamLibraries(root: string): Promise<string[]> {
  const libraries = [root]
  try {
    const vdf = await readFile(join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8')
    for (const [, path] of vdf.matchAll(/"path"\s+"([^"]+)"/g)) {
      libraries.push(path.replace(/\\\\/g, '\\'))
    }
  } catch {
    // nessun file delle librerie: resta solo la cartella principale
  }
  return libraries
}

/** Cerca Deadlock nelle librerie di Steam. Restituisce `null` se non lo trova. */
export async function detectGamePath(): Promise<string | null> {
  for (const root of await steamRoots()) {
    for (const library of await steamLibraries(root)) {
      const candidate = join(library, 'steamapps', 'common', 'Deadlock')
      if (await isValidGamePath(candidate)) return candidate
    }
  }
  return null
}
