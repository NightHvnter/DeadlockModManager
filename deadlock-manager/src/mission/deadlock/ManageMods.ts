import {
  GameinfoStatus,
  InstalledMod,
  InterchangeExportResult,
  InterchangeImportResult,
  InterfaceColors,
  InterfaceColorsResult,
  Mod,
  AcceptedConflict,
  ModConflict,
  ModChangelogEntry,
  ModDownload
} from '../types'
import { AppError } from '../i18n'

import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebStream } from 'node:stream/web'
import { disabledDir, manifestSavedAt, readManifest, writeManifest } from './manifest'
import { isPatched, patch } from './gameinfo'
import { extractZip as extract } from '../func/extractZip'
import { extractRar } from '../func/extractRar'
import { gameBanana, parseModId } from '../gamebanana'
import {
  buildColorStyles,
  hasCustomColors,
  readColorsState,
  writeColorsState
} from './interfaceColors'
import { buildVpk, VpkReader } from './vpk'
import {
  findParkedMods,
  guessExternalInfo,
  readDmmManifest,
  remoteIdOfSlug,
  unparkedName
} from './external'
import {
  FORMAT_ID,
  FORMAT_VERSION,
  MANAGER_ID,
  MANIFEST_FILENAME,
  appIdOf,
  isPlainVpkName,
  originOf,
  readBundle,
  resolveBundlePath,
  sha256File,
  slugify,
  type InterchangeDocument,
  type InterchangeFile
} from './interchange'
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Copia di un file sul server dei file di GameBanana (`/mods/...` per le mod, `/sounds/...` per i suoni). */
function filesServerUrl(modId: string, fileName: string): string | undefined {
  const ref = parseModId(modId)
  if (!ref) return undefined
  return `https://files.gamebanana.com/${ref.type.toLowerCase()}s/${encodeURIComponent(fileName)}`
}

/** Chiamata con i byte ricevuti e quelli totali (`0` se sconosciuti) durante il download. */
export type ProgressCallback = (received: number, total: number) => void

/** Mod del catalogo con l'id numerico di GameBanana `remoteId` (es. `"623518"`), se c'è. */
export type ExternalLookup = (remoteId: string) => Mod | undefined

export class ManageMods {
  /** Coda delle operazioni: due installazioni insieme potrebbero scegliere lo stesso `pakNN`. */
  private static queue: Promise<unknown> = Promise.resolve()

  /**
   * Chiamata dopo ogni operazione della coda, riuscita o no, ancora dentro la coda: serve ai
   * profili per seguire le modifiche alle mod (vedi `./profiles`). Un suo errore viene ignorato.
   */
  public static onChange: (() => Promise<void>) | null = null

