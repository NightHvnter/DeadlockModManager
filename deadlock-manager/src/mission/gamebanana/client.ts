import { AppError } from '../i18n'
import type {
  GbDownloadPage,
  GbHydration,
  GbIndexPage,
  GbUpdatesPage,
  SubmissionType
} from './types'

/*
 * Endpoint e limiti sono gli stessi dell'app ufficiale (deadlock-mod-manager, file
 * `providers/gamebanana/client.rs` e `transport.rs`), così il carico su GameBanana è quello
 * che hanno già concordato in pratica.
 */

const API = 'https://gamebanana.com/apiv11/'
/** La chiamata multipla `Core/Item/Data` esiste solo sul vecchio host dell'API. */
const LEGACY_API = 'https://api.gamebanana.com/'
/** Id di Deadlock su GameBanana. */
export const DEADLOCK_GAME_ID = 20948
/** Elementi per pagina dell'indice. */
export const INDEX_PAGE_SIZE = 50
/** Ultima pagina dell'indice che l'app ufficiale accetta di chiedere. */
const MAX_INDEX_PAGE = 250
/**
 * Mod per richiesta di idratazione: ogni elemento ripete tutti i campi, e con 50 l'URL
 * diventa troppo lungo (GameBanana risponde 414).
 */
export const HYDRATION_BATCH_SIZE = 40
const HYDRATION_FIELDS = [
  'name',
  'downloads',
  'Category().name',
  'RootCategory().name',
  'description',
  'text',
  'Files().aFiles()'
].join(',')
const UPDATES_PAGE_SIZE = 20

const MAX_CONCURRENCY = 4
const MAX_REQUESTS_PER_SECOND = 10
const MAX_RETRIES = 3
const BASE_RETRY_DELAY_MS = 500
/** Se GameBanana chiede di aspettare più di così, ci si ferma e si riprova alla prossima sincronizzazione. */
const MAX_RETRY_DELAY_MS = 30_000
const REQUEST_TIMEOUT_MS = 30_000
const USER_AGENT = 'DeadlockModManager (+https://github.com/NightHvnter/DeadlockModManager)'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Al massimo `MAX_CONCURRENCY` richieste insieme e `MAX_REQUESTS_PER_SECOND` al secondo. */
class RateLimiter {
  private active = 0
  private waiting: (() => void)[] = []
  /** Istanti di partenza delle richieste dell'ultimo secondo. */
  private starts: number[] = []

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= MAX_CONCURRENCY) await new Promise<void>((r) => this.waiting.push(r))
    this.active++
    try {
      await this.waitForWindow()
      return await fn()
    } finally {
      this.active--
      this.waiting.shift()?.()
    }
  }

  private async waitForWindow(): Promise<void> {
    for (;;) {
      const now = Date.now()
      this.starts = this.starts.filter((t) => now - t < 1000)
      if (this.starts.length < MAX_REQUESTS_PER_SECOND) {
        this.starts.push(now)
        return
      }
      await sleep(1000 - (now - this.starts[0]))
    }
  }
}

/** Attesa richiesta da `Retry-After`, in secondi o come data HTTP. */
function retryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return seconds * 1000
  const date = Date.parse(header)
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now())
}

/** `Files().aFiles()` è un oggetto con i file indicizzati per id; serve la data del più recente. */
function latestFileDate(files: unknown): number | null {
  if (!files || typeof files !== 'object') return null
  const dates = Object.values(files as Record<string, { _tsDateAdded?: number }>)
    .map((f) => f?._tsDateAdded ?? 0)
    .filter((d) => d > 0)
  return dates.length ? Math.max(...dates) : null
}

/** Client dell'API di GameBanana con limiti di velocità e nuovi tentativi. */
export class GameBananaClient {
  private readonly limiter = new RateLimiter()

  /** Richieste fatte da quando il client esiste, utile per capire quanto pesa una sincronizzazione. */
  public requests = 0

