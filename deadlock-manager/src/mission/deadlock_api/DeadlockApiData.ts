import { readFile, rename, writeFile } from "node:fs/promises";
import { ModFilters, ModSearchResult, type Mod, type Status } from "../types";

const BASE_URL = "https://api.deadlockmods.app/"
const MODS_URL = BASE_URL + "api/v2/mods"

/** Contenuto del file con la lista salvata. */
interface SavedList {
    etag?: string
    savedAt: string
    mods: Mod[]
}

/**
 * Call DeadlockApiData.create() to instance class
 */
export class DeadlockApiData {
    /**
     * Cached mods
     */
    private cache: Mod[] = []

    /**
     * Ref of timer, use stop() to stop it
     */
    private timer?: NodeJS.Timeout

    private lastUpdated?: Date
    private lastError?: string

    /** ETag dell'ultima lista scaricata: se non cambia l'API risponde 304 senza corpo. */
    private etag?: string

    /** Aggiornamento in corso, per non scaricare la lista due volte in parallelo. */
    private pending?: Promise<boolean>

    private constructor(
        /** File in cui salvare la lista; senza, la lista resta solo in memoria. */
        private readonly cachePath?: string,
        /** Chiamata quando la lista in memoria è stata sostituita da una nuova. */
        private readonly onUpdate?: () => void,
    ) {}

    /**
     * Crete an instance of the class.
     * If a list saved in `cachePath` exists it is used right away and the API is queried in
     * the background; otherwise the first download is awaited.
     * @param refreshMs
     * @param cachePath File where the list is saved between runs
     * @param onUpdate Called after a refresh replaced the list
     * @returns Class instance
     * @throws Error if there is no saved list and the API call fails
     */
    static async create(
        refreshMs = 60 * 60_000,
        cachePath?: string,
        onUpdate?: () => void,
    ): Promise<DeadlockApiData> {
        const instance = new DeadlockApiData(cachePath, onUpdate)
        if (await instance.loadFromDisk()) {
            instance.refresh().catch(() => {})
        } else {
            await instance.refresh()
        }
        instance.timer = setInterval(() => {
            instance.refresh().catch(() => {})
        }, refreshMs)
        return instance
    }

    /** Carica la lista salvata su disco. Restituisce `false` se manca o è illeggibile. */
    private async loadFromDisk(): Promise<boolean> {
        if (!this.cachePath) return false
        try {
            const saved: SavedList = JSON.parse(await readFile(this.cachePath, 'utf8'))
            if (!Array.isArray(saved.mods) || saved.mods.length === 0) return false
            this.cache = saved.mods
            this.etag = saved.etag
            this.lastUpdated = new Date(saved.savedAt)
            return true
        } catch {
            return false
        }
    }

    /** Salva la lista su disco passando da un file temporaneo, per non lasciarla a metà. */
    private async saveToDisk(): Promise<void> {
        if (!this.cachePath) return
        const saved: SavedList = {
            etag: this.etag,
            savedAt: (this.lastUpdated ?? new Date()).toISOString(),
            mods: this.cache,
        }
        const tmp = `${this.cachePath}.tmp`
        await writeFile(tmp, JSON.stringify(saved))
        await rename(tmp, this.cachePath)
    }

    /**
     * Asks the API for the mod list and replaces the cache only once the download is complete
     * @returns `true` if the list changed, `false` if it was already up to date
     * @throws Error if the API call fails (the error is also kept in `status()`)
     */
    public refresh(): Promise<boolean> {
        this.pending ??= this.doRefresh().finally(() => (this.pending = undefined))
        return this.pending
    }

    private async doRefresh(): Promise<boolean> {
        try {
            const res = await fetch(MODS_URL, {
                headers: this.etag ? { 'If-None-Match': this.etag } : {},
            })
            if (res.status === 304) {
                this.lastError = undefined
                this.lastUpdated = new Date()
                return false
            }
            if (!res.ok) throw new Error(`Impossibile scaricare le mod dall'API (${res.status})`)
            // la lista in memoria viene sostituita solo a download completato
            this.cache = await res.json()
            this.etag = res.headers.get('etag') ?? undefined
            this.lastError = undefined
            this.lastUpdated = new Date()
            await this.saveToDisk().catch(() => {})
            this.onUpdate?.()
            return true
        } catch (e) {
            this.lastError = e instanceof Error ? e.message : String(e)
            throw e
        }
    }

    /**
     *
     * @param page
     * @param options
     * @returns List of mods (paginated) with cache length
     */
    public pagination(page: number = 1, filters?: ModFilters): ModSearchResult {
        const f = { ...new ModFilters(), ...filters }
        const q = f.search?.trim().toLowerCase()
        const hero = f.hero?.toLowerCase()
        const tags = f.tags?.map((t) => t.toLowerCase())

        const filtered = this.cache.filter((m) => {
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
            ) return false
            return true
        })

        const dir = f.sortOrder === 'asc' ? 1 : -1
        const key = f.sortBy ?? 'likes'
        filtered.sort((a, b) => {
            const x = a[key]
            const y = b[key]
            const cmp = typeof x === 'string'
                ? x.localeCompare(y as string)
                : (x as number) - (y as number)
            return cmp * dir
        })

        const size = f.pageSize ?? 20
        const start = (Math.max(page, 1) - 1) * size
        return { total: filtered.length, mods: filtered.slice(start, start + size) }
    }

    /** Categorie distinte presenti nelle mod in cache, in ordine alfabetico. */
    public categories(): string[] {
        return [...new Set(this.cache.map((m) => m.category))].sort()
    }

    /**
     *
     * @returns The status of the latest refresh
     */
    status(): Status {
        return { lastError: this.lastError, lastUpdated: this.lastUpdated, total: this.cache.length }
    }

    /**
     * Stops the timer
     */
    stop(): void {
        clearInterval(this.timer);
    }

    public getById(id: string): Mod | undefined {
      return this.cache.find((m) => m.id === id)
    }

}
