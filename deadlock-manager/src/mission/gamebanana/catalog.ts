import { readFile, rename, writeFile } from 'node:fs/promises'
import { AppError, describeError, type Language } from '../i18n'
import {
  ModFilters,
  type Mod,
  type ModSearchResult,
  type Status,
  type SyncProgress
} from '../types'
import { gameBanana, HYDRATION_BATCH_SIZE, INDEX_PAGE_SIZE } from './client'
import { modId, normalize } from './normalize'
import { SUBMISSION_TYPES, type GbIndexRecord, type SubmissionType } from './types'

/** Versione del formato del file su disco: se cambia, il catalogo salvato viene ignorato. */
const FILE_VERSION = 2
/** Ogni quanto controllare le mod modificate (come l'app ufficiale). */
export const INCREMENTAL_INTERVAL_MS = 20 * 60_000
/** Ogni quanto rileggere tutto il catalogo, per togliere le mod rimosse da GameBanana. */
const FULL_SYNC_INTERVAL_MS = 7 * 24 * 60 * 60_000
/** Sotto questa quota di mod lette rispetto a quelle dichiarate, la sincronizzazione è incompleta. */
const MIN_COVERAGE = 0.95
/** Oltre questo numero di mod non più viste non si verifica una per una: si tengono tutte. */
const MAX_UNSEEN_CHECKS = 400

/** Mod del catalogo; `hydrated` è `false` finché mancano download, descrizione e file. */
interface Entry {
  mod: Mod
  hydrated: boolean
}

/** Contenuto del file con il catalogo salvato. */
interface SavedCatalog {
  version: number
  savedAt: string
  /** Ultima sincronizzazione completa (ms), `0` se mai fatta. */
  lastFullSyncAt: number
  /** Per ogni tipo, la data di modifica più recente già sincronizzata (secondi). */
  highWaterMarks: Record<SubmissionType, number>
  entries: Entry[]
}

/** Funzione per i messaggi di diagnostica della sincronizzazione. */
export type CatalogLogger = (message: string) => void

/**
 * Catalogo delle mod di Deadlock sincronizzato da GameBanana con gli stessi endpoint e la
 * stessa strategia dell'app ufficiale.
 *
 * - Primo avvio: mostra subito la prima pagina di mod e audio, poi fa la sincronizzazione completa.
 * - Sincronizzazione completa (al primo avvio e ogni 7 giorni): legge tutto l'indice dalla mod
 *   più vecchia e "idrata" ogni pagina con `Core/Item/Data` (download, descrizione, file).
 * - Sincronizzazione incrementale (ogni 20 minuti): legge l'indice dalla mod modificata più di
 *   recente fino a quelle già viste, e idrata solo le mod cambiate.
 * - L'interfaccia viene avvisata con `onUpdate` solo a sincronizzazione finita.
 */
export class GameBananaCatalog {
  private entries = new Map<string, Entry>()
  private highWaterMarks: Record<SubmissionType, number> = { Mod: 0, Sound: 0 }
  private lastFullSyncAt = 0
  private timer?: NodeJS.Timeout
  private lastUpdated?: Date
  /** Errore dell'ultima sincronizzazione, tradotto solo quando viene letto con `status()`. */
  private lastError?: unknown
  private progress?: SyncProgress
  /** Sincronizzazione in corso, per non avviarne due in parallelo. */
  private pending?: Promise<boolean>

  private constructor(
    private readonly cachePath: string | undefined,
    private readonly onUpdate: (() => void) | undefined,
    private readonly log: CatalogLogger
  ) {}

  /**
   * Crea il catalogo. Con un catalogo salvato è immediato e la sincronizzazione avviene in
   * background; altrimenti attende solo la prima pagina di mod e audio.
   * @throws Se non c'è un catalogo salvato e GameBanana non risponde
   */
  static async create(
    refreshMs = INCREMENTAL_INTERVAL_MS,
    cachePath?: string,
    onUpdate?: () => void,
    log: CatalogLogger = () => {}
  ): Promise<GameBananaCatalog> {
    const catalog = new GameBananaCatalog(cachePath, onUpdate, log)
    if (!(await catalog.loadFromDisk())) await catalog.loadFirstPages()
    catalog.refresh().catch(() => {})
    catalog.timer = setInterval(() => catalog.refresh().catch(() => {}), refreshMs)
    return catalog
  }

  /** Carica il catalogo salvato. Restituisce `false` se manca, è illeggibile o di un'altra versione. */
  private async loadFromDisk(): Promise<boolean> {
    if (!this.cachePath) return false
    try {
      const saved: SavedCatalog = JSON.parse(await readFile(this.cachePath, 'utf8'))
      if (saved.version !== FILE_VERSION || !saved.entries?.length) return false
      this.entries = new Map(saved.entries.map((e) => [e.mod.id, e]))
      this.highWaterMarks = saved.highWaterMarks
      this.lastFullSyncAt = saved.lastFullSyncAt
      this.lastUpdated = new Date(saved.savedAt)
      this.log(`catalogo caricato dal disco: ${this.entries.size} mod`)
      return true
    } catch {
      return false
    }
  }

