/** Avanzamento di una sincronizzazione del catalogo in corso. */
export interface SyncProgress {
  /** `index`: pagine dell'elenco delle mod; `counts`: download e "mi piace". */
  phase: 'index' | 'counts'
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
