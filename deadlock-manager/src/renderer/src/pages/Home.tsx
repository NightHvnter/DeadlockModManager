import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import ModCard from '@/components/ModCard'
import ModDetailsDialog from '@/components/ModDetailsDialog'
import CatalogSyncBanner from '@/components/CatalogSyncBanner'
import { useI18n } from '@/hooks/useI18n'
import { useSettings } from '@/hooks/useSettings'
import type { MessageKey } from '../../../mission/i18n'
import { Hero, HEROES, type Mod, type ModFilters, type ModSortField } from '../../../mission/types'
import Spinner from '@renderer/components/Spinner'

const PAGE_SIZE = 20
/** Valore speciale per "nessun filtro" (le select non accettano la stringa vuota). */
const ALL = 'all'

/** Opzioni di ordinamento: il valore è "campo:direzione". */
const SORT_OPTIONS: { value: string; label: MessageKey }[] = [
  { value: 'downloadCount:desc', label: 'sort.downloads' },
  { value: 'likes:desc', label: 'sort.likes' },
  { value: 'remoteAddedAt:desc', label: 'sort.newest' },
  { value: 'remoteUpdatedAt:desc', label: 'sort.updated' },
  { value: 'name:asc', label: 'sort.nameAsc' },
  { value: 'name:desc', label: 'sort.nameDesc' }
]

/** Filtro per tipo di mod. */
const TYPE_OPTIONS: { value: string; label: MessageKey; filters: Partial<ModFilters> }[] = [
  { value: ALL, label: 'home.allTypes', filters: {} },
  { value: 'visual', label: 'home.typeVisual', filters: { isAudio: false, isMap: false } },
  { value: 'audio', label: 'home.typeAudio', filters: { isAudio: true } },
  { value: 'map', label: 'home.typeMap', filters: { isMap: true } }
]

/** Pagina con l'elenco delle mod, i filtri e la paginazione. */
export default function Home(): React.JSX.Element {
  const { settings } = useSettings()
  const { t, formatNumber } = useI18n()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState(ALL)
  const [hero, setHero] = useState(ALL)
  const [type, setType] = useState(ALL)
  const [sort, setSort] = useState(SORT_OPTIONS[0].value)
  const [page, setPage] = useState(1)

  const [mods, setMods] = useState<Mod[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState<string[]>([])
  const [selected, setSelected] = useState<Mod | null>(null)

  /** Cambia quando il processo main ha sostituito la lista delle mod con una nuova. */
  const [listVersion, setListVersion] = useState(0)
  /** `true` se la prossima ricerca è dovuta a un aggiornamento in background: niente spinner. */
  const silent = useRef(false)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const includeNSFW = settings?.includeNSFW ?? false

  useEffect(
    () =>
      window.api.onModsUpdated(() => {
        silent.current = true
        setListVersion((v) => v + 1)
      }),
    []
  )

  // Le categorie che coincidono con un eroe sono già coperte dal filtro per eroe
  useEffect(() => {
    window.api
      .getCategories()
      .then((all) => setCategories(all.filter((c) => !HEROES.includes(c as Hero))))
  }, [listVersion])

  // Ricerca, con una breve attesa mentre l'utente scrive
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      // dopo un aggiornamento in background i risultati vengono solo sostituiti
      if (!silent.current) setLoading(true)
      silent.current = false
      const [sortBy, sortOrder] = sort.split(':') as [ModSortField, 'asc' | 'desc']
      const filters: ModFilters = {
        search,
        pageSize: PAGE_SIZE,
        sortBy,
        sortOrder,
        includeNSFW,
        ...TYPE_OPTIONS.find((o) => o.value === type)?.filters,
        ...(category !== ALL && { category }),
        ...(hero !== ALL && { hero })
      }
      const result = await window.api.searchMods(filters, page)
      if (cancelled) return
      setLoading(false)
      if (result.ok) {
        setMods(result.data.mods)
        setTotal(result.data.total)
      } else {
        toast.error(result.error)
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [search, category, hero, type, sort, page, includeNSFW, listVersion])

  /** Cambia pagina tornando in cima all'elenco. */
  function goTo(p: number): void {
    setPage(p)
    window.scrollTo({ top: 0 })
  }

  /** Restituisce un gestore per una select che riporta anche alla prima pagina. */
  function onSelect(set: (v: string) => void) {
    return (v: string | null) => {
      if (!v) return
      set(v)
      setPage(1)
    }
  }

  return (
    <div className="space-y-4">
      <CatalogSyncBanner />
      <div className="flex gap-2 overflow-scroll">
        <Input
          className="max-w-sm"
          placeholder={t('home.search')}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
        />

        <Select value={category} onValueChange={onSelect(setCategory)}>
          <SelectTrigger className="w-52">
            <SelectValue>{category === ALL ? t('home.allCategories') : category}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('home.allCategories')}</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={hero} onValueChange={onSelect(setHero)}>
          <SelectTrigger className="w-44">
            <SelectValue>{hero === ALL ? t('home.allHeroes') : hero}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('home.allHeroes')}</SelectItem>
            {HEROES.map((h) => (
              <SelectItem key={h} value={h}>
                {h}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={type} onValueChange={onSelect(setType)}>
          <SelectTrigger className="w-36">
            <SelectValue>
              {t(TYPE_OPTIONS.find((o) => o.value === type)?.label ?? 'home.allTypes')}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {t(o.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={onSelect(setSort)}>
          <SelectTrigger className="w-52">
            <SelectValue>
              {t(SORT_OPTIONS.find((o) => o.value === sort)?.label ?? 'sort.downloads')}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {t(o.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
          <Spinner />
          <span>{t('home.loading')}</span>
        </div>
      ) : mods.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">{t('home.empty')}</div>
      ) : (
        <>
          <div className="text-sm text-muted-foreground">
            {t('home.found', { count: formatNumber(total) })}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {mods.map((mod) => (
              <ModCard key={mod.id} mod={mod} onOpen={() => setSelected(mod)} />
            ))}
          </div>

          <div className="flex items-center justify-center gap-4">
            <Button variant="outline" disabled={page <= 1} onClick={() => goTo(page - 1)}>
              {t('home.previous')}
            </Button>
            <span className="text-sm">{t('home.page', { page, total: totalPages })}</span>
            <Button variant="outline" disabled={page >= totalPages} onClick={() => goTo(page + 1)}>
              {t('home.next')}
            </Button>
          </div>
        </>
      )}

      <ModDetailsDialog mod={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
