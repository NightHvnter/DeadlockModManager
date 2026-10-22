import { createHash } from 'node:crypto'
import { open } from 'node:fs/promises'
import { basename, dirname, join, posix } from 'node:path'
import { crc32 } from 'node:zlib'

/** Firma dei file VPK di Valve. */
const VPK_SIGNATURE = 0x55aa1234
/** Lunghezza dell'intestazione della versione 2, l'unica usata da Deadlock. */
const HEADER_SIZE = 28
/** Indice d'archivio dei file salvati dentro lo stesso `_dir.vpk`, dopo l'albero. */
const EMBEDDED = 0x7fff

interface VpkEntry {
  archive: number
  offset: number
  length: number
  preload: Buffer
}

/**
 * Indice di un VPK (formato 2): legge solo l'intestazione e l'albero dei file del `_dir.vpk`, i
 * contenuti vengono letti su richiesta (dal `_dir.vpk` stesso o dalle parti `_000.vpk`, ...).
 */
export class VpkReader {
  private constructor(
    private readonly dirPath: string,
    private readonly dataStart: number,
    private readonly entries: Map<string, VpkEntry>
  ) {}

  /** @throws Se `dirPath` non è un VPK della versione 2 */
  static async open(dirPath: string): Promise<VpkReader> {
    const fd = await open(dirPath, 'r')
    try {
      const header = Buffer.alloc(HEADER_SIZE)
      await fd.read(header, 0, HEADER_SIZE, 0)
      if (header.readUInt32LE(0) !== VPK_SIGNATURE || header.readUInt32LE(4) !== 2)
        throw new Error(`VPK non supportato: ${dirPath}`)
      const tree = Buffer.alloc(header.readUInt32LE(8))
      await fd.read(tree, 0, tree.length, HEADER_SIZE)
      return new VpkReader(dirPath, HEADER_SIZE + tree.length, parseTree(tree))
    } finally {
      await fd.close()
    }
  }

  /** Percorsi dei file contenuti, come `panorama/styles/base.vcss_c`. */
  paths(): string[] {
    return [...this.entries.keys()]
  }

  has(path: string): boolean {
    return this.entries.has(path)
  }

  async read(path: string): Promise<Buffer> {
    const entry = this.entries.get(path)
    if (!entry) throw new Error(`${path} non è in ${this.dirPath}`)
    if (entry.length === 0) return entry.preload
    const archivePath =
      entry.archive === EMBEDDED
        ? this.dirPath
        : join(
            dirname(this.dirPath),
            `${basename(this.dirPath).replace(/_dir\.vpk$/i, '')}_${String(entry.archive).padStart(3, '0')}.vpk`
          )
    const fd = await open(archivePath, 'r')
    try {
      const data = Buffer.alloc(entry.length)
      const offset = entry.archive === EMBEDDED ? this.dataStart + entry.offset : entry.offset
      await fd.read(data, 0, entry.length, offset)
      return Buffer.concat([entry.preload, data])
    } finally {
      await fd.close()
    }
  }
}

/** Albero dei file: estensione → cartella → nome, ognuno chiuso da una stringa vuota. */
function parseTree(tree: Buffer): Map<string, VpkEntry> {
  const entries = new Map<string, VpkEntry>()
  let p = 0
  const str = (): string => {
    const end = tree.indexOf(0, p)
    const s = tree.toString('utf8', p, end)
    p = end + 1
    return s
  }
  for (let ext = str(); ext; ext = str()) {
    for (let dir = str(); dir; dir = str()) {
      for (let name = str(); name; name = str()) {
        const preloadSize = tree.readUInt16LE(p + 4)
        const entry: VpkEntry = {
          archive: tree.readUInt16LE(p + 6),
          offset: tree.readUInt32LE(p + 8),
          length: tree.readUInt32LE(p + 12),
          preload: tree.subarray(p + 18, p + 18 + preloadSize)
        }
        p += 18 + preloadSize
        // la cartella radice è salvata come " "
        const folder = dir.trim() ? `${dir}/` : ''
        entries.set(`${folder}${name}${ext.trim() ? `.${ext}` : ''}`.toLowerCase(), entry)
      }
    }
  }
  return entries
}

/**
 * VPK (formato 2) a file unico con i `files` dati (percorso → contenuto), tutti salvati dentro
 * il `_dir.vpk`: è il formato che il gioco carica da `addons` come `pakNN_dir.vpk`.
 */
export function buildVpk(files: Map<string, Buffer>): Buffer {
  const groups = new Map<string, Map<string, { name: string; data: Buffer }[]>>()
  for (const [path, data] of files) {
    const ext = posix.extname(path).slice(1)
    const dir = posix.dirname(path)
    const name = posix.basename(path, `.${ext}`)
    if (!groups.has(ext)) groups.set(ext, new Map())
    const dirs = groups.get(ext)!
    if (!dirs.has(dir)) dirs.set(dir, [])
    dirs.get(dir)!.push({ name, data })
  }

  const cstr = (s: string): Buffer => Buffer.from(`${s}\0`, 'utf8')
  const tree: Buffer[] = []
  const data: Buffer[] = []
  let offset = 0
  for (const [ext, dirs] of groups) {
    tree.push(cstr(ext))
    for (const [dir, list] of dirs) {
      tree.push(cstr(dir === '.' ? ' ' : dir))
      for (const file of list) {
        const entry = Buffer.alloc(18)
        entry.writeUInt32LE(crc32(file.data), 0)
        entry.writeUInt16LE(0, 4)
        entry.writeUInt16LE(EMBEDDED, 6)
        entry.writeUInt32LE(offset, 8)
        entry.writeUInt32LE(file.data.length, 12)
        entry.writeUInt16LE(0xffff, 16)
        tree.push(cstr(file.name), entry)
        data.push(file.data)
        offset += file.data.length
      }
      tree.push(cstr(''))
    }
    tree.push(cstr(''))
  }
  tree.push(cstr(''))

  const treeBuf = Buffer.concat(tree)
  const dataBuf = Buffer.concat(data)
  const header = Buffer.alloc(HEADER_SIZE)
  header.writeUInt32LE(VPK_SIGNATURE, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(treeBuf.length, 8)
  header.writeUInt32LE(dataBuf.length, 12)
  header.writeUInt32LE(0, 16) // nessuna parte esterna: sezione degli MD5 degli archivi vuota
  header.writeUInt32LE(48, 20) // MD5 dell'albero, della sezione archivi e del file intero
  header.writeUInt32LE(0, 24) // nessuna firma
  const md5 = (b: Buffer): Buffer => createHash('md5').update(b).digest()
  const checksums = Buffer.concat([md5(treeBuf), md5(Buffer.alloc(0))])
  const whole = md5(Buffer.concat([header, treeBuf, dataBuf, checksums]))
  return Buffer.concat([header, treeBuf, dataBuf, checksums, whole])
}
