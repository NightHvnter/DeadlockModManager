/** Avanzamento di una sincronizzazione completa del catalogo. */
export interface SyncProgress {
  /** Pagine dell'indice lette e idratate. */
  done: number
  total: number
  /** Mod lette finora e mod dichiarate da GameBanana. */
  loaded: number
  expected: number
}

export type Status = {
  lastUpdated: Date | undefined
  /** Messaggio dell'ultimo errore di aggiornamento (gli oggetti `Error` non attraversano bene l'IPC). */
  lastError: string | undefined
  total: number | undefined
  /** Presente solo mentre una sincronizzazione è in corso. */
  sync?: SyncProgress
}
