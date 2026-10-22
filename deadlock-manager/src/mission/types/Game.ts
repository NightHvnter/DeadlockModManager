/**
 * Esito del controllo di `gameinfo.gi`:
 * - `ok`: la riga che carica le mod c'è;
 * - `repaired`: mancava (di solito dopo un aggiornamento del gioco) ed è stata rimessa;
 * - `needsRepair`: manca, ma la riparazione automatica è disattivata;
 * - `notNeeded`: nessuna mod attiva, il file non è stato toccato;
 * - `noGame`: la cartella di Deadlock non è impostata o non è valida.
 */
export type GameinfoStatus = 'ok' | 'repaired' | 'needsRepair' | 'notNeeded' | 'noGame'
