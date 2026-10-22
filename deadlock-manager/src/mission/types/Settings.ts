import type { Language } from '../i18n'
import type { InterfaceColors } from './InterfaceColors'

/** Impostazioni dell'app salvate in `userData/settings.json`. */
export interface Settings {
  /** Cartella di installazione di Deadlock (quella che contiene `game/citadel`). */
  gamePath: string | null
  /** Se `true` mostra anche le mod NSFW. */
  includeNSFW: boolean
  /** Lingua dell'interfaccia; `null` usa quella del sistema. */
  language: Language | null
  /**
   * Se `true`, all'avvio dell'app e quando si preme "Gioca" la riga che carica le mod viene
   * rimessa in `gameinfo.gi` se un aggiornamento del gioco l'ha tolta. Il file non viene mai
   * controllato in altri momenti.
   */
  autoRepairGameinfo: boolean
  /** Colori dell'interfaccia del gioco scelti dall'utente; vuoto per quelli originali. */
  interfaceColors: InterfaceColors
}

export const DEFAULT_SETTINGS: Settings = {
  gamePath: null,
  includeNSFW: false,
  language: null,
  autoRepairGameinfo: true,
  interfaceColors: {}
}
