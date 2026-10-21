/** Impostazioni dell'app salvate in `userData/settings.json`. */
export interface Settings {
  /** Cartella di installazione di Deadlock (quella che contiene `game/citadel`). */
  gamePath: string | null
  /** Se `true` mostra anche le mod NSFW. */
  includeNSFW: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  gamePath: null,
  includeNSFW: false
}
