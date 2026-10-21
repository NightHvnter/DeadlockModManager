import { InstalledMod, Mod, ModDownload } from "../types"
import { AppError } from "../i18n"

import { createHash } from 'node:crypto'
import { constants, createReadStream, createWriteStream } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebStream } from 'node:stream/web'
import { disabledDir, readManifest, writeManifest } from "./manifest"
import { extractZip as extract} from "../func/extractZip"
import { extractRar } from "../func/extractRar"
import { gameBanana, parseModId } from "../gamebanana"
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Chiamata con i byte ricevuti e quelli totali (`0` se sconosciuti) durante il download. */
export type ProgressCallback = (received: number, total: number) => void

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
    onProgress?: ProgressCallback,
  ): Promise<string[]> {
    return this.exclusive(() => this.doInstall(mod, gamePath, download, onProgress))
  }

  private static async doInstall(
    mod: Mod,
    gamePath: string,
    download?: ModDownload,
    onProgress?: ProgressCallback,
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

      // 3. Copia dei VPK in addons con il prefisso pakNN
      const vpks = (await readdir(extracted, { recursive: true }))
        .filter((f) => f.toLowerCase().endsWith('_dir.vpk'))
      if (vpks.length === 0) throw new AppError('error.noVpk')

      await mkdir(addons, { recursive: true })
      for (const rel of vpks) {
        const dir = join(extracted, dirname(rel))
        const base = basename(rel).slice(0, -'_dir.vpk'.length)
        await this.placeVpkGroup(dir, base, addons, installed)
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
        image: mod.thumbnailUrl ?? mod.images[0] ?? null,
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
   * con il primo prefisso `pakNN` libero, aggiungendo i nomi copiati a `placed`.
   */
  private static async placeVpkGroup(
    dir: string,
    base: string,
    addons: string,
    placed: string[],
  ): Promise<void> {
    const prefix = `pak${await this.nextFreeIndex(addons)}`
    const parts = (await readdir(dir)).filter(
      (f) => f === `${base}_dir.vpk` || new RegExp(`^${escapeRegExp(base)}_\\d{3}\\.vpk$`).test(f),
    )
    for (const part of parts) {
      const target = `${prefix}${part.slice(base.length)}`
      await copyFile(join(dir, part), join(addons, target))
      placed.push(target)
    }
  }

  /**
   * File scaricabili di una mod, letti dalla sua pagina su GameBanana (dal più recente),
   * esclusi quelli archiviati dall'autore.
   */
  public static async getDownloads(modId: string): Promise<ModDownload[]> {
    const ref = parseModId(modId)
    if (!ref) throw new AppError('error.modNotFound')
    const profile = await gameBanana.profile(ref.type, ref.id)
    return (profile._aFiles ?? [])
      .filter((f) => !f._bIsArchived)
      .sort((a, b) => b._tsDateAdded - a._tsDateAdded)
      .map((f) => ({
        url: f._sDownloadUrl,
        size: f._nFilesize,
        name: f._sFile,
        md5Checksum: f._sMd5Checksum ?? null
      }))
  }

  private static async downloadFile(
    url: string,
    dest: string,
    size: number,
    onProgress?: ProgressCallback,
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
      },
    })
    await pipeline(Readable.fromWeb(res.body as WebStream), counter, createWriteStream(dest))
    onProgress?.(received, total)
  }

  private static async md5(path: string): Promise<string> {
    const hash = createHash('md5')
    await pipeline(createReadStream(path), hash)
    return hash.digest('hex')
  }

  /** Primo indice a due cifre ("01"..."99") non ancora usato in `addons`. */
  private static async nextFreeIndex(addons: string): Promise<string> {
    const used = new Set(
      (await readdir(addons)).map((f) => /^pak(\d{2})_/.exec(f)?.[1]).filter(Boolean),
    )
    for (let i = 1; i < 100; i++) {
      const n = String(i).padStart(2, '0')
      if (!used.has(n)) return n
    }
    throw new AppError('error.noFreeIndex')
  }

  /** Aggiunge `Game citadel/addons` a `gameinfo.gi` (con backup `.bak`) se manca. */
  private static async ensureAddonsSearchPath(citadel: string): Promise<void> {
    const path = join(citadel, 'gameinfo.gi')
    const text = await readFile(path, 'utf8')
    if (/^\s*Game\s+citadel\/addons\s*$/m.test(text)) return

    const re = /(SearchPaths\s*\{\r?\n)/
    if (!re.test(text)) throw new AppError('error.searchPaths')
    await copyFile(path, `${path}.bak`, constants.COPYFILE_EXCL).catch(() => {})
    await writeFile(path, text.replace(re, (m) => `${m}\t\t\tGame\t\t\t\tcitadel/addons\n`))
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
  public static setEnabled(modId: string, enabled: boolean, gamePath: string): Promise<InstalledMod> {
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
}
