import { useEffect, useState } from 'react'
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
import { Hero, HEROES, type Mod, type ModFilters, type ModSortField } from '../../../mission/types'
import Spinner from '@renderer/components/Spinner'

const PAGE_SIZE = 20
/** Valore speciale per "nessun filtro" (le select non accettano la stringa vuota). */
const ALL = 'all'

/** Opzioni di ordinamento: il valore è "campo:direzione". */
const SORT_OPTIONS = [
  { value: 'downloadCount:desc', label: 'Più scaricate' },
  { value: 'likes:desc', label: 'Più apprezzate' },
  { value: 'remoteAddedAt:desc', label: 'Più recenti' },
  { value: 'remoteUpdatedAt:desc', label: 'Aggiornate di recente' },
  { value: 'name:asc', label: 'Nome (A-Z)' },
  { value: 'name:desc', label: 'Nome (Z-A)' }
]

/** Pagina con l'elenco delle mod, i filtri e la paginazione. */
export default function Home(): React.JSX.Element {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState(ALL)
  const [hero, setHero] = useState(ALL)
  const [page, setPage] = useState(1)

  const [mods, setMods] = useState<Mod[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState<string[]>([])
  const [installedIds, setInstalledIds] = useState<string[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [sort, setSort] = useState(SORT_OPTIONS[0].value)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Dati iniziali: categorie e mod già installate
  useEffect(() => {
    window.api.getCategories().then(setCategories)
    window.api.getInstalledMods().then(setInstalledIds)
  }, [])

  // Ricerca, con una breve attesa mentre l'utente scrive
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      const [sortBy, sortOrder] = sort.split(':') as [ModSortField, 'asc' | 'desc']
      const filters: ModFilters = {
        search,
        pageSize: PAGE_SIZE,
        sortBy,
        sortOrder,
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
  }, [search, category, hero, sort, page])

  /** Installa la mod, oppure la disinstalla se è già installata. */
  async function toggleInstall(mod: Mod): Promise<void> {
    const installed = installedIds.includes(mod.id)
    setBusyId(mod.id)
    try {
      const result = installed
        ? await window.api.uninstallMod(mod.id)
        : await window.api.installMod(mod.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(installed ? 'Mod disinstallata' : 'Mod installata')
      setInstalledIds(await window.api.getInstalledMods())
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input
          className="max-w-sm"
          placeholder="Cerca una mod..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
        />

        <Select
          value={category}
          onValueChange={(v) => {
            if (!v) return
            setCategory(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-52">
            <SelectValue>{category === ALL ? 'Tutte le categorie' : category}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tutte le categorie</SelectItem>
            {categories.map((c) => {
              if(HEROES.includes(c as Hero)) return <></>

              return (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
              )
            })}
          </SelectContent>
        </Select>

        <Select
          value={hero}
          onValueChange={(v) => {
            if (!v) return
            setHero(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue>{hero === ALL ? 'Tutti gli eroi' : hero}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tutti gli eroi</SelectItem>
            {HEROES.map((h) => (
              <SelectItem key={h} value={h}>
                {h}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={sort}
          onValueChange={(v) => {
            if (!v) return
            setSort(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-52">
            <SelectValue>{SORT_OPTIONS.find((o) => o.value === sort)?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {
        loading ? (
          <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
            <Spinner />
            <span>Caricamento...</span>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {mods.map((mod) => (
                <ModCard
                  key={mod.id}
                  mod={mod}
                  installed={installedIds.includes(mod.id)}
                  busy={busyId === mod.id}
                  onToggle={() => toggleInstall(mod)}
                />
              ))}
            </div>

            <div className="flex items-center justify-center gap-4">
              <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Precedente
              </Button>
              <span className="text-sm">
                Pagina {page} di {totalPages}
              </span>
              <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Successiva
              </Button>
            </div>
          </>
        )
      }
    </div>
  )
}