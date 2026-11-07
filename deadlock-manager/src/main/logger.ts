import { app } from 'electron'
import { createWriteStream, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { format } from 'node:util'

/** Oltre questa dimensione, all'avvio il log diventa `app.old.log` e se ne inizia uno nuovo. */
const MAX_LOG_BYTES = 5 * 1024 * 1024

/** Cartella dei log, nella cartella dei dati dell'app. */
export const logsDir = (): string => join(app.getPath('userData'), 'logs')

/**
 * Scrive in `logs/app.log` tutto quello che il processo main manda alla console, più gli errori
 * che nessuno ha gestito: senza, i problemi segnalati dagli utenti non si potrebbero capire. I
 * messaggi continuano ad arrivare anche al terminale. Un errore del log non ferma mai l'app.
 */
export function initLogging(): void {
  const dir = logsDir()
  const path = join(dir, 'app.log')
  try {
    mkdirSync(dir, { recursive: true })
    if ((statSync(path, { throwIfNoEntry: false })?.size ?? 0) > MAX_LOG_BYTES)
      renameSync(path, join(dir, 'app.old.log'))
  } catch {
    // senza cartella o senza rotazione si prova comunque a scrivere
  }
  const stream = createWriteStream(path, { flags: 'a' })
  stream.on('error', () => {})

  const write = (level: string, args: unknown[]): void => {
    stream.write(`${new Date().toISOString()} ${level} ${format(...args)}\n`)
  }
  for (const level of ['log', 'warn', 'error'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]): void => {
      original(...args)
      write(level.toUpperCase(), args)
    }
  }

  console.log(`[app] ${app.getVersion()} ${process.platform} ${process.arch}`)
  // `Monitor` non cambia quello che succede dopo: Electron mostra il suo errore come sempre
  process.on('uncaughtExceptionMonitor', (e) => console.error('[crash]', e))
  process.on('unhandledRejection', (e) => console.error('[unhandled]', e))
  app.on('render-process-gone', (_, __, details) => console.error('[renderer]', details))
  app.on('child-process-gone', (_, details) => console.error('[process]', details))
}