  /** Esegue `fn` dopo che le operazioni precedenti sono terminate. */
  private static exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn).finally(() => this.onChange?.().catch(() => {}))
    this.queue = run.catch(() => {})
    return run
  }

  public static installMod(
    mod: Mod,
    gamePath: string,
    download?: ModDownload,
    onProgress?: ProgressCallback
  ): Promise<string[]> {
    return this.doInstall(mod, gamePath, download, onProgress)
  }

  /**
   * Scarica la mod fuori dalla coda delle operazioni, così un download lungo non blocca l'elenco
   * delle mod installate, l'ordine di caricamento o "Gioca"; poi la installa con `installArchive`.
   */
  private static async doInstall(
    mod: Mod,
    gamePath: string,
    download?: ModDownload,
    onProgress?: ProgressCallback
  ): Promise<string[]> {
    if ((await readManifest())[mod.id]) throw new AppError('error.alreadyInstalled')

    const tmp = await mkdtemp(join(tmpdir(), 'deadlock-mod-'))
    try {
      const file = download ?? (await this.getDownloads(mod.id))[0]
      if (!file) throw new AppError('error.noDownloads')

      // 1. Download e verifica
      const archive = join(tmp, basename(file.name))
      await this.downloadFile(
        file.url,
        archive,
        file.size,
        onProgress,
        filesServerUrl(mod.id, file.name)
      )
      if (file.md5Checksum && (await this.md5(archive)) !== file.md5Checksum.toLowerCase()) {
        throw new AppError('error.checksum')
      }

      return await this.installArchive(archive, tmp, gamePath, (manifest) => {
        // durante il download potrebbe essere stata installata da un'altra richiesta
        if (manifest[mod.id]) throw new AppError('error.alreadyInstalled')
        return {
          id: mod.id,
          files: [],
          enabled: true,
          installedAt: new Date().toISOString(),
          fileName: file.name,
          name: mod.name,
          author: mod.author,
          category: mod.category,
          hero: mod.hero,
          image: mod.thumbnailUrl ?? mod.images[0] ?? null
        }
      })
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  }

  /**
   * Installa una mod da un file sul computer (`.zip`, `.rar` o `.vpk`), per esempio scaricato a
   * mano o non pubblicato su GameBanana. Diventa una mod esterna (`Local-<nome del file>`), con
   * il nome del file e la categoria e l'eroe ricavati dal contenuto; si può collegare a una mod di
   * GameBanana dalla pagina Installate.
   */
  public static async installLocal(path: string, gamePath: string): Promise<InstalledMod> {
    const tmp = await mkdtemp(join(tmpdir(), 'deadlock-mod-'))
    try {
      const name = basename(path, extname(path))
      const addons = join(gamePath, 'game', 'citadel', 'addons')
      let id = ''
      const files = await this.installArchive(path, tmp, gamePath, (manifest) => {
        const base = `Local-${slugify(name, 40)}`
        id = base
        for (let n = 2; manifest[id]; n++) id = `${base}-${n}`
        return {
          id,
          files: [],
          enabled: true,
          installedAt: new Date().toISOString(),
          fileName: basename(path),
          name,
          author: '',
          category: '',
          hero: null,
          image: null,
          external: true
        }
      })
      // categoria ed eroe dal contenuto, come per le mod trovate in addons
      const dir = files.find((f) => /_dir\.vpk$/i.test(f))
      const info = dir && (await guessExternalInfo(join(addons, dir)))
      return this.exclusive(async () => {
        const manifest = await readManifest()
        if (info && manifest[id]) {
          manifest[id].category = info.category
          manifest[id].hero = info.hero
          await writeManifest(manifest)
        }
        return manifest[id]
      })
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  }

  /**
   * Estrae `archive` (`.zip`, `.rar` o `.vpk`) nella cartella temporanea `tmp` e copia i suoi VPK
   * in `addons` con il prefisso `pakNN`, poi registra la mod nel manifest con la voce data da
   * `entry` (che riceve il manifest attuale e può rifiutare con un errore). Solo la copia e il
   * manifest passano dalla coda delle operazioni, dove serve scegliere i `pakNN` liberi.
   * @returns i file copiati in `addons`
   */
  private static async installArchive(
    archive: string,
    tmp: string,
    gamePath: string,
    entry: (manifest: Record<string, InstalledMod>) => InstalledMod
  ): Promise<string[]> {
    const citadel = join(gamePath, 'game', 'citadel')
    const addons = join(citadel, 'addons')
    const installed: string[] = []

    // 2. Estrazione
    const extracted = join(tmp, 'extracted')
    await mkdir(extracted)
    const ext = extname(archive).toLowerCase()
    if (ext === '.zip') await extract(archive, extracted)
    else if (ext === '.rar') await extractRar(archive, extracted)
    else if (ext === '.vpk') await copyFile(archive, join(extracted, basename(archive)))
    else throw new AppError('error.unsupportedFormat', { ext })

    // 3. Copia dei VPK in addons con il prefisso pakNN. Due formati:
    //    - VPK diviso: `<nome>_dir.vpk` più le parti `<nome>_000.vpk`, `<nome>_001.vpk`, ...
    //    - VPK a file unico: `<nome>.vpk`, che il gioco carica rinominato `pakNN_dir.vpk`
    const all = (await readdir(extracted, { recursive: true })).filter((f) =>
      f.toLowerCase().endsWith('.vpk')
    )
    const split = all.filter((f) => f.toLowerCase().endsWith('_dir.vpk'))
    const single = all.filter(
      (f) => !f.toLowerCase().endsWith('_dir.vpk') && !/_\d{3}\.vpk$/i.test(f)
    )
    if (split.length + single.length === 0) throw new AppError('error.noVpk')

    try {
      return await this.exclusive(async () => {
        const manifest = await readManifest()
        const item = entry(manifest)
        await mkdir(addons, { recursive: true })
        for (const rel of split) {
          const dir = join(extracted, dirname(rel))
          const base = basename(rel).slice(0, -'_dir.vpk'.length)
          await this.placeVpkGroup(dir, base, addons, installed)
        }
        for (const rel of single) {
          const target = `pak${await this.nextFreeIndex(addons)}_dir.vpk`
          await copyFile(join(extracted, rel), join(addons, target))
          installed.push(target)
        }

        // 4. Abilita la cartella addons nel gioco
        await this.ensureAddonsSearchPath(citadel)

        manifest[item.id] = { ...item, files: installed }
        await writeManifest(manifest)
        return installed
      })
    } catch (e) {
      // non lascia in addons i file di un'installazione a metà
      await Promise.all(installed.map((f) => rm(join(addons, f), { force: true })))
      throw e
    }
  }

  /**
   * Copia in `addons` il `<base>_dir.vpk` di `dir` e le sue parti numerate (`<base>_000.vpk`, ...)
   * con il prefisso `pakNN` dato da `nextFreeIndex`, aggiungendo i nomi copiati a `placed`.
   */
  private static async placeVpkGroup(
    dir: string,
    base: string,
    addons: string,
    placed: string[]
  ): Promise<void> {
    const prefix = `pak${await this.nextFreeIndex(addons)}`
    const parts = (await readdir(dir)).filter(
      (f) => f === `${base}_dir.vpk` || new RegExp(`^${escapeRegExp(base)}_\\d{3}\\.vpk$`).test(f)
    )
    for (const part of parts) {
      const target = `${prefix}${part.slice(base.length)}`
      await copyFile(join(dir, part), join(addons, target))
      placed.push(target)
    }
  }

  /**
   * Copia in `addons` i VPK `files` di `dir` con nuovi indici `pakNN`: ogni `<base>_dir.vpk` con
   * le sue parti (vedi `placeVpkGroup`) e ogni VPK a file unico come `pakNN_dir.vpk`. Le parti
   * numerate senza il loro `_dir.vpk` vengono ignorate.
   */
  private static async placeVpkFiles(
    dir: string,
    files: string[],
    addons: string,
    placed: string[]
  ): Promise<void> {
    for (const f of files) {
      if (/_dir\.vpk$/i.test(f)) {
        await this.placeVpkGroup(dir, f.slice(0, -'_dir.vpk'.length), addons, placed)
      } else if (!/_\d{3}\.vpk$/i.test(f)) {
        const target = `pak${await this.nextFreeIndex(addons)}_dir.vpk`
        await copyFile(join(dir, f), join(addons, target))
        placed.push(target)
      }
    }
  }

  /**
   * File scaricabili di una mod, letti dalla sua `DownloadPage` su GameBanana (dal più
   * recente), esclusi quelli archiviati dall'autore.
   */
  public static async getDownloads(modId: string): Promise<ModDownload[]> {
    const ref = parseModId(modId)
    if (!ref) throw new AppError('error.modNotFound')
    const page = await gameBanana.downloadPage(ref.type, ref.id)
    return (page._aFiles ?? [])
      .filter((f) => !f._bIsArchived)
      .sort((a, b) => b._tsDateAdded - a._tsDateAdded)
      .map((f) => ({
        url: f._sDownloadUrl,
        size: f._nFilesize,
        name: f._sFile,
        md5Checksum: f._sMd5Checksum || null,
        description: f._sDescription || null
      }))
  }

  /** Prima pagina del changelog di una mod, dalla voce più recente. */
  public static async getChangelog(modId: string): Promise<ModChangelogEntry[]> {
    const ref = parseModId(modId)
    if (!ref) throw new AppError('error.modNotFound')
    const page = await gameBanana.updates(ref.type, ref.id, 1)
    return (page._aRecords ?? []).map((u) => ({
      title: u._sName,
      version: u._sVersion || null,
      date: new Date(u._tsDateAdded * 1000).toISOString(),
      text: u._sText || null,
      changes: (u._aChangeLog ?? []).map((c) => ({ text: c.text, category: c.cat }))
    }))
  }

  /**
   * Scarica `url` in `dest`. Per alcuni file il link `/dl/<id>` di GameBanana risponde 200 con
   * una pagina d'errore HTML invece del file: in quel caso, o se la richiesta fallisce, riprova da
   * `fallbackUrl`. Una pagina HTML non è mai il file, quindi diventa "download fallito" e non un
   * checksum sbagliato.
   */
  private static async downloadFile(
    url: string,
    dest: string,
    size: number,
    onProgress?: ProgressCallback,
    fallbackUrl?: string
  ): Promise<void> {
    const isFile = (r: Response): boolean =>
      r.ok && !!r.body && !r.headers.get('content-type')?.includes('text/html')
    let res = await fetch(url)
    if (!isFile(res) && fallbackUrl) {
      await res.body?.cancel()
      res = await fetch(fallbackUrl)
    }
    if (!isFile(res))
      throw new AppError('error.downloadFailed', { status: res.ok ? 502 : res.status })
    const total = Number(res.headers.get('content-length')) || size || 0
    let received = 0
    let lastReport = 0
    const counter = new Transform({
      transform(chunk: Buffer, _, done) {
        received += chunk.length
        // al massimo un aggiornamento ogni 100 ms
        if (onProgress && Date.now() - lastReport > 100) {
          lastReport = Date.now()
          onProgress(received, total)
        }
        done(null, chunk)
      }
    })
    await pipeline(Readable.fromWeb(res.body as WebStream), counter, createWriteStream(dest))
    onProgress?.(received, total)
  }

  private static async md5(path: string): Promise<string> {
    const hash = createHash('md5')
    await pipeline(createReadStream(path), hash)
    return hash.digest('hex')
  }

  /**
   * Indice a due cifre ("01"..."99") per una mod nuova o riattivata: quello dopo il più alto
   * già usato in `addons`, così finisce in fondo all'ordine di caricamento (priorità più bassa)
   * invece di occupare un buco lasciato da una mod disattivata. Se dopo non c'è posto, usa il
   * primo indice libero.
   */
  private static async nextFreeIndex(addons: string): Promise<string> {
    const used = (await readdir(addons))
      .map((f) => Number(/^pak(\d{2})_/.exec(f)?.[1]))
      .filter((n) => n > 0)
    const after = Math.max(0, ...used) + 1
    if (after < 100) return String(after).padStart(2, '0')
    for (let i = 1; i < 100; i++) if (!used.includes(i)) return String(i).padStart(2, '0')
    throw new AppError('error.noFreeIndex')
  }

  /**
   * Aggiunge al manifest come mod esterne (`external: true`) i gruppi `pakNN_*.vpk` di `addons`
   * che l'app non conosce, così si possono vedere, disattivare, riordinare e disinstallare come
   * le altre. Il nome viene ricavato dal contenuto del VPK; se il Deadlock Mod Manager ufficiale
   * ha lasciato in `addons/.dmm.json` la mod di GameBanana da cui arriva il file e `lookup` la
   * trova nel catalogo, la mod esterna viene collegata a quella (vedi `linkMod`); `.dmm.json`
   * viene ignorato se è più vecchio dell'ultimo salvataggio di questa app. Toglie le mod
   * esterne attive i cui file non ci sono più. Il VPK dei colori e le parti numerate senza
   * `_dir.vpk` vengono ignorati.
   * @param lookup Mod del catalogo con quell'id numerico di GameBanana, se c'è
   */
  public static syncExternal(gamePath: string, lookup: ExternalLookup): Promise<void> {
    return this.exclusive(() => this.doSyncExternal(gamePath, lookup))
  }

  private static async doSyncExternal(gamePath: string, lookup?: ExternalLookup): Promise<void> {
    const addons = join(gamePath, 'game', 'citadel', 'addons')
    // se addons non si legge (disco scollegato, permessi) non si toglie nessuna mod
    const present = await readdir(addons).catch((): string[] | null => null)
    if (!present) return
    const manifest = await readManifest()
    const colorsFile = (await readColorsState()).file
    let changed = false
    // `.dmm.json` vale solo se il manager ufficiale l'ha scritto dopo l'ultimo salvataggio di
    // questa app: altrimenti può descrivere file che nel frattempo l'app ha rinominato (per
    // esempio cambiando l'ordine di caricamento) e collegare la mod sbagliata
    const dmmIsFresh =
      Object.keys(manifest).length === 0 ||
      (await stat(join(addons, '.dmm.json')).then(
        (s) => s.mtimeMs,
        () => -1
      )) >= (await manifestSavedAt())

    for (const [id, entry] of Object.entries(manifest)) {
      if (entry.external && entry.enabled && !entry.files.some((f) => present.includes(f))) {
        delete manifest[id]
        changed = true
      }
      // mod disattivata da un altro manager i cui file sono spariti (riattivata o tolta da lui).
      // `parkedIn` è un percorso assoluto: se la cartella del gioco è cambiata (libreria di
      // Steam spostata, percorso scritto diversamente) i file si cercano nelle cartelle attuali
      if (!entry.enabled && entry.parkedIn) {
        const grimoire = join(addons, '.disabled')
        const candidates = [
          entry.parkedIn,
          ...(basename(entry.parkedIn) === '.disabled' ? [grimoire, addons] : [addons, grimoire])
        ]
        let found: string | undefined
        for (const dir of candidates) {
          const parked = await readdir(dir).catch((): string[] => [])
          if (entry.files.some((f) => parked.includes(f))) {
            found = dir
            break
          }
        }
        if (!found) {
          delete manifest[id]
          changed = true
        } else if (found !== entry.parkedIn) {
          entry.parkedIn = found
          changed = true
        }
      }
    }

    const known = new Set(
      Object.values(manifest)
        .filter((e) => e.enabled)
        .flatMap((e) => e.files)
    )
    if (colorsFile) known.add(colorsFile)
    const groups = new Map<string, string[]>()
    for (const f of present) {
      const prefix = /^(pak\d{2})_(?:dir|\d{3})\.vpk$/.exec(f)?.[1]
      if (!prefix || known.has(f)) continue
      groups.set(prefix, [...(groups.get(prefix) ?? []), f])
    }

    for (const [prefix, files] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
      const dir = `${prefix}_dir.vpk`
      if (!files.includes(dir)) continue
      let id = `Local-${prefix}`
      for (let n = 2; manifest[id]; n++) id = `Local-${prefix}-${n}`
      const { mtime } = await stat(join(addons, dir))
      manifest[id] = {
        id,
        files: files.sort(),
        enabled: true,
        installedAt: mtime.toISOString(),
        fileName: dir,
        name: dir,
        author: '',
        category: '',
        hero: null,
        image: null,
        external: true
      }
      changed = true
    }

    // mod disattivate da altri manager: restano dove sono finché non vengono riattivate qui
    const parkedKnown = new Set(
      Object.values(manifest).flatMap((e) =>
        e.parkedIn ? e.files.map((f) => join(e.parkedIn!, f)) : []
      )
    )
    for (const group of await findParkedMods(addons)) {
      if (group.files.some((f) => parkedKnown.has(join(group.dir, f)))) continue
      const remoteId = remoteIdOfSlug(group.slug)
      const mod = remoteId ? lookup?.(remoteId) : undefined
      const first = group.files.find((f) => /_dir\.vpk$/i.test(f)) ?? group.files[0]
      const { mtime } = await stat(join(group.dir, first))
      const common = {
        files: group.files,
        enabled: false,
        installedAt: mtime.toISOString(),
        fileName: first,
        parkedIn: group.dir
      }
      if (mod && !manifest[mod.id]) {
        manifest[mod.id] = {
          ...common,
          id: mod.id,
          name: mod.name,
          author: mod.author,
          category: mod.category,
          hero: mod.hero,
          image: mod.thumbnailUrl ?? mod.images[0] ?? null
        }
      } else {
        const base = `Local-${group.slug ?? first.replace(/(_dir)?\.vpk$/i, '')}`
        let id = base
        for (let n = 2; manifest[id]; n++) id = `${base}-${n}`
        manifest[id] = {
          ...common,
          id,
          name: first,
          author: '',
          category: '',
          hero: null,
          image: null,
          external: true
        }
      }
      changed = true
    }

    // nome dal contenuto per le mod esterne ancora senza categoria (anche quelle trovate dalle
    // versioni precedenti dell'app, che usavano il nome del file)
    for (const entry of Object.values(manifest)) {
      if (!entry.external || entry.category || (!entry.enabled && !entry.parkedIn)) continue
      const dir = entry.files.find((f) => /_dir\.vpk$/i.test(f)) ?? entry.files[0]
      const info = dir && (await guessExternalInfo(join(entry.parkedIn ?? addons, dir)))
      if (!info) continue
      Object.assign(entry, info)
      changed = true
    }

    if (lookup) {
      const dmm = dmmIsFresh ? await readDmmManifest(addons) : new Map<string, string>()
      for (const entry of Object.values(manifest)) {
        if (!entry.external || (!entry.enabled && !entry.parkedIn)) continue
        // le mod parcheggiate hanno l'id di GameBanana nel prefisso dei file (`Local-<prefisso>`)
        const remoteId = entry.parkedIn
          ? remoteIdOfSlug(entry.id.replace(/^Local-/, ''))
          : entry.files.map((f) => dmm.get(f)).find(Boolean)
        const mod = remoteId && lookup(remoteId)
        if (mod && !manifest[mod.id] && (await this.relink(manifest, entry.id, mod))) changed = true
      }
    }

    if (changed) await writeManifest(manifest)
  }

  /**
   * Collega la mod `localId` alla mod di GameBanana `mod`: da quel momento ha il nome, l'autore e
   * l'immagine di GameBanana e il controllo degli aggiornamenti, come se fosse stata installata
   * dall'app. I file restano quelli già presenti. Vale per le mod esterne e per correggere una
   * mod collegata a quella sbagliata o non più nel catalogo.
   */
  public static linkMod(localId: string, mod: Mod): Promise<InstalledMod> {
    return this.exclusive(async () => {
      const manifest = await readManifest()
      if (!manifest[localId]) throw new AppError('error.notInstalled')
      if (localId === mod.id) return manifest[localId]
      if (manifest[mod.id]) throw new AppError('error.alreadyInstalled')
      if (!(await this.relink(manifest, localId, mod))) throw new AppError('error.linkFailed')
      await writeManifest(manifest)
      return manifest[mod.id]
    })
  }

  /**
   * Sposta nel manifest (senza salvarlo) la voce `oldId` sotto l'id di `mod`, con i suoi dati.
   * Per una mod disattivata sposta anche la cartella dei suoi file.
   * @returns `false` se la cartella non si è potuta spostare (il manifest resta com'era)
   */
  private static async relink(
    manifest: Record<string, InstalledMod>,
    oldId: string,
    mod: Mod
  ): Promise<boolean> {
    const entry = manifest[oldId]
    // i file di una mod disattivata da un altro manager restano dove sono
    if (!entry.enabled && !entry.parkedIn) {
      try {
        await mkdir(dirname(disabledDir(mod.id)), { recursive: true })
        await rename(disabledDir(oldId), disabledDir(mod.id))
      } catch {
        return false
      }
    }
    delete manifest[oldId]
    manifest[mod.id] = {
      ...entry,
      id: mod.id,
      name: mod.name,
      author: mod.author,
      category: mod.category,
      hero: mod.hero,
      image: mod.thumbnailUrl ?? mod.images[0] ?? null,
      external: false
    }
    return true
  }

  /**
   * Fa caricare a Deadlock le mod di `addons` modificando `gameinfo.gi` (vedi `./gameinfo`).
   * Prima di scrivere salva nel backup `.bak` la versione originale, senza le righe dell'app:
   * così dopo un aggiornamento del gioco il backup è sempre quello della versione corrente.
   */
  private static async ensureAddonsSearchPath(citadel: string): Promise<void> {
    const path = join(citadel, 'gameinfo.gi')
    const text = await readFile(path, 'utf8')
    if (isPatched(text)) return
    const { patched, original } = patch(text)
    await writeFile(`${path}.bak`, original)
    await writeFile(path, patched)
  }

  /**
   * Controlla che `gameinfo.gi` carichi le mod: gli aggiornamenti di Deadlock e la verifica dei
   * file di Steam lo riportano all'originale, togliendo le righe dell'app. Ripara anche i file
   * modificati dalle versioni precedenti dell'app, che rendevano `addons` la cartella principale
   * del gioco. Legge il file una volta sola; con `repair` lo sistema se serve.
   */
  public static checkGameinfo(
    gamePath: string,
    repair: boolean,
    lookup?: ExternalLookup
  ): Promise<GameinfoStatus> {
    return this.exclusive(async () => {
      await this.doSyncExternal(gamePath, lookup)
      const enabled = Object.values(await readManifest()).some((e) => e.enabled)
      if (!enabled && !(await readColorsState()).file) return 'notNeeded'
      const citadel = join(gamePath, 'game', 'citadel')
      const text = await readFile(join(citadel, 'gameinfo.gi'), 'utf8')
      if (isPatched(text)) return 'ok'
      if (!repair) return 'needsRepair'
      await this.ensureAddonsSearchPath(citadel)
      return 'repaired'
    })
  }

  /**
   * Genera in `addons` il VPK con gli stili Panorama ricolorati secondo `colors` (vedi
   * `./interfaceColors`), partendo dai file attuali del gioco e delle mod: va rifatto dopo ogni
   * aggiornamento di Deadlock. Il VPK tiene lo stesso `pakNN` finché esiste; senza colori
   * cambiati viene tolto.
   */
  public static applyInterfaceColors(
    gamePath: string,
    colors: InterfaceColors
  ): Promise<InterfaceColorsResult> {
    return this.exclusive(async () => {
      const citadel = join(gamePath, 'game', 'citadel')
      const addons = join(citadel, 'addons')
      const state = await readColorsState()
      const manifest = await readManifest()
      const remove = async (): Promise<void> => {
        if (state.file) await rm(join(addons, state.file), { force: true })
        await writeColorsState({ file: null })
      }

      if (!hasCustomColors(colors)) {
        await remove()
        return { file: null, styles: 0, conflicts: [] }
      }

      await mkdir(addons, { recursive: true })
      const present = await readdir(addons)
      // il nome salvato si riusa solo se il file c'è ancora e non è stato preso da una mod
      const reusable =
        state.file &&
        present.includes(state.file) &&
        !Object.values(manifest).some((e) => e.files.includes(state.file!))
      const file = reusable ? state.file! : `pak${await this.nextFreeIndex(addons)}_dir.vpk`

      const { styles, conflicts } = await buildColorStyles(citadel, colors, file)
      const conflictNames = conflicts.map(
        (f) => Object.values(manifest).find((e) => e.enabled && e.files.includes(f))?.name ?? f
      )
      if (styles.size === 0) {
        await remove()
        return { file: null, styles: 0, conflicts: conflictNames }
      }

      await writeFile(join(addons, file), buildVpk(styles))
      await writeColorsState({ file })
      await this.ensureAddonsSearchPath(citadel)
      return { file, styles: styles.size, conflicts: conflictNames }
    })
  }

  public static uninstallMod(modId: string, gamePath: string): Promise<void> {
    return this.exclusive(async () => {
      const manifest = await readManifest()
      const entry = manifest[modId]
      if (!entry) throw new AppError('error.notInstalled')

      if (entry.enabled) {
        const addons = join(gamePath, 'game', 'citadel', 'addons')
        await Promise.all(entry.files.map((f) => rm(join(addons, f), { force: true })))
      } else if (entry.parkedIn) {
        await Promise.all(entry.files.map((f) => rm(join(entry.parkedIn!, f), { force: true })))
      } else {
        await rm(disabledDir(modId), { recursive: true, force: true })
      }

      delete manifest[modId]
      await writeManifest(manifest)
    })
  }

  /**
   * Attiva o disattiva una mod. Disattivandola i file vengono spostati fuori da `addons`;
   * riattivandola tornano in `addons` con nuovi indici `pakNN` liberi.
   */
  public static setEnabled(
    modId: string,
    enabled: boolean,
    gamePath: string
  ): Promise<InstalledMod> {
    return this.exclusive(async () => {
      const manifest = await readManifest()
      const entry = manifest[modId]
      if (!entry) throw new AppError('error.notInstalled')
      if (entry.enabled === enabled) return entry

      const citadel = join(gamePath, 'game', 'citadel')
      const addons = join(citadel, 'addons')
      const disabled = disabledDir(modId)

      if (enabled) {
        await mkdir(addons, { recursive: true })
        const source = entry.parkedIn ?? disabled
        const placed: string[] = []
        try {
          await this.placeVpkFiles(source, entry.files, addons, placed)
        } catch (e) {
          await Promise.all(placed.map((f) => rm(join(addons, f), { force: true })))
          throw e
        }
        await this.ensureAddonsSearchPath(citadel)
        // della cartella di un altro manager si tolgono solo i file di questa mod
        if (entry.parkedIn)
          await Promise.all(entry.files.map((f) => rm(join(source, f), { force: true })))
        else await rm(disabled, { recursive: true, force: true })
        delete entry.parkedIn
        entry.files = placed
      } else {
        await mkdir(disabled, { recursive: true })
        for (const f of entry.files) await copyFile(join(addons, f), join(disabled, f))
        await Promise.all(entry.files.map((f) => rm(join(addons, f), { force: true })))
      }

      entry.enabled = enabled
      await writeManifest(manifest)
      return entry
    })
  }

  /**
   * Esporta tutte le mod installate in un pacchetto "Deadlock Mod Interchange" (vedi
   * `./interchange`) dentro `destination`: la cartella `deadlock-mods-export-<data>` con
   * `mod-interchange.json` e una copia dei VPK in `files/`. Le mod attive vengono prima, nel loro
   * ordine di caricamento, poi quelle disattivate. Il pacchetto si importa nel Deadlock Mod
   * Manager ufficiale o in un'altra copia di questa app.
   */
  public static exportMods(
    gamePath: string,
    destination: string,
    managerVersion: string
  ): Promise<InterchangeExportResult> {
    return this.exclusive(async () => {
      const addons = join(gamePath, 'game', 'citadel', 'addons')
      const manifest = await readManifest()
      const ordered = [
        ...Object.values(manifest)
          .filter((e) => e.enabled)
          .sort((a, b) => lowestPakIndex(a.files) - lowestPakIndex(b.files)),
        ...Object.values(manifest).filter((e) => !e.enabled)
      ]

      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
      let folder = join(destination, `deadlock-mods-export-${stamp}`)
      for (let n = 2; await stat(folder).catch(() => null); n++)
        folder = join(destination, `deadlock-mods-export-${stamp}-${n}`)
      await mkdir(join(folder, 'files'), { recursive: true })

      const document: InterchangeDocument = {
        format: FORMAT_ID,
        version: FORMAT_VERSION,
        createdAt: new Date().toISOString(),
        source: { manager: MANAGER_ID, managerVersion },
        contents: ['mods'],
        mods: []
      }
      const skipped: string[] = []
      try {
        for (const entry of ordered) {
          const source = entry.enabled ? addons : (entry.parkedIn ?? disabledDir(entry.id))
          const present = await readdir(source).catch((): string[] => [])
          const files = entry.files.filter((f) => present.includes(f))
          if (files.length === 0) {
            skipped.push(entry.name)
            continue
          }

          const slug = slugify(entry.name, 40)
          const dir = `${String(document.mods.length).padStart(4, '0')}-${slug}`
          await mkdir(join(folder, 'files', dir))
          const exported: InterchangeFile[] = []
          for (const f of files) {
            const name = unparkedName(f)
            const path = `files/${dir}/${name}`
            await copyFile(join(source, f), join(folder, path))
            exported.push({
              name,
              path,
              sha256: await sha256File(join(folder, path)),
              size: (await stat(join(folder, path))).size,
              selected: true
            })
          }

          const { key, origin } = originOf(entry.id, entry.fileName)
          const remote = /^(Mod|Sound)-(\d+)$/.exec(entry.id)
          document.mods.push({
            key,
            name: entry.name,
            enabled: entry.enabled,
            order: document.mods.length,
            origin,
            author: entry.author || null,
            category: entry.category || null,
            hero: entry.hero,
            thumbnailUrl: entry.image?.startsWith('http') ? entry.image : null,
            link: remote
              ? `https://gamebanana.com/${remote[1] === 'Sound' ? 'sounds' : 'mods'}/${remote[2]}`
              : null,
            files: exported,
            extensions: { [MANAGER_ID]: { modId: entry.id } }
          })
        }
        await writeFile(join(folder, MANIFEST_FILENAME), JSON.stringify(document, null, 2))
      } catch (e) {
        // non lascia un pacchetto a metà
        await rm(folder, { recursive: true, force: true })
        throw e
      }
      return { folder, exported: document.mods.length, skipped }
    })
  }

  /**
   * Importa le mod di un pacchetto "Deadlock Mod Interchange" (la cartella o il suo
   * `mod-interchange.json`), per esempio esportato dal Deadlock Mod Manager ufficiale. Le mod
   * attive vanno in `addons` in fondo all'ordine di caricamento, nell'ordine del pacchetto; quelle
   * disattivate nella cartella delle mod disattivate dell'app. Le mod di GameBanana prendono i
   * dati del catalogo, se `lookup` le trova; le altre diventano mod esterne. Le mod già
   * installate vengono saltate, come quelle con file mancanti o diversi dallo SHA-256 dichiarato.
   * @param lookup Mod del catalogo con quell'id dell'app (es. `Mod-123`), se c'è
   */
  public static importMods(
    gamePath: string,
    path: string,
    lookup: (modId: string) => Mod | undefined
  ): Promise<InterchangeImportResult> {
    return this.exclusive(async () => {
      const { document, base } = await readBundle(path)
      const citadel = join(gamePath, 'game', 'citadel')
      const addons = join(citadel, 'addons')
      const manifest = await readManifest()
      const result: InterchangeImportResult = {
        source: document.source.manager,
        imported: 0,
        skipped: []
      }

      for (const item of [...document.mods].sort((a, b) => a.order - b.order)) {
        const remoteId = appIdOf(item.origin)
        const own = item.extensions?.[MANAGER_ID] as { modId?: unknown } | undefined
        const ownId = typeof own?.modId === 'string' ? own.modId : null
        if ((remoteId && manifest[remoteId]) || (!remoteId && ownId && manifest[ownId])) {
          result.skipped.push({ name: item.name, reason: 'alreadyInstalled' })
          continue
        }

        // file scelti, dentro il pacchetto e presenti; senza nessuno scelto vale il primo
        let chosen = item.files.filter((f) => f.selected !== false)
        if (chosen.length === 0) chosen = item.files.slice(0, 1)
        const files: { source: string; name: string; sha256?: string }[] = []
        for (const f of chosen) {
          const source = resolveBundlePath(base, f.path)
          if (!source || !(await stat(source).catch(() => null))?.isFile()) continue
          const name = isPlainVpkName(f.name) ? f.name : basename(source)
          if (name.toLowerCase().endsWith('.vpk')) files.push({ source, name, sha256: f.sha256 })
        }
        if (files.length === 0) {
          result.skipped.push({ name: item.name, reason: 'missingFiles' })
          continue
        }
        let intact = true
        for (const f of files)
          if (f.sha256 && (await sha256File(f.source)) !== f.sha256.toLowerCase()) intact = false
        if (!intact) {
          result.skipped.push({ name: item.name, reason: 'checksum' })
          continue
        }

        let id = remoteId ?? ownId ?? `Local-${slugify(item.name, 40)}`
        for (let n = 2; manifest[id]; n++)
          id = `${remoteId ?? `Local-${slugify(item.name, 40)}`}-${n}`

        // i file vanno in una cartella temporanea con i loro nomi, da cui si copiano come
        // farebbe una mod disattivata riattivata
        const placed: string[] = []
        const disabled = disabledDir(id)
        try {
          await mkdir(disabled, { recursive: true })
          for (const f of files) await copyFile(f.source, join(disabled, f.name))
          const names = files.map((f) => f.name)
          if (item.enabled) {
            await mkdir(addons, { recursive: true })
            await this.placeVpkFiles(disabled, names, addons, placed)
            await rm(disabled, { recursive: true, force: true })
          }
          const mod = remoteId ? lookup(remoteId) : undefined
          manifest[id] = {
            id,
            files: item.enabled ? placed : names,
            enabled: item.enabled,
            installedAt: new Date().toISOString(),
            fileName:
              item.origin.provider === 'gamebanana' ? (item.origin.fileName ?? names[0]) : names[0],
            name: mod?.name ?? item.name,
            author: mod?.author ?? item.author ?? '',
            category: mod?.category ?? item.category ?? '',
            hero: mod?.hero ?? item.hero ?? null,
            image: mod?.thumbnailUrl ?? mod?.images[0] ?? item.thumbnailUrl ?? null,
            ...(remoteId ? {} : { external: true })
          }
          result.imported++
        } catch {
          await Promise.all(placed.map((f) => rm(join(addons, f), { force: true })))
          await rm(disabled, { recursive: true, force: true })
          result.skipped.push({ name: item.name, reason: 'failed' })
        }
      }

      await writeManifest(manifest)
      if (Object.values(manifest).some((e) => e.enabled)) await this.ensureAddonsSearchPath(citadel)
      return result
    })
  }

  /**
   * Coppie di mod attive che contengono gli stessi file. Le mod si leggono nell'ordine di
   * caricamento: il primo file con un certo percorso è quello che il gioco usa, quindi a vincere è
   * sempre la mod con l'indice `pakNN` più basso. Con tre mod sullo stesso file, le due perdenti
   * vengono confrontate solo con quella che vince. I VPK illeggibili vengono saltati, e anche i
   * file alla radice del VPK (`readme.txt` e simili): il gioco carica le risorse solo dalle
   * cartelle, quindi lì non c'è niente che una mod possa sostituire.
   * @param accepted Coppie che l'utente ha già accettato, segnate con `accepted: true`
   */
  public static async getConflicts(
    gamePath: string,
    accepted: readonly AcceptedConflict[] = []
  ): Promise<ModConflict[]> {
    const acceptedKeys = new Set(accepted.map((a) => `${a.winner}\n${a.loser}`))
    const addons = join(gamePath, 'game', 'citadel', 'addons')
    const owners = new Map<string, string>()
    const pairs = new Map<string, ModConflict>()
    for (const entry of await this.getLoadOrder()) {
      const paths = new Set<string>()
      for (const f of entry.files.filter((f) => /_dir\.vpk$/i.test(f))) {
        const vpk = await VpkReader.open(join(addons, f)).catch(() => null)
        vpk?.paths().forEach((p) => paths.add(p))
      }
      for (const path of paths) {
        if (!path.includes('/')) continue
        const winner = owners.get(path)
        if (!winner) {
          owners.set(path, entry.id)
          continue
        }
        if (winner === entry.id) continue
        const key = `${winner}\n${entry.id}`
        const pair = pairs.get(key) ?? {
          winner,
          loser: entry.id,
          files: 0,
          sample: [],
          accepted: acceptedKeys.has(key)
        }
        pair.files++
        if (pair.sample.length < 5) pair.sample.push(path)
        pairs.set(key, pair)
      }
    }
    return [...pairs.values()]
  }

  /**
   * Mod attive nell'ordine di caricamento: prima quella con l'indice `pakNN` più basso, che ha
   * la priorità quando due mod contengono gli stessi file.
   */
  public static async getLoadOrder(): Promise<InstalledMod[]> {
    const manifest = await readManifest()
    return Object.values(manifest)
      .filter((e) => e.enabled)
      .sort((a, b) => lowestPakIndex(a.files) - lowestPakIndex(b.files))
  }

  /**
   * Riassegna gli indici `pakNN` delle mod attive nell'ordine di `modIds` (la prima riceve
   * l'indice libero più basso). Gli indici occupati da file non installati dall'app restano
   * intatti. Le rinomine avvengono in due passaggi, tramite nomi temporanei, così due mod non
   * si scontrano mai sullo stesso nome; se una rinomina fallisce, quelle già fatte vengono
   * annullate.
   * @throws Se `modIds` non contiene esattamente le mod attive
   */
  public static setLoadOrder(modIds: string[], gamePath: string): Promise<InstalledMod[]> {
    return this.exclusive(async () => {
      const manifest = await readManifest()
      const enabled = Object.values(manifest).filter((e) => e.enabled)
      if (
        modIds.length !== enabled.length ||
        new Set(modIds).size !== modIds.length ||
        modIds.some((id) => !manifest[id]?.enabled)
      )
        throw new AppError('error.loadOrderChanged')

      const addons = join(gamePath, 'game', 'citadel', 'addons')
      const managed = new Set(enabled.flatMap((e) => e.files))
      const takenByOthers = new Set(
        (await readdir(addons).catch(() => []))
          .filter((f) => !managed.has(f))
          .map((f) => /^pak(\d{2})_/.exec(f)?.[1])
          .filter(Boolean)
      )
      const free = Array.from({ length: 99 }, (_, i) => String(i + 1).padStart(2, '0')).filter(
        (n) => !takenByOthers.has(n)
      )

      // nuovo nome di ogni file: ogni gruppo pakNN di ogni mod riceve il prossimo indice libero
      const renames: { from: string; to: string }[] = []
      const newFiles = new Map<string, string[]>()
      for (const id of modIds) {
        const files = manifest[id].files
        const prefixes = [...new Set(files.map((f) => /^(pak\d{2})_/.exec(f)?.[1]))]
          .filter((p): p is string => !!p)
          .sort()
        const renamed: string[] = []
        for (const prefix of prefixes) {
          const index = free.shift()
          if (!index) throw new AppError('error.noFreeIndex')
          for (const f of files.filter((f) => f.startsWith(`${prefix}_`))) {
            const to = `pak${index}${f.slice(prefix.length)}`
            renamed.push(to)
            if (to !== f) renames.push({ from: f, to })
          }
        }
        newFiles.set(id, renamed)
      }

      const tmp = (f: string): string => `__dmm_reorder_${f}`
      const done: { from: string; to: string }[] = []
      try {
        for (const r of renames) {
          await rename(join(addons, r.from), join(addons, tmp(r.from)))
          done.push({ from: r.from, to: tmp(r.from) })
        }
        for (const r of renames) {
          await rename(join(addons, tmp(r.from)), join(addons, r.to))
          done.push({ from: tmp(r.from), to: r.to })
        }
      } catch (e) {
        for (const r of done.reverse())
          await rename(join(addons, r.to), join(addons, r.from)).catch(() => {})
        throw e
      }

      for (const [id, files] of newFiles) manifest[id].files = files
      await writeManifest(manifest)
      return modIds.map((id) => manifest[id])
    })
  }
}

/** Indice `pakNN` più basso tra i file di una mod; `100` se nessun file ha quel formato. */
function lowestPakIndex(files: string[]): number {
  return Math.min(100, ...files.map((f) => Number(/^pak(\d{2})_/.exec(f)?.[1] ?? 100)))
}
