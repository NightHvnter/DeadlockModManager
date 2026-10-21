import { AppError } from '../i18n'
import type { GbCounts, GbIndexPage, GbProfile, SubmissionType } from './types'

const API = 'https://gamebanana.com/apiv11/'
/** La chiamata multipla `Core/Item/Data` esiste solo sul vecchio host dell'API. */
const LEGACY_API = 'https://api.gamebanana.com/'
/** Id di Deadlock su GameBanana. */
export const DEADLOCK_GAME_ID = 20948
/** Elementi per pagina dell'indice (il massimo che usa anche l'app ufficiale). */
export const INDEX_PAGE_SIZE = 50
/** Id per richiesta di contatori: 50 funziona e resta sotto i 3.000 caratteri di URL. */
const COUNTS_BATCH_SIZE = 50
/** Richieste contemporanee verso GameBanana, per non sovraccaricarlo. */
const MAX_CONCURRENCY = 4
const MAX_ATTEMPTS = 4
const USER_AGENT = 'DeadlockModManager (+https://github.com/NightHvnter/DeadlockModManager)'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Limita il numero di funzioni asincrone in esecuzione contemporaneamente. */
class Limiter {
  private active = 0
  private waiting: (() => void)[] = []

  constructor(private readonly max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((r) => this.waiting.push(r))
    this.active++
    try {
      return await fn()
    } finally {
      this.active--
      this.waiting.shift()?.()
    }
  }
}

/** Client dell'API di GameBanana con limite di concorrenza e nuovi tentativi. */
export class GameBananaClient {
  private readonly limiter = new Limiter(MAX_CONCURRENCY)

  /** Richieste fatte da quando il client esiste, utile per capire quanto pesa una sincronizzazione. */
  public requests = 0

  /**
   * GET di un JSON. Ritenta gli errori di rete, 429 e 5xx con attese crescenti
   * (rispettando `Retry-After` se presente).
   */
  private get<T>(url: string): Promise<T> {
    return this.limiter.run(async () => {
      for (let attempt = 1; ; attempt++) {
        this.requests++
        let status = 0
        try {
          const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
          status = res.status
          if (res.ok) return (await res.json()) as T
          if (status !== 429 && status < 500) throw new AppError('error.api', { status })
        } catch (e) {
          if (e instanceof AppError || attempt >= MAX_ATTEMPTS) throw e
        }
        if (attempt >= MAX_ATTEMPTS) throw new AppError('error.api', { status })
        await sleep(500 * 2 ** (attempt - 1))
      }
    })
  }

  /** Pagina dell'indice delle mod di Deadlock, dalla modificata più di recente. */
  indexPage(type: SubmissionType, page: number): Promise<GbIndexPage> {
    const params = new URLSearchParams({
      _nPerpage: String(INDEX_PAGE_SIZE),
      '_aFilters[Generic_Game]': String(DEADLOCK_GAME_ID),
      _nPage: String(page),
      _sSort: 'Generic_LatestModified'
    })
    return this.get(`${API}${type}/Index?${params}`)
  }

  /** Dettagli completi di una mod: descrizione, file, contatori. */
  profile(type: SubmissionType, id: number): Promise<GbProfile> {
    return this.get(`${API}${type}/${id}/ProfilePage`)
  }

  /** Download e "mi piace" di molte mod, a gruppi di `COUNTS_BATCH_SIZE` per richiesta. */
  async counts(items: { type: SubmissionType; id: number }[]): Promise<Map<string, GbCounts>> {
    const result = new Map<string, GbCounts>()
    const batches: (typeof items)[] = []
    for (let i = 0; i < items.length; i += COUNTS_BATCH_SIZE)
      batches.push(items.slice(i, i + COUNTS_BATCH_SIZE))

    await Promise.all(
      batches.map(async (batch) => {
        const query = batch
          .map(
            ({ type, id }) =>
              `itemtype[]=${type}&itemid[]=${id}&fields[]=downloads,likes`
          )
          .join('&')
        // la risposta è un array nello stesso ordine della richiesta: [[downloads, likes], ...]
        const rows = await this.get<[number, number][]>(`${LEGACY_API}Core/Item/Data?${query}`)
        batch.forEach(({ type, id }, i) => {
          const row = rows[i]
          if (Array.isArray(row))
            result.set(`${type}-${id}`, { downloads: Number(row[0]) || 0, likes: Number(row[1]) || 0 })
        })
      })
    )
    return result
  }
}

/** Client condiviso da catalogo e installazione, così il limite di concorrenza vale per tutti. */
export const gameBanana = new GameBananaClient()
