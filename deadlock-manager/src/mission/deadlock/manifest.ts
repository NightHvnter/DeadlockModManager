import { join } from 'node:path'
import { app } from 'electron'
import { readFile, stat, writeFile } from 'node:fs/promises'
import type { InstalledMod } from '../types'

type Manifest = Record<string, InstalledMod>

const manifestPath = (): string => join(app.getPath('userData'), 'installed.json')

/** Cartella in cui finiscono i file delle mod disattivate (una sottocartella per mod). */
export const disabledDir = (modId: string): string =>
  join(app.getPath('userData'), 'disabled', modId)

/**
 * Campi del formato `{ format, version, savedAt, gamePath, mods }` usato da una versione di
 * sviluppo dell'app: non sono mod.
 */
const WRAPPER_KEYS = new Set(['format', 'version', 'savedAt', 'gamePath', 'mods'])

type RawEntry = InstalledMod | string[]

/** `true` per una voce del manifest: l'elenco dei file (versioni vecchie) o una mod con `files`. */
const isEntry = (v: unknown): v is RawEntry =>
  Array.isArray(v)
    ? v.every((f) => typeof f === 'string')
    : !!v && typeof v === 'object' && Array.isArray((v as InstalledMod).files)

/**
 * Voci del file letto. Una versione di sviluppo salvava le mod dentro `mods`, con altri campi
 * accanto; riaprendo quel file con questa versione i campi venivano presi per mod (senza id,
 * "non disponibili" e impossibili da togliere) e le mod vere salvate accanto a loro. In quel
 * caso valgono le voci accanto, scritte per ultime; altrimenti quelle di `mods`, i cui file
 * disattivati dal manager ufficiale stanno in `addons` (`parked`, qui `parkedIn`).
 */
function rawEntries(raw: Record<string, unknown>): [string, RawEntry][] {
  const top = Object.entries(raw).filter(
    (e): e is [string, RawEntry] => !WRAPPER_KEYS.has(e[0]) && isEntry(e[1])
  )
  const nested = raw.mods
  if (top.length > 0 || !nested || typeof nested !== 'object') return top
  const addons =
    typeof raw.gamePath === 'string' ? join(raw.gamePath, 'game', 'citadel', 'addons') : null
  return Object.entries(nested as Record<string, unknown>)
    .filter((e): e is [string, RawEntry] => isEntry(e[1]))
    .map(([id, entry]) => {
      if (Array.isArray(entry) || !(entry as { parked?: boolean }).parked || !addons)
        return [id, entry]
      const converted: InstalledMod & { parked?: boolean } = { ...entry, parkedIn: addons }
      delete converted.parked
      return [id, converted]
    })
}

export async function readManifest(): Promise<Manifest> {
  let raw: unknown
  try {
    raw = JSON.parse(await readFile(manifestPath(), 'utf8'))
  } catch {
    return {} // file assente o illeggibile: nessuna mod installata
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  // Le versioni precedenti salvavano solo l'elenco dei file
  const manifest: Manifest = {}
  for (const [id, entry] of rawEntries(raw as Record<string, unknown>)) {
    manifest[id] = Array.isArray(entry)
      ? {
          id,
          files: entry,
          enabled: true,
          installedAt: null,
          fileName: null,
          name: id,
          author: '',
          category: '',
          hero: null,
          image: null
        }
      : { ...entry, id }
  }
  return manifest
}

/** Data dell'ultimo salvataggio del manifest in millisecondi, `-1` se non è mai stato salvato. */
export async function manifestSavedAt(): Promise<number> {
  return stat(manifestPath()).then(
    (s) => s.mtimeMs,
    () => -1
  )
}

export async function writeManifest(manifest: Manifest): Promise<void> {
  await writeFile(manifestPath(), JSON.stringify(manifest, null, 2))
}

/** Id delle mod installate, utile per mostrare "Installata" nell'interfaccia. */
export async function getInstalledModIds(): Promise<string[]> {
  return Object.keys(await readManifest())
}

/** Mod installate, dalla più recente. */
export async function getInstalledMods(): Promise<InstalledMod[]> {
  return Object.values(await readManifest()).sort((a, b) =>
    (b.installedAt ?? '').localeCompare(a.installedAt ?? '')
  )
}
