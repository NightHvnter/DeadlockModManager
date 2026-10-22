import {
  GameinfoStatus,
  InstalledMod,
  InterfaceColors,
  InterfaceColorsResult,
  Mod,
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
import { disabledDir, readManifest, writeManifest } from './manifest'
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
import { buildVpk } from './vpk'
import { guessExternalInfo, readDmmManifest } from './external'
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Chiamata con i byte ricevuti e quelli totali (`0` se sconosciuti) durante il download. */
export type ProgressCallback = (received: number, total: number) => void

/** Mod del catalogo con l'id numerico di GameBanana `remoteId` (es. `"623518"`), se c'è. */
export type ExternalLookup = (remoteId: string) => Mod | undefined

export class ManageMods {
  /** Coda delle operazioni: due installazioni insieme potrebbero scegliere lo stesso `pakNN`. */
  private static queue: Promise<unknown> = Promise.resolve()

  /** Esegue `fn` dopo che le operazioni precedenti sono terminate. */
  private static exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn)
    this.queue = run.catch(() => {})
    return run
  }

  public static installMod(
    mod: Mod,
    gamePath: string,
    download?: ModDownload,
    onProgress?: ProgressCallback
  ): Promise<string[]> {
    return this.exclusive(() => this.doInstall(mod, gamePath, download, onProgress))
  }

  private static async doInstall(
    mod: Mod,
    gamePath: string,
    download?: ModDownload,
    onProgress?: ProgressCallback
  ): Promise<string[]> {
    if ((await readManifest())[mod.id]) throw new AppError('error.alreadyInstalled')

    const citadel = join(gamePath, 'game', 'citadel')
    const addons = join(citadel, 'addons')
    const tmp = await mkdtemp(join(tmpdir(), 'deadlock-mod-'))
    const installed: string[] = []

    try {
      const file = download ?? (await this.getDownloads(mod.id))[0]
      if (!file) throw new AppError('error.noDownloads')

      // 1. Download e verifica
      const archive = join(tmp, basename(file.name))
      await this.downloadFile(file.url, archive, file.size, onProgress)
      if (file.md5Checksum && (await this.md5(archive)) !== file.md5Checksum.toLowerCase()) {
        throw new AppError('error.checksum')
      }

      // 2. Estrazione
      const extracted = join(tmp, 'extracted')
      await mkdir(extracted)
      const ext = extname(file.name).toLowerCase()
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

      const manifest = await readManifest()
      manifest[mod.id] = {
        id: mod.id,
        files: installed,
        enabled: true,
        installedAt: new Date().toISOString(),
        fileName: file.name,
        name: mod.name,
        author: mod.author,
        category: mod.category,
        hero: mod.hero,
        image: mod.thumbnailUrl ?? mod.images[0] ?? null
      }
      await writeManifest(manifest)

      return installed
    } catch (e) {
      // non lascia in addons i file di un'installazione a metà
      await Promise.all(installed.map((f) => rm(join(addons, f), { force: true })))
      throw e
    } finally {
      await rm(tmp, { recursive: true, force: true })
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

  private static async downloadFile(
    url: string,
    dest: string,
    size: number,
    onProgress?: ProgressCallback
  ): Promise<void> {
    const res = await fetch(url)
    if (!res.ok || !res.body) throw new AppError('error.downloadFailed', { status: res.status })
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
   * trova nel catalogo, la mod esterna viene collegata a quella (vedi `linkMod`). Toglie le mod
   * esterne attive i cui file non ci sono più. Il VPK dei colori e le parti numerate senza
   * `_dir.vpk` vengono ignorati.
   * @param lookup Mod del catalogo con quell'id numerico di GameBanana, se c'è
   */
  public static syncExternal(gamePath: string, lookup: ExternalLookup): Promise<void> {
    return this.exclusive(() => this.doSyncExternal(gamePath, lookup))
  }

  private static async doSyncExternal(gamePath: string, lookup?: ExternalLookup): Promise<void> {
    const addons = join(gamePath, 'game', 'citadel', 'addons')
    const present = await readdir(addons).catch((): string[] => [])
    const manifest = await readManifest()
    const colorsFile = (await readColorsState()).file
    let changed = false

    for (const [id, entry] of Object.entries(manifest)) {
      if (entry.external && entry.enabled && !entry.files.some((f) => present.includes(f))) {
        delete manifest[id]
        changed = true
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

    // nome dal contenuto per le mod esterne ancora senza categoria (anche quelle trovate dalle
    // versioni precedenti dell'app, che usavano il nome del file)
    for (const entry of Object.values(manifest)) {
      if (!entry.external || !entry.enabled || entry.category) continue
      const dir = entry.files.find((f) => f.endsWith('_dir.vpk'))
      const info = dir && (await guessExternalInfo(join(addons, dir)))
      if (!info) continue
      Object.assign(entry, info)
      changed = true
    }

    if (lookup) {
      const dmm = await readDmmManifest(addons)
      for (const entry of Object.values(manifest)) {
        if (!entry.external || !entry.enabled) continue
        const remoteId = entry.files.map((f) => dmm.get(f)).find(Boolean)
        const mod = remoteId && lookup(remoteId)
        if (mod && !manifest[mod.id] && (await this.relink(manifest, entry.id, mod))) changed = true
      }
    }

    if (changed) await writeManifest(manifest)
  }

  /**
   * Collega la mod esterna `localId` alla mod di GameBanana `mod`: da quel momento ha il nome,
   * l'autore e l'immagine di GameBanana e il controllo degli aggiornamenti, come se fosse stata
   * installata dall'app. I file restano quelli già presenti.
   */
  public static linkMod(localId: string, mod: Mod): Promise<InstalledMod> {
    return this.exclusive(async () => {
      const manifest = await readManifest()
      if (!manifest[localId]?.external) throw new AppError('error.notInstalled')
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
    if (!entry.enabled) {
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
        // raggruppa i file per prefisso originale (pak01_dir.vpk, pak01_000.vpk, ...)
        const bases = entry.files
          .filter((f) => f.endsWith('_dir.vpk'))
          .map((f) => f.slice(0, -'_dir.vpk'.length))
        const placed: string[] = []
        try {
          for (const base of bases) {
            await this.placeVpkGroup(disabled, base, addons, placed)
          }
        } catch (e) {
          await Promise.all(placed.map((f) => rm(join(addons, f), { force: true })))
          throw e
        }
        await this.ensureAddonsSearchPath(citadel)
        await rm(disabled, { recursive: true, force: true })
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
