import { HEROES, type Mod } from '../types'
import type { GbHydration, GbIndexRecord, SubmissionType } from './types'

/** Eroi dal nome più lungo al più corto, così "Mo & Krill" vince su eventuali nomi contenuti. */
const HEROES_BY_LENGTH = [...HEROES].sort((a, b) => b.length - a.length)

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const toIso = (seconds: number | null | undefined): string =>
  new Date((seconds ?? 0) * 1000).toISOString()

/** Id interno di una mod: il tipo serve per costruire gli URL dell'API (`Mod/123`, `Sound/456`). */
export const modId = (type: SubmissionType, id: number): string => `${type}-${id}`

/** Tipo e id GameBanana di un id interno; `null` se l'id non è nel formato `Tipo-numero`. */
export function parseModId(id: string): { type: SubmissionType; id: number } | null {
  const match = /^(Mod|Sound)-(\d+)$/.exec(id)
  return match ? { type: match[1] as SubmissionType, id: Number(match[2]) } : null
}

/** Eroe con quel nome esatto (senza distinzione tra maiuscole e minuscole). */
const heroNamed = (name: string | undefined): string | null =>
  HEROES.find((h) => h.toLowerCase() === name?.trim().toLowerCase()) ?? null

/**
 * Eroe di una mod. GameBanana non ha un campo apposito: come nell'app ufficiale, per le skin
 * la categoria diretta è il nome dell'eroe; altrimenti si cerca il nome di un eroe nel titolo
 * o nei tag (utile per audio e HUD).
 */
function detectHero(
  record: GbIndexRecord,
  tags: string[],
  hydration: GbHydration | undefined
): string | null {
  const exact = heroNamed(hydration?.category) ?? heroNamed(record._aSubCategory?._sName)
  if (exact) return exact
  const haystack = [record._sName, ...tags].join(' ')
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
 * Converte un elemento dell'indice nel tipo `Mod` usato dall'app. Con i dati dell'idratazione
 * aggiunge download, descrizione, categoria precisa e data dei file; senza, quei campi restano
 * vuoti (succede solo con le prime pagine mostrate al primo avvio).
 */
export function normalize(record: GbIndexRecord, hydration?: GbHydration): Mod {
  const type = record._sModelName
  const tags = (record._aTags ?? []).map(tagText).filter((t): t is string => !!t)
  const images = (record._aPreviewMedia?._aImages ?? []).map((i) => `${i._sBaseUrl}/${i._sFile}`)
  const first = record._aPreviewMedia?._aImages?.[0]
  const category =
    hydration?.rootCategory.trim() ||
    hydration?.category.trim() ||
    record._aRootCategory?._sName.trim() ||
    'Other'

  return {
    id: modId(type, record._idRow),
    remoteId: String(record._idRow),
    name: hydration?.name || record._sName,
    // `text` è la descrizione completa in HTML, `description` il sottotitolo breve
    description: hydration ? hydration.text || hydration.description || null : null,
    remoteUrl: record._sProfileUrl,
    category,
    likes: record._nLikeCount ?? 0,
    author: record._aSubmitter?._sName ?? '',
    modAuthorId: record._aSubmitter ? String(record._aSubmitter._idRow) : null,
    downloadable: record._bHasFiles,
    remoteAddedAt: toIso(record._tsDateAdded),
    remoteUpdatedAt: toIso(record._tsDateModified || record._tsDateAdded),
    tags,
    images,
    thumbnailUrl: first ? `${first._sBaseUrl}/${first._sFile530 ?? first._sFile}` : null,
    hero: detectHero(record, tags, hydration),
    isAudio: type === 'Sound',
    isMap: type === 'Mod' && category === 'Maps',
    audioUrl: record._aPreviewMedia?._aMetadata?._sAudioUrl ?? null,
    downloadCount: hydration?.downloads ?? 0,
    isNSFW: (record._sInitialVisibility ?? 'show') !== 'show',
    filesUpdatedAt: hydration?.filesUpdatedAt ? toIso(hydration.filesUpdatedAt) : null,
    metadata: null,
    dependencies: null,
    createdAt: null,
    updatedAt: toIso(record._tsDateModified)
  }
}
