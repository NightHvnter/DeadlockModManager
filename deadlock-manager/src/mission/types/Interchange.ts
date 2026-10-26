/** Esito dell'esportazione delle mod in un pacchetto "Deadlock Mod Interchange". */
export interface InterchangeExportResult {
  /** Cartella del pacchetto creato. */
  folder: string
  /** Mod esportate. */
  exported: number
  /** Nomi delle mod saltate perché i loro file non ci sono più. */
  skipped: string[]
}

/**
 * Motivo per cui una mod del pacchetto non è stata importata:
 * - `alreadyInstalled`: è già installata;
 * - `missingFiles`: il pacchetto non contiene i suoi VPK;
 * - `checksum`: un VPK non corrisponde allo SHA-256 del pacchetto;
 * - `failed`: errore durante la copia.
 */
export type InterchangeSkipReason = 'alreadyInstalled' | 'missingFiles' | 'checksum' | 'failed'

/** Esito dell'importazione di un pacchetto "Deadlock Mod Interchange". */
export interface InterchangeImportResult {
  /** Manager che ha creato il pacchetto (es. `deadlock-mod-manager`). */
  source: string
  imported: number
  skipped: { name: string; reason: InterchangeSkipReason }[]
}
