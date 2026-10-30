/** Mod installata, come salvata nel manifest. */
export interface InstalledMod {
  id: string
  /** File presenti in `addons` (o nella cartella delle mod disattivate se `enabled` è `false`). */
  files: string[]
  /** `false` se la mod è stata disattivata: i suoi file sono spostati fuori da `addons`. */
  enabled: boolean
  /** Data di installazione in formato ISO, `null` per le installazioni di versioni precedenti. */
  installedAt: string | null
  /** Nome del file scaricato. */
  fileName: string | null
  /** Copia dei dati principali della mod, per mostrarla anche se sparisce da GameBanana. */
  name: string
  author: string
  category: string
  hero: string | null
  image: string | null
  /**
   * `true` per i VPK trovati in `addons` ma non installati dall'app (messi a mano, da un altro
   * manager o prima di reinstallare l'app): non hanno una mod di GameBanana collegata.
   */
  external?: boolean
  /**
   * Per una mod disattivata da un altro manager: cartella in cui sono rimasti i suoi file (es.
   * `addons` per i file `<id>_pak05_dir.vpk` del Deadlock Mod Manager ufficiale, o
   * `addons/.disabled` di Grimoire), al posto della cartella delle mod disattivate dell'app.
   */
  parkedIn?: string
}

/** Mod installata con le informazioni ricavate dal catalogo. */
export interface InstalledModInfo extends InstalledMod {
  /** `true` se i file della mod sono stati aggiornati dopo l'installazione. */
  updateAvailable: boolean
  /** `false` se la mod non compare più nel catalogo di GameBanana. */
  available: boolean
}

/** Avanzamento dello scaricamento di una mod, inviato al renderer su `mods:progress`. */
export interface InstallProgress {
  modId: string
  /** Byte ricevuti. */
  received: number
  /** Byte totali, `0` se sconosciuti. */
  total: number
}

/** Esito dell'installazione di un file locale: `error` è presente se non è riuscita. */
export interface LocalInstallResult {
  /** Nome del file scelto. */
  file: string
  error?: string
}

/**
 * Due mod attive che contengono gli stessi file: il gioco usa quelli di `winner`, la mod con
 * l'indice `pakNN` più basso, quindi quei file di `loser` non si vedono.
 */
export interface ModConflict {
  winner: string
  loser: string
  /** Numero di file in comune. */
  files: number
  /** Alcuni dei file in comune, per mostrarli all'utente. */
  sample: string[]
  /** `true` se l'utente ha accettato che `winner` abbia la priorità su `loser`. */
  accepted: boolean
}

/**
 * Conflitto che l'utente ha accettato: finché `winner` vince su `loser` non viene più segnalato.
 * Se l'ordine di caricamento si inverte è una coppia diversa, e torna a essere segnalato.
 */
export interface AcceptedConflict {
  winner: string
  loser: string
}
