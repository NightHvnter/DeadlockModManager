import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/hooks/useI18n'
import { useModActions } from '@/hooks/useModActions'
import { useSettings } from '@/hooks/useSettings'
import { cn } from '@/lib/utils'
import Spinner from './Spinner'
import type { InstalledMod, Mod } from '../../../mission/types'

interface LinkModDialogProps {
  /** Mod esterna da collegare; `null` per chiudere il modal. */
  mod: InstalledMod | null
  onOpenChange: (open: boolean) => void
}

/**
 * Modal per collegare una mod esterna (trovata in `addons`) alla sua mod su GameBanana, cercata
 * nel catalogo: da quel momento ne prende nome, autore e immagine e ne segue gli aggiornamenti.
 */
export default function LinkModDialog({
  mod,
  onOpenChange
}: LinkModDialogProps): React.JSX.Element {
  return (
    <Dialog open={!!mod} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {/* montato solo da aperto: a ogni apertura la ricerca riparte da zero */}
        {mod && <LinkModPicker mod={mod} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function LinkModPicker({
  mod,
  onClose
}: {
  mod: InstalledMod
  onClose: () => void
}): React.JSX.Element {
  const { t } = useI18n()
  const { settings } = useSettings()
  const { link, isBusy } = useModActions()
  const [search, setSearch] = useState(mod.hero ?? '')
  const [results, setResults] = useState<Mod[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      const result = await window.api.searchMods({
        search: search.trim() || undefined,
        includeNSFW: settings?.includeNSFW ?? false,
        onlyDownloadable: false,
        sortBy: 'downloadCount',
        sortOrder: 'desc',
        pageSize: 30
      })
      if (cancelled) return
      if (result.ok) setResults(result.data.mods)
      else toast.error(result.error)
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [search, settings?.includeNSFW])

  async function confirm(): Promise<void> {
    if (selected && (await link(mod.id, selected))) onClose()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('link.title')}</DialogTitle>
        <DialogDescription>{t('link.description', { name: mod.name })}</DialogDescription>
      </DialogHeader>

      <Input
        autoFocus
        placeholder={t('link.search')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {!results ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : results.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground">{t('link.empty')}</p>
      ) : (
        <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto pr-1">
          {results.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setSelected(m.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border bg-card p-2 text-left hover:bg-accent',
                  selected === m.id && 'border-primary ring-1 ring-primary'
                )}
              >
                {(m.thumbnailUrl ?? m.images[0]) ? (
                  <img
                    src={m.thumbnailUrl ?? m.images[0]}
                    alt=""
                    loading="lazy"
                    className="aspect-video w-16 shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="aspect-video w-16 shrink-0 rounded bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium" title={m.name}>
                    {m.name}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[m.author, m.category, m.hero].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {t('loadOrder.cancel')}
        </Button>
        <Button disabled={!selected || isBusy(mod.id)} onClick={confirm}>
          {isBusy(mod.id) ? t('mod.wait') : t('link.confirm')}
        </Button>
      </DialogFooter>
    </>
  )
}
