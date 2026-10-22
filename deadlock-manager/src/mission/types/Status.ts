/** Avanzamento di una sincronizzazione completa del catalogo: pagine dell'indice lette e idratate. */
export interface SyncProgress {
  done: number
  total: number
}

export type Status = {
  lastUpdated: Date | undefined
  /** Messaggio dell'ultimo errore di aggiornamento (gli oggetti `Error` non attraversano bene l'IPC). */
  lastError: string | undefined
  total: number | undefined
  /** Presente solo mentre una sincronizzazione è in corso. */
  sync?: SyncProgress
}
