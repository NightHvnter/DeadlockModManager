export interface Mod {
  id: string
  remoteId: string
  name: string
  description: string | null
  remoteUrl: string
  category: string
  likes: number
  author: string
  modAuthorId?: string | null
  downloadable?: boolean
  remoteAddedAt: string
  remoteUpdatedAt: string
  tags: string[]
  images: string[]
  thumbnailUrl?: string | null
  hero: string | null
  isAudio: boolean
  isMap?: boolean
  audioUrl: string | null
  downloadCount: number
  isNSFW: boolean
  filesUpdatedAt: string | null
  metadata?: ModMetadata | null
  dependencies?: ModDependency[] | null
  createdAt: string | null
  updatedAt: string | null
}

export interface ModMetadata {
  mapName?: string
  donationLinks?: { url: string; platform: string }[]
}

export interface ModDependency {
  label: string
  url: string | null
  remoteId: string | null
  level: 'required' | 'recommended' | null
}

export interface ModDownload {
  url: string
  size: number
  name: string
  md5Checksum: string | null
  /** Descrizione del file scritta dall'autore (es. "versione senza effetti"), se c'è. */
  description?: string | null
}

/** Voce del changelog di una mod. */
export interface ModChangelogEntry {
  title: string
  version: string | null
  /** Data in formato ISO. */
  date: string
  /** Testo libero in HTML, spesso vuoto quando c'è l'elenco delle modifiche. */
  text: string | null
  /** Modifiche con la loro categoria (es. "Improvement", "Bugfix"). */
  changes: { text: string; category: string }[]
}