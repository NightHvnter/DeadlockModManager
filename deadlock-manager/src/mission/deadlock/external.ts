import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { HEROES } from '../types'
import { VpkReader } from './vpk'

/** Nome di un eroe senza spazi e simboli, come compare nei percorsi: "Lady Geist" → "ladygeist". */
const compact = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Nome interno degli eroi nei file del gioco, quando è diverso da quello visibile (es.
 * `models/heroes_staging/gigawatt/...` è Seven). Gli altri eroi usano il loro nome.
 */
const HERO_CODENAMES: Record<string, string> = {
  atlas: 'Abrams',
  archer: 'Grey Talon',
  orion: 'Grey Talon',
  astro: 'Holliday',
  chrono: 'Paradox',
  forge: 'McGinnis',
  ghost: 'Lady Geist',
  gigawatt: 'Seven',
  necro: 'Graves',
  hornet: 'Vindicta',
  inferno: 'Infernus',
  krill: 'Mo & Krill',
  magician: 'Sinclair',
  nano: 'Calico',
  synth: 'Pocket',
  tengu: 'Ivy',
  viper: 'Vyper'
}

const HERO_BY_SEGMENT = new Map<string, string>([
  ...HEROES.map((h): [string, string] => [compact(h), h]),
  ...Object.entries(HERO_CODENAMES)
])

/** Cartelle in cui un segmento del percorso col nome di un eroe indica davvero quell'eroe. */
const HERO_ROOTS = ['models/', 'materials/', 'sounds/', 'soundevents/', 'particles/']

/** Nome, categoria (come quelle di GameBanana) ed eroe ricavati dal contenuto di un VPK. */
export interface ExternalInfo {
  name: string
  category: string
  hero: string | null
}

/**
 * Indovina cosa contiene un VPK dai percorsi dei suoi file: l'eroe è quello nominato più spesso
 * (come cartella o nome di file), la categoria dipende dalla cartella principale più usata.
 * Un VPK illeggibile restituisce `null`.
 */
export async function guessExternalInfo(dirPath: string): Promise<ExternalInfo | null> {
  const paths = (await VpkReader.open(dirPath).catch(() => null))?.paths()
  if (!paths?.length) return null

  const heroes = new Map<string, number>()
  const roots = new Map<string, number>()
  for (const path of paths) {
    const root = path.includes('/') ? path.slice(0, path.indexOf('/') + 1) : ''
    roots.set(root, (roots.get(root) ?? 0) + 1)
    if (!HERO_ROOTS.includes(root)) continue
    for (const segment of path.split('/')) {
      const hero = HERO_BY_SEGMENT.get(compact(segment.replace(/\..*$/, '')))
      if (hero) heroes.set(hero, (heroes.get(hero) ?? 0) + 1)
    }
  }
  const most = (counts: Map<string, number>): string | null =>
    [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  const hero = most(heroes)
  const root = most(new Map([...roots].filter(([r]) => r)))
  const isVo = paths.some((p) => p.startsWith('sounds/vo/'))
  const category =
    root === 'panorama/'
      ? 'HUD'
      : root === 'sounds/' || root === 'soundevents/'
        ? isVo
          ? 'VOs'
          : hero
            ? 'Abilities'
            : 'Sound Packs'
        : root === 'models/' || root === 'materials/'
          ? hero
            ? 'Skins'
            : 'Model Replacement'
          : 'Other/Misc'
  return { name: hero ? `${hero} · ${category}` : category, category, hero }
}

/**
 * VPK attivi installati dal Deadlock Mod Manager ufficiale, letti dal suo `addons/.dmm.json`:
 * nome del file in `addons` → id numerico della mod su GameBanana. Vuoto se il file non c'è.
 */
export async function readDmmManifest(addons: string): Promise<Map<string, string>> {
  const files = new Map<string, string>()
  try {
    const dmm = JSON.parse(await readFile(join(addons, '.dmm.json'), 'utf8'))
    for (const [id, mod] of Object.entries<{ enabled?: boolean; currentVpks?: unknown }>(
      dmm?.mods ?? {}
    )) {
      if (!mod?.enabled || !Array.isArray(mod.currentVpks)) continue
      for (const f of mod.currentVpks) if (typeof f === 'string') files.set(f, id)
    }
  } catch {
    // file assente o in un formato sconosciuto: nessuna associazione
  }
  return files
}

/**
 * Prefisso con cui il Deadlock Mod Manager ufficiale lascia in `addons` i file delle mod
 * disattivate (`<id>_<nome originale>.vpk`, che il gioco non carica): l'id numerico di
 * GameBanana per le mod, `snd-<id>` per i suoni, `wip-<id>` per i WIP, `local-<uuid>` per le mod
 * aggiunte a mano.
 */
const PARKED_PREFIX =
  /^((?:snd-|wip-)?\d+|local-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_(.+\.vpk)$/i

/** Nome originale di un file parcheggiato dal manager ufficiale (`623518_pak05_dir.vpk` → `pak05_dir.vpk`). */
export const unparkedName = (file: string): string => PARKED_PREFIX.exec(file)?.[2] ?? file

/** File di una mod disattivata da un altro manager, rimasti in `dir`. */
export interface ParkedGroup {
  dir: string
  files: string[]
  /** Prefisso del Deadlock Mod Manager ufficiale (es. `623518` o `snd-1234`), se c'è. */
  slug: string | null
}

/** Id numerico di GameBanana nel prefisso `slug`, se indica una mod o un suono pubblicati. */
export const remoteIdOfSlug = (slug: string | null): string | null =>
  /^(?:snd-)?(\d+)$/.exec(slug ?? '')?.[1] ?? null

/** Gruppi `<base>_dir.vpk` + parti `<base>_000.vpk` e VPK a file unico tra `files`. */
function vpkGroups(files: string[]): string[][] {
  const groups = new Map<string, string[]>()
  for (const f of files) {
    if (!f.toLowerCase().endsWith('.vpk')) continue
    const base = /^(.*)_(?:dir|\d{3})\.vpk$/i.exec(f)?.[1] ?? f
    groups.set(base, [...(groups.get(base) ?? []), f])
  }
  // le parti numerate senza il loro `_dir.vpk` non si possono caricare
  return [...groups.values()].filter(
    (g) => g.some((f) => /_dir\.vpk$/i.test(f)) || !/_\d{3}\.vpk$/i.test(g[0])
  )
}

/**
 * Mod disattivate da altri manager: i file con il prefisso del Deadlock Mod Manager ufficiale in
 * `addons` (un gruppo per mod) e i VPK nella cartella `addons/.disabled` di Grimoire (un gruppo
 * per VPK, con il prefisso del manager ufficiale se Grimoire ci ha spostato i suoi file).
 */
export async function findParkedMods(addons: string): Promise<ParkedGroup[]> {
  const parked: ParkedGroup[] = []
  const bySlug = new Map<string, string[]>()
  for (const f of await readdir(addons).catch((): string[] => [])) {
    const slug = PARKED_PREFIX.exec(f)?.[1]
    if (slug) bySlug.set(slug, [...(bySlug.get(slug) ?? []), f])
  }
  for (const [slug, files] of bySlug) {
    const usable = vpkGroups(files).flat()
    if (usable.length) parked.push({ dir: addons, files: usable.sort(), slug })
  }

  const grimoire = join(addons, '.disabled')
  for (const files of vpkGroups(await readdir(grimoire).catch((): string[] => []))) {
    parked.push({
      dir: grimoire,
      files: files.sort(),
      slug: PARKED_PREFIX.exec(files[0])?.[1] ?? null
    })
  }
  return parked
}
