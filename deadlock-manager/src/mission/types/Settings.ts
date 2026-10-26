import type { Language } from '../i18n'
import type { InterfaceColors } from './InterfaceColors'

/** Dimensioni del testo dell'app, in percentuale di quella normale. */
export const TEXT_SIZES = { small: 87.5, normal: 100, large: 112.5, xlarge: 125 } as const
export type TextSize = keyof typeof TEXT_SIZES
export const TEXT_SIZE_IDS = Object.keys(TEXT_SIZES) as TextSize[]

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
  /** Dimensione del testo e di tutta l'interfaccia dell'app. */
  textSize: TextSize
  /** Se `true` toglie animazioni e transizioni (vale anche se lo chiede il sistema). */
  reduceMotion: boolean
  /** Se `true` rende più scuri (o chiari) testi secondari, bordi e contorno di selezione. */
  highContrast: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  gamePath: null,
  includeNSFW: false,
  language: null,
  autoRepairGameinfo: true,
  interfaceColors: {},
  textSize: 'normal',
  reduceMotion: false,
  highContrast: false
}