  /**
   * GET di un JSON. Ritenta errori di rete, timeout, 429 e 5xx con attese crescenti,
   * rispettando `Retry-After`. Ritenta anche le risposte 200 con un corpo che non è JSON: capita
   * che Cloudflare tenga in cache una risposta vuota, quindi i tentativi successivi aggirano la
   * cache con un parametro in più.
   */
  private get<T>(url: string): Promise<T> {
    return this.limiter.run(async () => {
      let bustCache = false
      for (let attempt = 0; ; attempt++) {
        this.requests++
        let delay = Math.min(BASE_RETRY_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS)
        let status = 0
        try {
          const target = new URL(url)
          if (bustCache) target.searchParams.set('_nocache', String(Date.now()))
          const res = await fetch(target, {
            headers: { 'User-Agent': USER_AGENT },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
          })
          status = res.status
          if (res.ok) {
            try {
              return (await res.json()) as T
            } catch {
              // corpo vuoto o troncato: per l'utente è una risposta non valida, non un 200
              status = 502
              bustCache = true
              throw new Error('invalid JSON body')
            }
          }
          if (status !== 429 && status < 500) throw new AppError('error.api', { status })
          delay = retryAfterMs(res.headers.get('retry-after')) ?? delay
        } catch (e) {
          if (e instanceof AppError) throw e
        }
        if (attempt >= MAX_RETRIES || delay > MAX_RETRY_DELAY_MS)
          throw new AppError('error.api', { status })
        await sleep(delay)
      }
    })
  }

  /**
   * Pagina dell'indice delle mod di Deadlock. La sincronizzazione completa usa l'ordine dalla
   * più vecchia (`latestModified = false`): le nuove mod si aggiungono in fondo e le pagine non
   * scorrono durante la lettura. Quella incrementale parte dalla modificata più di recente.
   */
  async indexPage(
    type: SubmissionType,
    page: number,
    latestModified: boolean
  ): Promise<GbIndexPage> {
    if (page < 1 || page > MAX_INDEX_PAGE) throw new AppError('error.api', { status: 400 })
    const params = new URLSearchParams({
      _nPerpage: String(INDEX_PAGE_SIZE),
      '_aFilters[Generic_Game]': String(DEADLOCK_GAME_ID),
      _nPage: String(page),
      _sSort: latestModified ? 'Generic_LatestModified' : 'Generic_Oldest'
    })
    return this.get(`${API}${type}/Index?${params}`)
  }

  /**
   * Download, categorie, descrizione e data dei file di al massimo `HYDRATION_BATCH_SIZE` mod
   * dello stesso tipo, con una sola richiesta. Per le mod che non esistono più restituisce `null`.
   */
  async hydrate(type: SubmissionType, ids: number[]): Promise<(GbHydration | null)[]> {
    if (ids.length === 0) return []
    if (ids.length > HYDRATION_BATCH_SIZE) throw new AppError('error.api', { status: 414 })
    const params = new URLSearchParams()
    for (const id of ids) {
      params.append('itemtype[]', type)
      params.append('itemid[]', String(id))
      params.append('fields[]', HYDRATION_FIELDS)
    }
    // risposta: un array per mod, con i campi nell'ordine richiesto
    const rows = await this.get<unknown>(`${LEGACY_API}Core/Item/Data?${params}`)
    if (!Array.isArray(rows) || rows.length !== ids.length)
      throw new AppError('error.api', { status: 502 })
    return rows.map((row) => {
      if (!Array.isArray(row) || typeof row[0] !== 'string') return null
      return {
        name: row[0],
        downloads: Number(row[1]) || 0,
        category: typeof row[2] === 'string' ? row[2] : '',
        rootCategory: typeof row[3] === 'string' ? row[3] : '',
        description: typeof row[4] === 'string' ? row[4] : '',
        text: typeof row[5] === 'string' ? row[5] : '',
        filesUpdatedAt: latestFileDate(row[6])
      }
    })
  }

  /** File scaricabili di una mod. */
  downloadPage(type: SubmissionType, id: number): Promise<GbDownloadPage> {
    return this.get(`${API}${type}/${id}/DownloadPage`)
  }

  /** Pagina del changelog di una mod, dalla voce più recente. */
  updates(type: SubmissionType, id: number, page: number): Promise<GbUpdatesPage> {
    const params = new URLSearchParams({
      _nPage: String(page),
      _nPerpage: String(UPDATES_PAGE_SIZE)
    })
    return this.get(`${API}${type}/${id}/Updates?${params}`)
  }
}

/** Client condiviso da catalogo e installazione, così i limiti valgono per tutte le richieste. */
export const gameBanana = new GameBananaClient()
