import { type Mod } from '.'

export const HEROES = [
  'Abrams',
  'Apollo',
  'Baba',
  'Bebop',
  'Billy',
  'Calico',
  'Celeste',
  'Deadman Danny',
  'Doorman',
  'Drifter',
  'Dynamo',
  'Graves',
  'Grey Talon',
  'Haze',
  'Holliday',
  'Infernus',
  'Ivy',
  'Kelvin',
  'Lady Geist',
  'Lash',
  'McGinnis',
  'Mina',
  'Mirage',
  'Mo & Krill',
  'Nurse Harrow',
  'Paige',
  'Paradox',
  'Pocket',
  'Rat King',
  'Rem',
  'Seven',
  'Shiv',
  'Silver',
  'Sinclair',
  'Solomon',
  'Venator',
  'Victor',
  'Vindicta',
  'Violet',
  'Viscous',
  'Vyper',
  'Warden',
  'Wraith',
  'Wrecker',
  'Yamato'
] as const

export type Hero = (typeof HEROES)[number]

export type ModSortField = 'downloadCount' | 'likes' | 'remoteAddedAt' | 'remoteUpdatedAt' | 'name'

/** Filtri applicabili alla ricerca delle mod. Tutti i campi sono opzionali. */
export class ModFilters {
  /** Testo cercato in `name`, `description` e `author` (senza distinzione tra maiuscole e minuscole). */
  search?: string
  /** Categoria esatta, ad esempio "Skins" o "HUD". */
  category?: string
  /** Eroe esatto, ad esempio "Billy". */
  hero?: string
  /** Una o più tag; la mod deve averle tutte. */
  tags?: string[]
  /** Se `false` (default consigliato) esclude le mod NSFW. */
  includeNSFW?: boolean = false
  /** `true` solo mod audio, `false` esclude le mod audio. */
  isAudio?: boolean
  /** `true` solo mappe, `false` esclude le mappe. */
  isMap?: boolean
  /** Se `true` (default consigliato) esclude le mod non scaricabili. */
  onlyDownloadable?: boolean = true
  /** Campo di ordinamento. */
  sortBy?: ModSortField = 'likes'
  /** Direzione di ordinamento (default `desc`). */
  sortOrder?: 'asc' | 'desc' = 'desc'
  /** Mod per pagina. */
  pageSize?: number = 20
}

/** Risultato paginato di una ricerca. */
export interface ModSearchResult {
  /** Numero totale di mod che soddisfano i filtri. */
  total: number
  /** Mod della pagina richiesta. */
  mods: Mod[]
}
