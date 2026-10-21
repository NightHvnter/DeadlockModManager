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

/** Elemento di `apiv11/{Mod|Sound}/Index`: veloce ma senza contatori, descrizione e file. */
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
  /** `show`, `warn` o `hide`: le ultime due sono le mod con contenuti da nascondere di default. */
  _sInitialVisibility?: 'show' | 'warn' | 'hide'
  _bHasContentRatings?: boolean
}

export interface GbIndexPage {
  _aMetadata: { _nRecordCount: number; _nPerpage: number; _bIsComplete: boolean }
  _aRecords: GbIndexRecord[]
}

export interface GbFile {
  _idRow: number
  _sFile: string
  _nFilesize: number
  _tsDateAdded: number
  _sDownloadUrl: string
  _sMd5Checksum?: string
  _bIsArchived?: boolean
}

/** `apiv11/{Mod|Sound}/{id}/ProfilePage`: tutti i dettagli di una mod. */
export interface GbProfile {
  _idRow: number
  _sName: string
  _sText?: string
  _nDownloadCount?: number
  _nLikeCount?: number
  _aFiles?: GbFile[]
  _aPreviewMedia?: GbPreviewMedia
  _aContentRatings?: Record<string, string>
}

/** Contatori letti con la chiamata multipla `Core/Item/Data`. */
export interface GbCounts {
  downloads: number
  likes: number
}
