import { createExtractorFromFile } from 'node-unrar-js'
import { resolve, sep } from 'node:path'
import { AppError } from '../i18n'

/**
 * Estrae i file `.vpk` di un archivio RAR in `destDir`, ignorando i percorsi fuori dalla cartella.
 * @throws Se l'archivio è corrotto, protetto da password o contiene percorsi non validi.
 */
export async function extractRar(rarPath: string, destDir: string): Promise<void> {
  const root = resolve(destDir) + sep
  const extractor = await createExtractorFromFile({ filepath: rarPath, targetPath: destDir })
  const { files } = extractor.extract({
    files: ({ name, flags }) => {
      if (flags.directory || !name.toLowerCase().endsWith('.vpk')) return false
      if (!resolve(destDir, name).startsWith(root))
        throw new AppError('error.invalidPath', { path: name })
      return true
    }
  })
  // l'estrazione avviene mentre si scorre il generatore
  for (const file of files) void file
}
