/**
 * Stato degli aggiornamenti dell'app, inviato al renderer su `updates:status`:
 * - `idle`: nessun controllo fatto (all'avvio, o con gli aggiornamenti automatici spenti);
 * - `unsupported`: questa installazione non si aggiorna da sola (sviluppo, macOS senza firma,
 *   pacchetti Linux diversi da AppImage); `latest` è l'ultima versione pubblicata, se nota;
 * - `checking`: controllo in corso;
 * - `upToDate`: nessuna versione più recente;
 * - `downloading`: scaricamento della versione `version` (`percent` da 0 a 100);
 * - `ready`: la versione `version` è scaricata e si installa al riavvio;
 * - `error`: il controllo o lo scaricamento sono falliti.
 */
export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'unsupported'; latest: string | null }
  | { state: 'checking' }
  | { state: 'upToDate' }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }

/** Pagina dei release su GitHub, per scaricare a mano le versioni nuove. */
export const RELEASES_URL = 'https://github.com/NightHvnter/DeadlockModManager/releases/latest'