  /** Salva il catalogo passando da un file temporaneo, per non lasciarlo a metà. */
  private async saveToDisk(): Promise<void> {
    if (!this.cachePath) return
    const saved: SavedCatalog = {
      version: FILE_VERSION,
      savedAt: (this.lastUpdated ?? new Date()).toISOString(),
      lastFullSyncAt: this.lastFullSyncAt,
      highWaterMarks: this.highWaterMarks,
      entries: [...this.entries.values()]
    }
    const tmp = `${this.cachePath}.tmp`
    await writeFile(tmp, JSON.stringify(saved))
    await rename(tmp, this.cachePath)
  }

  /** Prima pagina di ogni tipo, senza idratazione, per avere subito qualcosa da mostrare. */
  private async loadFirstPages(): Promise<void> {
    const started = Date.now()
    const pages = await Promise.all(SUBMISSION_TYPES.map((t) => gameBanana.indexPage(t, 1, true)))
    for (const record of pages.flatMap((p) => p._aRecords)) {
      const mod = normalize(record)
      this.entries.set(mod.id, { mod, hydrated: false })
    }
    this.lastUpdated = new Date()
    this.log(`prime pagine pronte: ${this.entries.size} mod in ${Date.now() - started} ms`)
  }

  /**
   * Sincronizza con GameBanana: completa se non è mai stata fatta o è passata una settimana,
   * altrimenti solo le modifiche.
   * @returns `true` se il catalogo è cambiato
   */
  public refresh(): Promise<boolean> {
    this.pending ??= this.doRefresh().finally(() => {
      this.pending = undefined
      this.progress = undefined
    })
    return this.pending
  }

  private async doRefresh(): Promise<boolean> {
    const started = Date.now()
    const requestsBefore = gameBanana.requests
    const full = Date.now() - this.lastFullSyncAt > FULL_SYNC_INTERVAL_MS
    try {
      const changed = full ? await this.fullSync() : await this.incrementalSync()
      this.lastError = undefined
      this.lastUpdated = new Date()
      this.log(
        `sincronizzazione ${full ? 'completa' : 'incrementale'}: ${changed} mod cambiate, ` +
          `${gameBanana.requests - requestsBefore} richieste, ${((Date.now() - started) / 1000).toFixed(1)} s`
      )
      if (changed === 0) return false
      await this.saveToDisk().catch((e) =>
        this.log(`salvataggio fallito: ${describeError(e, 'it')}`)
      )
      this.onUpdate?.()
      return true
    } catch (e) {
      this.lastError = e
      this.log(`sincronizzazione fallita: ${describeError(e, 'it')}`)
      throw e
    }
  }

  /** Idrata i record a gruppi; le mod che GameBanana non restituisce più vengono scartate. */
  private async hydrateRecords(type: SubmissionType, records: GbIndexRecord[]): Promise<Entry[]> {
    const batches: GbIndexRecord[][] = []
    for (let i = 0; i < records.length; i += HYDRATION_BATCH_SIZE)
      batches.push(records.slice(i, i + HYDRATION_BATCH_SIZE))
    const results = await Promise.all(
      batches.map(async (batch) => {
        const hydrations = await gameBanana.hydrate(
          type,
          batch.map((r) => r._idRow)
        )
        return batch.flatMap((record, i): Entry[] => {
          const hydration = hydrations[i]
          return hydration ? [{ mod: normalize(record, hydration), hydrated: true }] : []
        })
      })
    )
    return results.flat()
  }

  /**
   * Legge tutto l'indice dalla mod più vecchia, idratando ogni pagina, e poi sostituisce il
   * catalogo in un colpo solo. Le mod non più viste vengono tolte solo se GameBanana conferma
   * che non esistono più.
   */
  private async fullSync(): Promise<number> {
    const firsts = await Promise.all(SUBMISSION_TYPES.map((t) => gameBanana.indexPage(t, 1, false)))
    const expected = firsts.reduce((n, p) => n + p._aMetadata._nRecordCount, 0)
    const pagesPerType = firsts.map((p) => Math.ceil(p._aMetadata._nRecordCount / INDEX_PAGE_SIZE))
    this.progress = { done: 0, total: pagesPerType.reduce((a, b) => a + b, 0) }

    const next = new Map<string, Entry>()
    const highWaterMarks: Record<SubmissionType, number> = { Mod: 0, Sound: 0 }
    await Promise.all(
      SUBMISSION_TYPES.flatMap((type, i) =>
        Array.from({ length: pagesPerType[i] }, (_, p) => p + 1).map(async (page) => {
          const records =
            page === 1
              ? firsts[i]._aRecords
              : (await gameBanana.indexPage(type, page, false))._aRecords
          for (const entry of await this.hydrateRecords(type, records))
            next.set(entry.mod.id, entry)
          for (const r of records)
            highWaterMarks[type] = Math.max(highWaterMarks[type], r._tsDateModified)
          this.progress!.done++
        })
      )
    )

    if (next.size < expected * MIN_COVERAGE)
      throw new AppError('error.syncIncomplete', { got: next.size, expected })

    // Mod del vecchio catalogo non viste in questa lettura: si tengono quelle ancora esistenti
    const unseen = [...this.entries.values()].filter((e) => e.hydrated && !next.has(e.mod.id))
    if (unseen.length > MAX_UNSEEN_CHECKS) {
      for (const e of unseen) next.set(e.mod.id, e)
    } else {
      for (const type of SUBMISSION_TYPES) {
        const ofType = unseen.filter((e) => e.mod.isAudio === (type === 'Sound'))
        for (let i = 0; i < ofType.length; i += HYDRATION_BATCH_SIZE) {
          const batch = ofType.slice(i, i + HYDRATION_BATCH_SIZE)
          const alive = await gameBanana.hydrate(
            type,
            batch.map((e) => Number(e.mod.remoteId))
          )
          batch.forEach((e, j) => alive[j] && next.set(e.mod.id, e))
        }
      }
    }

    const removed = [...this.entries.keys()].filter((id) => !next.has(id)).length
    this.entries = next
    this.highWaterMarks = highWaterMarks
    this.lastFullSyncAt = Date.now()
    this.log(`lettura completa: ${next.size} mod su ${expected} dichiarate, ${removed} rimosse`)
    return next.size
  }

