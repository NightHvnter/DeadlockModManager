import { readFile, rename, writeFile } from 'node:fs/promises'
import { describeError, type Language } from '../i18n'
import { ModFilters, type Mod, type ModSearchResult, type Status, type SyncProgress } from '../types'
import { gameBanana, INDEX_PAGE_SIZE } from './client'
import { modId, normalize } from './normalize'
import { SUBMISSION_TYPES, type GbIndexRecord, type SubmissionType } from './types'

/** Versione del formato del file su disco: se cambia, il catalogo salvato viene ignorato. */
const FILE_VERSION = 1

/** Contenuto del file con il catalogo salvato. */
interface SavedCatalog {
  version: number
  savedAt: string
  /**
   * Per ogni tipo, la data di modifica più recente già sincronizzata (secondi). `0` vuol dire
   * che non è mai stata fatta una sincronizzazione completa.
   */
  cursors: Record<SubmissionType, number>
  mods: Mod[]
}

/** Funzione per i messaggi di diagnostica della sincronizzazione. */
export type CatalogLogger = (message: string) => void

/**
 * Catalogo delle mod di Deadlock sincronizzato direttamente da GameBanana.
 *
 * - Primo avvio: scarica subito la prima pagina di mod e audio, poi il resto in background.
 * - Avvii successivi: parte dal catalogo su disco e chiede a GameBanana solo le mod modificate
 *   dopo l'ultima sincronizzazione (l'indice è ordinato per data di modifica).
 * - La lista in memoria viene sostituita solo a sincronizzazione finita, poi viene chiamato `onUpdate`.
 */
