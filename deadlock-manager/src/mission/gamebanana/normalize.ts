import { HEROES, type Mod } from '../types'
import type { GbCounts, GbIndexRecord, SubmissionType } from './types'

/** Eroi dal nome più lungo al più corto, così "Mo & Krill" vince su eventuali nomi contenuti. */
const HEROES_BY_LENGTH = [...HEROES].sort((a, b) => b.length - a.length)

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const toIso = (seconds: number | undefined): string =>
  new Date((seconds ?? 0) * 1000).toISOString()

/** Id interno di una mod: il tipo serve per costruire gli URL dell'API (`Mod/123`, `Sound/456`). */
export const modId = (type: SubmissionType, id: number): string => `${type}-${id}`

/** Tipo e id GameBanana di un id interno; `null` se l'id non è nel formato `Tipo-numero`. */
export function parseModId(id: string): { type: SubmissionType; id: number } | null {
  const match = /^(Mod|Sound)-(\d+)$/.exec(id)
  return match ? { type: match[1] as SubmissionType, id: Number(match[2]) } : null
}

/**
 * Eroe di una mod. GameBanana non ha un campo apposito: per le skin la sottocategoria è il
 * nome dell'eroe, altrimenti si cerca il nome di un eroe nel titolo o nei tag.
 */
function detectHero(record: GbIndexRecord, tags: string[]): string | null {
  const sub = record._aSubCategory?._sName
  const exact = HEROES.find((h) => h.toLowerCase() === sub?.toLowerCase())
  if (exact) return exact
  const haystack = [record._sName, sub ?? '', ...tags].join(' ')
  return (
    HEROES_BY_LENGTH.find((h) => new RegExp(`\\b${escapeRegExp(h)}\\b`, 'i').test(haystack)) ??
    null
  )
}

/** I tag possono essere stringhe o oggetti `{ _sTitle, _sValue }` a seconda della mod. */
function tagText(tag: unknown): string | null {
  if (typeof tag === 'string') return tag
  if (tag && typeof tag === 'object') {
    const t = tag as { _sValue?: unknown; _sTitle?: unknown }
    if (typeof t._sValue === 'string') return t._sValue
    if (typeof t._sTitle === 'string') return t._sTitle
  }
  return null
}

/**
 * Converte un elemento dell'indice nel tipo `Mod` usato dall'app.
 * Descrizione, file e dipendenze non sono nell'indice: restano vuoti finché non serve il dettaglio.
 */
export function normalize(record: GbIndexRecord, counts?: GbCounts): Mod {
  const type = record._sModelName
  const tags = record._aTags.map(tagText).filter((t): t is string => !!t)
  const images = (record._aPreviewMedia?._aImages ?? []).map((i) => `${i._sBaseUrl}/${i._sFile}`)
  const first = record._aPreviewMedia?._aImages?.[0]
  const category = record._aRootCategory?._sName ?? (type === 'Sound' ? 'Sound' : 'Other')

  return {
    id: modId(type, record._idRow),
    remoteId: String(record._idRow),
    name: record._sName,
    description: null,
    remoteUrl: record._sProfileUrl,
    category,
    likes: counts?.likes ?? 0,
    author: record._aSubmitter?._sName ?? '',
    modAuthorId: record._aSubmitter ? String(record._aSubmitter._idRow) : null,
    downloadable: record._bHasFiles,
    remoteAddedAt: toIso(record._tsDateAdded),
    remoteUpdatedAt: toIso(record._tsDateUpdated || record._tsDateModified),
    tags,
    images,
    thumbnailUrl: first ? `${first._sBaseUrl}/${first._sFile530 ?? first._sFile}` : null,
    hero: detectHero(record, tags),
    isAudio: type === 'Sound',
    // da verificare: non c'è un flag, si deduce dal nome della categoria
    isMap: /\bmaps?\b/i.test(category),
    audioUrl: record._aPreviewMedia?._aMetadata?._sAudioUrl ?? null,
    downloadCount: counts?.downloads ?? 0,
    isNSFW: (record._sInitialVisibility ?? 'show') !== 'show',
    filesUpdatedAt: null,
    metadata: null,
    dependencies: null,
    createdAt: null,
    updatedAt: toIso(record._tsDateModified)
  }
}
