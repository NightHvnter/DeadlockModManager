import { ModFilters, ModSearchResult, type Mod, type Status } from "../types";

const BASE_URL = "https://api.deadlockmods.app/"
const MODS_URL = BASE_URL + "api/v2/mods"

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
    private lastError?: Error

    /**
     * Crete an instance of the class
     * @param refreshMs 
     * @returns Class instance
     * @throws Error if the API call fails
     */
    static async create(refreshMs = 60_000): Promise<DeadlockApiData> {
        const instance = new DeadlockApiData()
        await instance.refresh()
        instance.timer = setInterval(() => {
            instance.refresh().catch((e) => { instance.lastError = e })
        }, refreshMs)
        return instance
    }

    /**
     * Refreshes the mod list every 10 minutes
     */
    private async refresh() {
        const res = await fetch(MODS_URL)
        if (!res.ok) throw new Error("Error: unable to request mods from api")
        this.cache = await res.json()
        this.lastError = undefined
        this.lastUpdated = new Date()
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
            if (f.onlyDownloadable && !m.downloadable) return false
            if (f.category && m.category !== f.category) return false
            if (hero && m.hero?.toLowerCase() !== hero) return false
            if (f.isAudio !== undefined && m.isAudio !== f.isAudio) return false
            if (f.isMap !== undefined && m.isMap !== f.isMap) return false
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
    stop() {
        clearInterval(this.timer);
    }

    public getById(id: string): Mod | undefined {
      return this.cache.find((m) => m.id === id)
    }

}