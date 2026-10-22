/** Dove un colore dell'interfaccia compare negli stili Panorama del gioco. */
export interface ColorTarget {
  /** Colore originale, mostrato come valore di partenza. */
  original: string
  /** Valori esadecimali sostituiti ovunque, tranne nelle `@define` che appartengono ad altri colori. */
  hex?: readonly string[]
  /** Nomi delle `@define` il cui valore viene sostituito, in tutti gli stili che le dichiarano. */
  defines?: readonly string[]
  /**
   * Regole che disegnano una texture già colorata: il colore si applica aggiungendo `wash-color`,
   * perché un `background-color` resterebbe nascosto sotto l'immagine.
   */
  wash?: readonly { style: string; selector: string }[]
}

/** Colori dell'interfaccia di Deadlock che l'app sa cambiare. */
export const COLOR_SLOTS = {
  /** Testo dei menu e dell'HUD (`offWhite`, `baseText`, ...). */
  text: { original: '#FFEFD7', hex: ['#FFEFD7'] },
  /** Evidenziazioni e oro (`colorEmphasis`, `colorGold`). */
  accent: { original: '#FFCC00', hex: ['#FFCC00'] },
  /** Verde Deadlock di pulsanti e selezioni (`deadlockGreen`). */
  brand: { original: '#69E799', hex: ['#69E799'] },
  /** Nemici: barre sopra gli eroi, kill feed (`teamEnemyColor`), minimappa e indicatori. */
  enemy: {
    original: '#FF410D',
    hex: ['#FF410D'],
    defines: ['colorEnemy', 'ColorEnemy', 'TeamEnemyColor', 'teamEnemyColor', 'crosshairEnemyColor']
  },
  /** Alleati: barre sopra gli eroi, minimappa e indicatori (valgono `#FFEFD7` come il testo). */
  friendly: {
    original: '#FFEFD7',
    defines: ['TeamFriendColor', 'ColorFriendly', 'teamFriendlyColor', 'colorFriendly']
  },
  /** Barra della vita del proprio eroe, una texture verde in `hud_health`. */
  localHealth: {
    original: '#00994D',
    defines: ['colorLocalHealthbar'],
    wash: [{ style: 'panorama/styles/hud_health.vcss_c', selector: '#health_bar .ProgressBarLeft' }]
  },
  /** Barre della vita degli alleati nel riquadro della squadra (`colorFriendlyHealthbar`). */
  friendlyHealth: { original: '#2D806F', defines: ['colorFriendlyHealthbar'] },
  /** Anime: contatore e icone dell'HUD (`shardColor`) e altri riquadri (`soulColor`). */
  souls: { original: '#99FFD6', defines: ['shardColor', 'soulColor'] },
  /** Colore "tech" azzurro (`techColor`). */
  tech: { original: '#00DDFF', hex: ['#00DDFF'] }
} as const satisfies Record<string, ColorTarget>

export type ColorSlot = keyof typeof COLOR_SLOTS
export const COLOR_SLOT_IDS = Object.keys(COLOR_SLOTS) as ColorSlot[]

/** Colori scelti dall'utente, in formato `#RRGGBB`; gli slot assenti restano originali. */
export type InterfaceColors = Partial<Record<ColorSlot, string>>

/** Esito della generazione del VPK dei colori. */
export interface InterfaceColorsResult {
  /** Nome del VPK in `addons`, `null` se non serve (nessun colore cambiato). */
  file: string | null
  /** Stili Panorama modificati. */
  styles: number
  /** Mod con priorità più alta che contengono gli stessi stili: lì i colori non si vedono. */
  conflicts: string[]
}
