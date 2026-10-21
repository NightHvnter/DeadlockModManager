import yauzl from 'yauzl'
import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { AppError } from '../i18n'

/**
 * Estrae uno zip in `destDir`, rifiutando percorsi fuori dalla cartella e ignorando i symlink.
 * @throws Se lo zip è corrotto o contiene percorsi non validi.
 */
export function extractZip(zipPath: string, destDir: string): Promise<void> {
  const root = resolve(destDir) + sep
  return new Promise((done, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err)
      zip.on('error', reject)
      zip.on('end', () => done())
      zip.on('entry', async (entry) => {
        try {
          const target = resolve(destDir, entry.fileName)
          if (!target.startsWith(root)) throw new AppError('error.invalidPath', { path: entry.fileName })
          const isSymlink = ((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000
          if (entry.fileName.endsWith('/')) {
            await mkdir(target, { recursive: true })
          } else if (!isSymlink) {
            await mkdir(dirname(target), { recursive: true })
            const stream = await new Promise<Readable>((res, rej) =>
              zip.openReadStream(entry, (e, s) => (e ? rej(e) : res(s)))
            )
            await pipeline(stream, createWriteStream(target))
          }
          zip.readEntry()
        } catch (e) {
          zip.close()
          reject(e)
        }
      })
      zip.readEntry()
    })
  })
}