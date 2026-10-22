/**
 * Forma (parziale) delle risposte dell'API di GameBanana, solo i campi che usiamo.
 * Le date sono timestamp Unix in secondi.
 */

/** Tipi di contenuto di GameBanana che contengono mod di Deadlock. */
export type SubmissionType = 'Mod' | 'Sound'
export const SUBMISSION_TYPES: SubmissionType[] = ['Mod', 'Sound']

export interface GbCategory {
  _idRow?: number
  _sName: string
}

export interface GbImage {
  _sBaseUrl: string
  _sFile: string
  _sFile530?: string
  _sFile220?: string
}

export interface GbPreviewMedia {
  _aImages?: GbImage[]
  _aMetadata?: { _sAudioUrl?: string }
}

/** Elemento di `apiv11/{Mod|Sound}/Index`: veloce ma senza download, descrizione e file. */
export interface GbIndexRecord {
  _idRow: number
  _sModelName: SubmissionType
  _sName: string
  _sProfileUrl: string
  _tsDateAdded: number
  _tsDateModified: number
  _tsDateUpdated?: number
  _bHasFiles: boolean
  _aTags: unknown[]
  _aPreviewMedia?: GbPreviewMedia
  _aSubmitter?: { _idRow: number; _sName: string }
  _aRootCategory?: GbCategory
  _aSubCategory?: GbCategory
  _bIsObsolete?: boolean
  _nLikeCount?: number
  /** `show`, `warn` o `hide`: le ultime due sono le mod con contenuti da nascondere di default. */
  _sInitialVisibility?: 'show' | 'warn' | 'hide'
}

export interface GbPageMetadata {
  _nRecordCount: number
  _nPerpage: number
  _bIsComplete: boolean
}

export interface GbIndexPage {
  _aMetadata: GbPageMetadata
  _aRecords: GbIndexRecord[]
}

export interface GbFile {
  _idRow: number
  _sFile: string
  _nFilesize: number
  _tsDateAdded: number
  _sDownloadUrl: string
  _sMd5Checksum?: string
  _sDescription?: string
  _bIsArchived?: boolean
}

/** `apiv11/{Mod|Sound}/{id}/DownloadPage`: i file scaricabili, più leggero della pagina completa. */
export interface GbDownloadPage {
  _aFiles?: GbFile[]
  _bIsTrashed?: boolean
  _bIsWithheld?: boolean
}

/**
 * Dati di una mod letti con `Core/Item/Data` (la "idratazione" dell'app ufficiale):
 * quello che l'indice non contiene.
 */
export interface GbHydration {
  name: string
  downloads: number
  /** Categoria diretta: per le skin è il nome dell'eroe. */
  category: string
  rootCategory: string
  description: string
  /** Testo completo in HTML. */
  text: string
  /** Data del file più recente, in secondi; `null` se non ci sono file. */
  filesUpdatedAt: number | null
}

/** Voce del changelog di `apiv11/{Mod|Sound}/{id}/Updates`. */
export interface GbUpdate {
  _idRow: number
  _sName: string
  _sVersion?: string
  _tsDateAdded: number
  _sText?: string
  _aChangeLog?: { text: string; cat: string }[]
}

export interface GbUpdatesPage {
  _aMetadata: GbPageMetadata
  _aRecords: GbUpdate[]
}