export class GameBananaCatalog {
  private mods = new Map<string, Mod>()
  private cursors: Record<SubmissionType, number> = { Mod: 0, Sound: 0 }
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
    refreshMs = 60 * 60_000,
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
      if (saved.version !== FILE_VERSION || !saved.mods?.length) return false
      this.mods = new Map(saved.mods.map((m) => [m.id, m]))
      this.cursors = saved.cursors
      this.lastUpdated = new Date(saved.savedAt)
      this.log(`catalogo caricato dal disco: ${this.mods.size} mod`)
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
      cursors: this.cursors,
      mods: [...this.mods.values()]
    }
    const tmp = `${this.cachePath}.tmp`
    await writeFile(tmp, JSON.stringify(saved))
    await rename(tmp, this.cachePath)
  }

  /** Prima pagina di ogni tipo, per avere subito qualcosa da mostrare al primo avvio. */
  private async loadFirstPages(): Promise<void> {
    const started = Date.now()
    const pages = await Promise.all(SUBMISSION_TYPES.map((t) => gameBanana.indexPage(t, 1)))
    for (const record of pages.flatMap((p) => p._aRecords)) {
      const mod = normalize(record)
      this.mods.set(mod.id, mod)
    }
    this.lastUpdated = new Date()
    this.log(`prime pagine pronte: ${this.mods.size} mod in ${Date.now() - started} ms`)
  }

  /**
   * Sincronizza con GameBanana: completa se non è mai stata fatta, altrimenti solo le modifiche.
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
    try {
      const full = SUBMISSION_TYPES.some((t) => this.cursors[t] === 0)
      const changed = full ? await this.fullSync() : await this.incrementalSync()
      this.lastError = undefined
      this.lastUpdated = new Date()
      this.log(
        `sincronizzazione ${full ? 'completa' : 'incrementale'}: ${changed} mod cambiate, ` +
          `${gameBanana.requests - requestsBefore} richieste, ${((Date.now() - started) / 1000).toFixed(1)} s`
      )
      if (changed === 0) return false
      await this.saveToDisk().catch((e) => this.log(`salvataggio fallito: ${describeError(e, 'it')}`))
      this.onUpdate?.()
      return true
    } catch (e) {
      this.lastError = e
      this.log(`sincronizzazione fallita: ${describeError(e, 'it')}`)
      throw e
    }
  }

  /** Scarica tutto l'indice e tutti i contatori, poi sostituisce il catalogo in un colpo solo. */
  private async fullSync(): Promise<number> {
    const records: GbIndexRecord[] = []
    const firsts = await Promise.all(SUBMISSION_TYPES.map((t) => gameBanana.indexPage(t, 1)))
    const pagesPerType = firsts.map((p) => Math.ceil(p._aMetadata._nRecordCount / INDEX_PAGE_SIZE))
    this.progress = { phase: 'index', done: firsts.length, total: pagesPerType.reduce((a, b) => a + b, 0) }

    await Promise.all(
      SUBMISSION_TYPES.map(async (type, i) => {
        records.push(...firsts[i]._aRecords)
        const rest = Array.from({ length: pagesPerType[i] - 1 }, (_, p) => p + 2)
        await Promise.all(
          rest.map(async (page) => {
            records.push(...(await gameBanana.indexPage(type, page))._aRecords)
            this.progress!.done++
          })
        )
      })
    )

    const next = await this.withCounts(records)
    this.mods = new Map(next.map((m) => [m.id, m]))
    this.cursors = this.newestModified(records, { Mod: 0, Sound: 0 })
    return next.length
  }

  /**
   * Scarica le pagine dell'indice (dalla mod modificata più di recente) finché non arriva a mod
   * già sincronizzate, e aggiorna solo quelle.
   */
  private async incrementalSync(): Promise<number> {
    const records: GbIndexRecord[] = []
    for (const type of SUBMISSION_TYPES) {
      for (let page = 1; ; page++) {
        const { _aRecords, _aMetadata } = await gameBanana.indexPage(type, page)
        const fresh = _aRecords.filter((r) => r._tsDateModified > this.cursors[type])
        records.push(...fresh)
        if (fresh.length < _aRecords.length || _aMetadata._bIsComplete) break
      }
    }
    if (records.length === 0) return 0

    for (const mod of await this.withCounts(records)) this.mods.set(mod.id, mod)
    this.cursors = this.newestModified(records, this.cursors)
    return records.length
  }

  /** Converte i record nel tipo `Mod` aggiungendo download e "mi piace". */
  private async withCounts(records: GbIndexRecord[]): Promise<Mod[]> {
    const unique = [...new Map(records.map((r) => [modId(r._sModelName, r._idRow), r])).values()]
    this.progress = { phase: 'counts', done: 0, total: unique.length }
    const counts = await gameBanana.counts(unique.map((r) => ({ type: r._sModelName, id: r._idRow })))
    this.progress.done = unique.length
    return unique.map((r) => normalize(r, counts.get(modId(r._sModelName, r._idRow))))
  }

  private newestModified(
    records: GbIndexRecord[],
    start: Record<SubmissionType, number>
  ): Record<SubmissionType, number> {
    const cursors = { ...start }
    for (const r of records)
      cursors[r._sModelName] = Math.max(cursors[r._sModelName], r._tsDateModified)
    return cursors
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

    const filtered = [...this.mods.values()].filter((m) => {
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
      const cmp = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)
      return cmp * dir
    })

    const size = f.pageSize ?? 20
    const start = (Math.max(page, 1) - 1) * size
    return { total: filtered.length, mods: filtered.slice(start, start + size) }
  }

  /** Categorie distinte presenti nel catalogo, in ordine alfabetico. */
  public categories(): string[] {
    return [...new Set([...this.mods.values()].map((m) => m.category))].sort()
  }

  /**
   * @param language Language of the error message
   * @returns The status of the latest sync, with its progress while it is running
   */
  public status(language: Language = 'it'): Status {
    return {
      lastError: this.lastError === undefined ? undefined : describeError(this.lastError, language),
      lastUpdated: this.lastUpdated,
      total: this.mods.size,
      sync: this.progress && { ...this.progress }
    }
  }

  /** Stops the timer */
  public stop(): void {
    clearInterval(this.timer)
  }

  public getById(id: string): Mod | undefined {
    return this.mods.get(id)
  }
}
