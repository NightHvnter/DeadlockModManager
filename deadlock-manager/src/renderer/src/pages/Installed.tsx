import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { FileUp, FolderOpen, Link2, ListOrdered, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import Spinner from '@/components/Spinner'
import LoadOrderDialog from '@/components/LoadOrderDialog'
import LinkModDialog from '@/components/LinkModDialog'
import ConflictsDialog from '@/components/ConflictsDialog'
import { useI18n } from '@/hooks/useI18n'
import { useModActions } from '@/hooks/useModActions'
import { useLocalInstall } from '@/hooks/useLocalInstall'
import type { InstalledModInfo, ModConflict } from '../../../mission/types'

/** Stati per cui si possono filtrare le mod; il nome di ognuno è alla chiave `installed.show.<id>`. */
const STATE_FILTERS = ['all', 'enabled', 'disabled', 'conflicts'] as const
type StateFilter = (typeof STATE_FILTERS)[number]

/** Pagina con le mod installate: attivazione, aggiornamento e disinstallazione. */
export default function Installed(): React.JSX.Element {
  const { version, isBusy, progress, uninstall, update, setEnabled } = useModActions()
  const [mods, setMods] = useState<InstalledModInfo[] | null>(null)
  const [search, setSearch] = useState('')
  const [stateFilter, setStateFilter] = useState<StateFilter>('all')
  const { t, formatDate } = useI18n()
  const [loadOrderOpen, setLoadOrderOpen] = useState(false)
  const [linking, setLinking] = useState<InstalledModInfo | null>(null)
  const [conflicts, setConflicts] = useState<ModConflict[]>([])
  const [conflictsOpen, setConflictsOpen] = useState(false)
  const localInstall = useLocalInstall()

  /** Rilegge i conflitti tra le mod attive; un errore lascia semplicemente l'elenco vuoto. */
  const loadConflicts = (): void =>
    void window.api.getConflicts().then((r) => setConflicts(r.ok ? r.data : []))

  // ricarica l'elenco a ogni installazione, disinstallazione o cambio di stato
  useEffect(() => {
    window.api.getInstalledModsInfo().then(setMods)
    loadConflicts()
  }, [version])

  // e quando arriva una lista nuova dall'API, che può segnalare aggiornamenti
  useEffect(
    () =>
      window.api.onModsUpdated(() => {
        window.api.getInstalledModsInfo().then(setMods)
        loadConflicts()
      }),
    []
  )

  // l'ordine di caricamento decide quale mod vince: dopo averlo cambiato i conflitti si rileggono
  function changeLoadOrderOpen(open: boolean): void {
    setLoadOrderOpen(open)
    if (!open) loadConflicts()
  }

  async function openAddons(): Promise<void> {
    const result = await window.api.openAddonsFolder()
    if (!result.ok) toast.error(result.error)
  }

  if (!mods) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  const q = search.trim().toLowerCase()
  const inConflict = new Set(conflicts.flatMap((c) => [c.winner, c.loser]))
  const counts: Record<StateFilter, number> = {
    all: mods.length,
    enabled: mods.filter((m) => m.enabled).length,
    disabled: mods.filter((m) => !m.enabled).length,
    conflicts: inConflict.size
  }
  const matchesState = (m: InstalledModInfo): boolean =>
    stateFilter === 'all'
      ? true
      : stateFilter === 'conflicts'
        ? inConflict.has(m.id)
        : m.enabled === (stateFilter === 'enabled')
  const visible = mods.filter(
    (m) =>
      matchesState(m) &&
      (!q || m.name.toLowerCase().includes(q) || m.author.toLowerCase().includes(q))
  )
  const updates = mods.filter((m) => m.updateAvailable).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="max-w-sm"
          placeholder={t('installed.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={stateFilter} onValueChange={(v) => v && setStateFilter(v as StateFilter)}>
          <SelectTrigger className="w-44" aria-label={t('installed.show')}>
            <SelectValue>
              {t(`installed.show.${stateFilter}`)} ({counts[stateFilter]})
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {STATE_FILTERS.map((id) => (
              <SelectItem key={id} value={id}>
                {t(`installed.show.${id}`)} ({counts[id]})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {t('installed.count', { count: mods.length })}
          {updates > 0 && t('installed.toUpdate', { count: updates })}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          title={t('loadOrder.tooltip')}
          disabled={mods.filter((m) => m.enabled).length < 2}
          onClick={() => setLoadOrderOpen(true)}
        >
          <ListOrdered className="size-4" />
          {t('installed.loadOrder')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          title={t('local.tooltip')}
          disabled={localInstall.installing}
          onClick={() => localInstall.install()}
        >
          <FileUp className="size-4" />
          {t('local.button')}
        </Button>
        <Button variant="outline" size="sm" onClick={openAddons}>
          <FolderOpen className="size-4" />
          {t('installed.openAddons')}
        </Button>
      </div>

      <LoadOrderDialog open={loadOrderOpen} onOpenChange={changeLoadOrderOpen} />
      <ConflictsDialog
        open={conflictsOpen}
        onOpenChange={setConflictsOpen}
        conflicts={conflicts}
        mods={mods}
        onOpenLoadOrder={() => {
          setConflictsOpen(false)
          setLoadOrderOpen(true)
        }}
      />

      {conflicts.length > 0 && (
        <Card className="flex-row flex-wrap items-center gap-3 p-3 text-sm">
          <TriangleAlert className="size-4 shrink-0 text-destructive" />
          <span className="min-w-0 flex-1">
            {t('conflicts.summary', { count: conflicts.length })}
          </span>
          <Button variant="outline" size="sm" onClick={() => setConflictsOpen(true)}>
            {t('conflicts.show')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setLoadOrderOpen(true)}>
            <ListOrdered className="size-4" />
            {t('installed.loadOrder')}
          </Button>
        </Card>
      )}
      <LinkModDialog mod={linking} onOpenChange={(open) => !open && setLinking(null)} />

      {mods.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 text-muted-foreground">
          <span>{t('installed.empty')}</span>
          <Link to="/" className={buttonVariants({ variant: 'outline' })}>
            {t('installed.browse')}
          </Link>
        </div>
      ) : visible.length === 0 ? (
        <p className="py-20 text-center text-muted-foreground">{t('installed.noMatch')}</p>
      ) : (
        <div className="grid gap-2">
          {visible.map((mod) => {
            const busy = isBusy(mod.id)
            const p = progress(mod.id)
            return (
              <Card key={mod.id} className="flex-row items-center gap-4 p-3">
                {mod.image ? (
                  <img
                    src={mod.image}
                    alt=""
                    loading="lazy"
                    className={
                      mod.enabled
                        ? 'aspect-video w-28 shrink-0 rounded-md object-cover'
                        : 'aspect-video w-28 shrink-0 rounded-md object-cover grayscale-100'
                    }
                  />
                ) : (
                  <div className="aspect-video w-28 shrink-0 rounded-md bg-muted" />
                )}

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="truncate font-medium" title={mod.name}>
                    {mod.name}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {mod.external ? mod.files.join(', ') : mod.author}
                    {mod.installedAt &&
                      ` · ${t('installed.installedOn', { date: formatDate(mod.installedAt) })}`}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {mod.external && (
                      <Badge variant="secondary" title={t('installed.externalTooltip')}>
                        {t('installed.external')}
                      </Badge>
                    )}
                    {mod.category && <Badge variant="secondary">{mod.category}</Badge>}
                    {mod.hero && <Badge variant="outline">{mod.hero}</Badge>}
                    {!mod.enabled && <Badge variant="outline">{t('installed.disabled')}</Badge>}
                    {mod.updateAvailable && <Badge>{t('installed.updateAvailable')}</Badge>}
                    {!mod.available && (
                      <Badge variant="destructive">{t('installed.unavailable')}</Badge>
                    )}
                    {inConflict.has(mod.id) && (
                      <button
                        type="button"
                        title={t('conflicts.badgeTooltip')}
                        onClick={() => setConflictsOpen(true)}
                      >
                        <Badge
                          variant={
                            conflicts.some((c) => c.loser === mod.id) ? 'destructive' : 'secondary'
                          }
                        >
                          <TriangleAlert className="size-3" />
                          {t('conflicts.badge')}
                        </Badge>
                      </button>
                    )}
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={mod.enabled}
                    disabled={busy}
                    onCheckedChange={(checked) => setEnabled(mod.id, checked === true)}
                  />
                  {t('installed.enabled')}
                </label>

                {mod.external && (
                  <Button
                    size="sm"
                    variant="outline"
                    title={t('link.tooltip')}
                    disabled={busy}
                    onClick={() => setLinking(mod)}
                  >
                    <Link2 className="size-4" />
                    {t('link.button')}
                  </Button>
                )}
                {mod.updateAvailable && (
                  <Button size="sm" disabled={busy} onClick={() => update(mod.id)}>
                    {busy && p !== undefined ? `${Math.round(p * 100)}%` : t('installed.update')}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => uninstall(mod.id)}
                >
                  {t(busy ? 'mod.wait' : 'mod.uninstall')}
                </Button>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