  /**
   * Legge l'indice dalla mod modificata più di recente finché non trova mod più vecchie
   * dell'ultima sincronizzazione, e idrata solo quelle nuove o cambiate.
   */
  private async incrementalSync(): Promise<number> {
    let changed = 0
    for (const type of SUBMISSION_TYPES) {
      const mark = this.highWaterMarks[type]
      let newest = mark
      const toHydrate: GbIndexRecord[] = []
      for (let page = 1; ; page++) {
        const { _aRecords, _aMetadata } = await gameBanana.indexPage(type, page, true)
        for (const record of _aRecords) {
          newest = Math.max(newest, record._tsDateModified)
          const current = this.entries.get(modId(type, record._idRow))
          const modified = new Date(record._tsDateModified * 1000).toISOString()
          if (!current?.hydrated || current.mod.updatedAt !== modified) toHydrate.push(record)
          else if (current.mod.likes !== (record._nLikeCount ?? 0)) {
            // i "mi piace" cambiano senza modificare la mod: si aggiornano dall'indice
            current.mod = { ...current.mod, likes: record._nLikeCount ?? 0 }
            changed++
          }
        }
        if (_aMetadata._bIsComplete || _aRecords.some((r) => r._tsDateModified < mark)) break
      }
      for (const entry of await this.hydrateRecords(type, toHydrate))
        this.entries.set(entry.mod.id, entry)
      this.highWaterMarks[type] = newest
      changed += toHydrate.length
    }
    return changed
  }

  /**
   * @param page
   * @param filters
   * @returns List of mods (paginated) with cache length
   */
  public pagination(page: number = 1, filters?: ModFilters): ModSearchResult {
    const f = { ...new ModFilters(), ...filters }
    const q = f.search?.trim().toLowerCase()
    const hero = f.hero?.toLowerCase()
    const tags = f.tags?.map((t) => t.toLowerCase())

    const filtered = [...this.entries.values()]
      .map((e) => e.mod)
      .filter((m) => {
        if (!f.includeNSFW && m.isNSFW) return false
        if (f.onlyDownloadable && m.downloadable === false) return false
        if (f.category && m.category !== f.category) return false
        if (hero && m.hero?.toLowerCase() !== hero) return false
        if (f.isAudio !== undefined && m.isAudio !== f.isAudio) return false
        if (f.isMap !== undefined && Boolean(m.isMap) !== f.isMap) return false
        if (tags?.length) {
          const modTags = m.tags.map((t) => t.toLowerCase())
          if (!tags.every((t) => modTags.includes(t))) return false
        }
        if (
          q &&
          !m.name.toLowerCase().includes(q) &&
          !m.description?.toLowerCase().includes(q) &&
          !m.author.toLowerCase().includes(q)
        )
          return false
        return true
      })

    const dir = f.sortOrder === 'asc' ? 1 : -1
    const key = f.sortBy ?? 'likes'
    filtered.sort((a, b) => {
      const x = a[key]
      const y = b[key]
      const cmp =
        typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)
      return cmp * dir
    })

    const size = f.pageSize ?? 20
    const start = (Math.max(page, 1) - 1) * size
    return { total: filtered.length, mods: filtered.slice(start, start + size) }
  }

  /** Categorie distinte presenti nel catalogo, in ordine alfabetico. */
  public categories(): string[] {
    return [...new Set([...this.entries.values()].map((e) => e.mod.category))].sort()
  }

  /**
   * @param language Language of the error message
   * @returns The status of the latest sync, with its progress while it is running
   */
  public status(language: Language = 'it'): Status {
    return {
      lastError: this.lastError === undefined ? undefined : describeError(this.lastError, language),
      lastUpdated: this.lastUpdated,
      total: this.entries.size,
      sync: this.progress && { ...this.progress }
    }
  }

  /** Stops the timer */
  public stop(): void {
    clearInterval(this.timer)
  }

  public getById(id: string): Mod | undefined {
    return this.entries.get(id)?.mod
  }
}
