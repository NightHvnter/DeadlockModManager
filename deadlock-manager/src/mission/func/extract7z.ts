import SevenZip from '7z-wasm'
import { readdir, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { AppError } from '../i18n'

/**
 * Estrae i file `.vpk` di un archivio 7z in `destDir`. 7-Zip non scrive fuori dalla cartella di
 * destinazione; gli eventuali collegamenti estratti vengono tolti, perché copiandoli si
 * seguirebbero fino al file a cui puntano.
 * @throws Se l'archivio è corrotto o protetto da password.
 */
export async function extract7z(path: string, destDir: string): Promise<void> {
  const errors: string[] = []
  const sevenZip = await SevenZip({
    print: () => {},
    printErr: (line) => errors.push(line)
  })
  sevenZip.FS.mkdir('/in')
  sevenZip.FS.mkdir('/out')
  sevenZip.FS.mount(sevenZip.NODEFS, { root: dirname(path) }, '/in')
  sevenZip.FS.mount(sevenZip.NODEFS, { root: destDir }, '/out')
  // `-p_`: con una password finta un archivio protetto dà errore invece di chiederla;
  // `-ssc-`: il filtro vale anche per `.VPK`
  const args = ['x', `/in/${basename(path)}`, '-o/out', '-y', '-p_', '-ssc-', '-r', '*.vpk']
  // `callMain` restituisce il codice di 7-Zip (i suoi tipi dicono `void`) e lo scrive anche in
  // `process.exitCode`, che è quello dell'app: va rimesso com'era
  const appExitCode = process.exitCode
  const status = sevenZip.callMain(args) as unknown as number
  process.exitCode = appExitCode
  if (status > 1) {
    console.warn('[7z]', basename(path), status, errors.join(' | '))
    throw new AppError('error.archive', { name: basename(path) })
  }

  const entries = await readdir(destDir, { recursive: true, withFileTypes: true })
  for (const entry of entries.filter((e) => !e.isFile() && !e.isDirectory()))
    await rm(join(entry.parentPath, entry.name), { force: true })
}
