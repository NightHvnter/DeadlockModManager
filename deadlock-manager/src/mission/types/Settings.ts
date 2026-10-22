import type { Language } from '../i18n'

/** Impostazioni dell'app salvate in `userData/settings.json`. */
export interface Settings {
  /** Cartella di installazione di Deadlock (quella che contiene `game/citadel`). */
  gamePath: string | null
  /** Se `true` mostra anche le mod NSFW. */
  includeNSFW: boolean
  /** Lingua dell'interfaccia; `null` usa quella del sistema. */
  language: Language | null
}

export const DEFAULT_SETTINGS: Settings = {
  gamePath: null,
  includeNSFW: false,
  language: null
}
