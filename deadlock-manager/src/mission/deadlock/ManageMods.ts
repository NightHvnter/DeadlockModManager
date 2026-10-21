import { Mod, ModDownload } from "../types"

import { createHash } from 'node:crypto'
import { constants, createReadStream, createWriteStream } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebStream } from 'node:stream/web'
import { readManifest, writeManifest } from "./manifest"
import { extractZip as extract} from "../func/extractZip"

const API = 'https://api.deadlockmods.app/api/v2'
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export class ManageMods {
  public static async installMod(
    mod: Mod,
    gamePath: string,
    download?: ModDownload,
  ): Promise<string[]> {
    if ((await readManifest())[mod.id]) throw new Error('Mod già installata')

    const citadel = join(gamePath, 'game', 'citadel')
    const addons = join(citadel, 'addons')
    const tmp = await mkdtemp(join(tmpdir(), 'deadlock-mod-'))

    try {
      const file = download ?? (await this.getDownloads(mod.id))[0]
      if (!file) throw new Error('Nessun file scaricabile per questa mod')

      // 1. Download e verifica
      const archive = join(tmp, basename(file.name))
      await this.downloadFile(file.url, archive)
      if (file.md5Checksum && (await this.md5(archive)) !== file.md5Checksum.toLowerCase()) {
        throw new Error('Checksum MD5 non valido: file corrotto')
      }

      // 2. Estrazione
      const extracted = join(tmp, 'extracted')
      await mkdir(extracted)
      const ext = extname(file.name).toLowerCase()
      if (ext === '.zip') await extract(archive, extracted)
      else if (ext === '.vpk') await copyFile(archive, join(extracted, basename(archive)))
      else throw new Error(`Formato non supportato: ${ext}`)

      // 3. Copia dei VPK in addons con il prefisso pakNN
      const vpks = (await readdir(extracted, { recursive: true }))
        .filter((f) => f.toLowerCase().endsWith('_dir.vpk'))
      if (vpks.length === 0) throw new Error('Nessun file _dir.vpk trovato nella mod')

      await mkdir(addons, { recursive: true })
      const installed: string[] = []
      for (const rel of vpks) {
        const prefix = `pak${await this.nextFreeIndex(addons)}`
        const dir = join(extracted, dirname(rel))
        const base = basename(rel).slice(0, -'_dir.vpk'.length)
        // il _dir.vpk e le eventuali parti numerate (base_000.vpk, ...)
        const parts = (await readdir(dir)).filter(
          (f) => f === `${base}_dir.vpk` || new RegExp(`^${escapeRegExp(base)}_\\d{3}\\.vpk$`).test(f),
        )
        for (const part of parts) {
          const target = `${prefix}${part.slice(base.length)}`
          await copyFile(join(dir, part), join(addons, target))
          installed.push(target)
        }
      }

      // 4. Abilita la cartella addons nel gioco
      await this.ensureAddonsSearchPath(citadel)

      const manifest = await readManifest()
      manifest[mod.id] = installed
      await writeManifest(manifest)

      return installed
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  }

  private static async getDownloads(modId: string): Promise<ModDownload[]> {
    const res = await fetch(`${API}/mods/${modId}/downloads`)
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return (await res.json()).downloads
  }

  private static async downloadFile(url: string, dest: string) {
    const res = await fetch(url)
    if (!res.ok || !res.body) throw new Error(`Download fallito: ${res.status}`)
    await pipeline(Readable.fromWeb(res.body as WebStream), createWriteStream(dest))
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
    throw new Error('Nessun indice pakNN libero')
  }

  /** Aggiunge `Game citadel/addons` a `gameinfo.gi` (con backup `.bak`) se manca. */
  private static async ensureAddonsSearchPath(citadel: string) {
    const path = join(citadel, 'gameinfo.gi')
    const text = await readFile(path, 'utf8')
    if (/^\s*Game\s+citadel\/addons\s*$/m.test(text)) return

    const re = /(SearchPaths\s*\{\r?\n)/
    if (!re.test(text)) throw new Error('SearchPaths non trovato in gameinfo.gi')
    await copyFile(path, `${path}.bak`, constants.COPYFILE_EXCL).catch(() => {})
    await writeFile(path, text.replace(re, (m) => `${m}\t\t\tGame\t\t\t\tcitadel/addons\n`))
  }

  public static async uninstallMod(modId: string, gamePath: string): Promise<void> {
    const manifest = await readManifest()
    const files = manifest[modId]
    if (!files) throw new Error('Mod non installata')

    const addons = join(gamePath, 'game', 'citadel', 'addons')
    await Promise.all(files.map((f) => rm(join(addons, f), { force: true })))

    delete manifest[modId]
    await writeManifest(manifest)
  }
}