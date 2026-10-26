import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, normalize, relative, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { AppError } from '../i18n'

/**
 * Formato "Deadlock Mod Interchange" del Deadlock Mod Manager ufficiale
 * (github.com/deadlock-mod-manager/deadlock-mod-manager, `commands/mod_interchange/format.rs`):
 * una cartella con `mod-interchange.json` e i VPK in `files/`. Serve a spostare le mod tra
 * manager diversi; qui si leggono e si scrivono solo le mod, non i profili e i mirini.
 */
export const FORMAT_ID = 'deadlock-mod-interchange'
export const FORMAT_VERSION = 1
export const MANIFEST_FILENAME = 'mod-interchange.json'
/** Nome di questa app in `source.manager` e nelle `extensions` delle mod esportate. */
export const MANAGER_ID = 'nighthvnter-deadlock-mod-manager'

export type InterchangeOrigin =
  | {
      provider: 'gamebanana'
      submissionType: 'mod' | 'sound'
      submissionId: string
      fileId?: number
      fileName?: string
    }
  | { provider: 'local'; localId?: string }

export interface InterchangeFile {
  name: string
  /** Percorso relativo alla cartella del pacchetto. */
  path: string
  sha256?: string
  size?: number
  /** `false` per i file alternativi non scelti; assente vale `true`. */
  selected?: boolean
}

export interface InterchangeMod {
  key: string
  name: string
  enabled: boolean
  order: number
  origin: InterchangeOrigin
  author?: string | null
  description?: string | null
  category?: string | null
  hero?: string | null
  thumbnailUrl?: string | null
  link?: string | null
  nsfw?: boolean | null
  files: InterchangeFile[]
  extensions?: Record<string, unknown>
}

export interface InterchangeDocument {
  format: string
  version: number
  createdAt?: string
  source: { manager: string; managerVersion?: string; profileName?: string }
  contents: string[]
  mods: InterchangeMod[]
  warnings?: string[]
}

/** Id della mod nell'app (`Mod-123`, `Sound-123`) per un'origine di GameBanana. */
export function appIdOf(origin: InterchangeOrigin): string | null {
  if (origin.provider !== 'gamebanana' || !/^\d+$/.test(origin.submissionId)) return null
  return `${origin.submissionType === 'sound' ? 'Sound' : 'Mod'}-${origin.submissionId}`
}

/** Origine e chiave nel formato per una mod dell'app con id `modId`. */
export function originOf(
  modId: string,
  fileName: string | null
): { key: string; origin: InterchangeOrigin } {
  const remote = /^(Mod|Sound)-(\d+)$/.exec(modId)
  if (!remote) return { key: `local:${modId}`, origin: { provider: 'local', localId: modId } }
  const type = remote[1] === 'Sound' ? 'sound' : 'mod'
  return {
    key: `gamebanana:${type}:${remote[2]}`,
    origin: {
      provider: 'gamebanana',
      submissionType: type,
      submissionId: remote[2],
      ...(fileName ? { fileName } : {})
    }
  }
}

/** Testo minuscolo sicuro per i nomi di file e cartelle, come lo `slugify` del manager ufficiale. */
export function slugify(value: string, maxLength: number): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .slice(0, maxLength)
    .replace(/^_+|_+$/g, '')
  return slug || 'mod'
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(path), hash)
  return hash.digest('hex')
}

/**
 * Legge il pacchetto in `path` (la cartella o il suo `mod-interchange.json`). Come il manager
 * ufficiale è tollerante: una mod illeggibile viene saltata, non blocca l'importazione.
 * @returns il documento e la cartella del pacchetto, a cui sono relativi i percorsi dei file
 * @throws Se il file manca, non è JSON o non è un documento del formato
 */
export async function readBundle(
  path: string
): Promise<{ document: InterchangeDocument; base: string }> {
  const manifest = (await stat(path).catch(() => null))?.isDirectory()
    ? join(path, MANIFEST_FILENAME)
    : path
  let raw: Partial<InterchangeDocument>
  try {
    raw = JSON.parse(await readFile(manifest, 'utf8'))
  } catch {
    throw new AppError('error.interchangeUnreadable')
  }
  if (raw?.format !== FORMAT_ID) throw new AppError('error.interchangeFormat')
  if (!raw.version || raw.version > FORMAT_VERSION)
    throw new AppError('error.interchangeVersion', { version: String(raw.version) })

  const mods = (Array.isArray(raw.mods) ? raw.mods : []).filter(
    (m): m is InterchangeMod =>
      !!m && typeof m.key === 'string' && typeof m.name === 'string' && !!m.origin
  )
  return {
    document: {
      format: FORMAT_ID,
      version: raw.version,
      createdAt: raw.createdAt,
      source: raw.source ?? { manager: '' },
      contents: raw.contents ?? ['mods'],
      mods: mods.map((m) => ({ ...m, files: Array.isArray(m.files) ? m.files : [] })),
      warnings: raw.warnings
    },
    base: dirname(manifest)
  }
}

/**
 * Percorso assoluto del file `relativePath` del pacchetto; `null` se è assoluto o esce dalla
 * cartella del pacchetto (con `..`).
 */
export function resolveBundlePath(base: string, relativePath: string): string | null {
  if (!relativePath || isAbsolute(relativePath)) return null
  const resolved = normalize(join(base, relativePath))
  const rel = relative(base, resolved)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null
  return resolved
}

/** Nome sicuro per un VPK: un solo componente che finisce in `.vpk`, senza caratteri vietati. */
export const isPlainVpkName = (name: string): boolean =>
  !!name &&
  basename(name) === name &&
  !name.includes(sep) &&
  !/[<>:"|?*\\/]/.test(name) &&
  ![...name].some((c) => c.charCodeAt(0) < 0x20) &&
  name.toLowerCase().endsWith('.vpk')
