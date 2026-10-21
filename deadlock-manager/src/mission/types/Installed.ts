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
  /** Copia dei dati principali della mod, per mostrarla anche se sparisce dall'API. */
  name: string
  author: string
  category: string
  hero: string | null
  image: string | null
}

/** Mod installata con le informazioni ricavate dall'API. */
export interface InstalledModInfo extends InstalledMod {
  /** `true` se i file della mod sono stati aggiornati dopo l'installazione. */
  updateAvailable: boolean
  /** `false` se la mod non compare più tra quelle dell'API. */
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
