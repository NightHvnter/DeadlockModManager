export type Status = {
  lastUpdated: Date | undefined
  /** Messaggio dell'ultimo errore di aggiornamento (gli oggetti `Error` non attraversano bene l'IPC). */
  lastError: string | undefined
  total: number | undefined
}
