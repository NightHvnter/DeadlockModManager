import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react'
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
import { useI18n } from '@/hooks/useI18n'
import { cn } from '@/lib/utils'
import Spinner from './Spinner'
import type { InstalledMod } from '../../../mission/types'

interface LoadOrderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Prefissi `pakNN` dei file di una mod, es. "pak01" o "pak03, pak04". */
const pakPrefixes = (mod: InstalledMod): string =>
  [...new Set(mod.files.map((f) => /^(pak\d{2})_/.exec(f)?.[1]).filter(Boolean))].join(', ')

/**
 * Modal per cambiare l'ordine di caricamento delle mod attive. In cima la mod con la priorità
 * più alta: se due mod contengono gli stessi file, il gioco usa quelli della più in alto.
 */
export default function LoadOrderDialog({
  open,
  onOpenChange
}: LoadOrderDialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-fit">
        {/* montato solo da aperto: a ogni apertura l'ordine viene riletto da zero */}
        {open && <LoadOrderEditor onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function LoadOrderEditor({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { t } = useI18n()
  const [mods, setMods] = useState<InstalledMod[] | null>(null)
  const [initialOrder, setInitialOrder] = useState<string[]>([])
  const [dragged, setDragged] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.api.getLoadOrder().then((order) => {
      setMods(order)
      setInitialOrder(order.map((m) => m.id))
    })
  }, [])

  const changed = !!mods && mods.some((m, i) => m.id !== initialOrder[i])

  /** Sposta la mod in posizione `from` alla posizione `to`. */
  function move(from: number, to: number): void {
    if (!mods || to < 0 || to >= mods.length || from === to) return
    const next = [...mods]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    setMods(next)
  }

  async function save(): Promise<void> {
    if (!mods) return
    setSaving(true)
    const result = await window.api.setLoadOrder(mods.map((m) => m.id))
    setSaving(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(t('loadOrder.saved'))
    onClose()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('loadOrder.title')}</DialogTitle>
        <DialogDescription>{t('loadOrder.description')}</DialogDescription>
      </DialogHeader>

      {!mods ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : mods.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground">{t('loadOrder.empty')}</p>
      ) : (
        <div className="space-y-2">
          <div className="flex justify-between px-1 text-xs text-muted-foreground">
            <span>{t('loadOrder.highest')}</span>
          </div>
          <ol className="max-h-[50vh] space-y-1.5 overflow-y-auto pr-1">
            {mods.map((mod, i) => (
              <li
                key={mod.id}
                draggable
                onDragStart={() => setDragged(i)}
                onDragEnd={() => setDragged(null)}
                onDragOver={(e) => {
                  e.preventDefault()
                  if (dragged !== null && dragged !== i) {
                    move(dragged, i)
                    setDragged(i)
                  }
                }}
                className={cn(
                  'flex cursor-grab items-center gap-3 rounded-lg border bg-card p-2 active:cursor-grabbing',
                  dragged === i && 'opacity-50'
                )}
              >
                <GripVertical className="size-4 shrink-0 text-muted-foreground" />
                <span className="w-6 shrink-0 text-right text-sm text-muted-foreground tabular-nums">
                  {i + 1}
                </span>
                {mod.image ? (
                  <img
                    src={mod.image}
                    alt=""
                    className="aspect-video w-14 shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="aspect-video w-14 shrink-0 rounded bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium" title={mod.name}>
                    {mod.name}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {mod.author} · {pakPrefixes(mod)}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('loadOrder.moveUp')}
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('loadOrder.moveDown')}
                    disabled={i === mods.length - 1}
                    onClick={() => move(i, i + 1)}
                  >
                    <ArrowDown />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
          <div className="px-1 text-xs text-muted-foreground">{t('loadOrder.lowest')}</div>
          <p className="text-xs text-muted-foreground">{t('loadOrder.disabledNote')}</p>
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {t('loadOrder.cancel')}
        </Button>
        <Button disabled={!changed || saving} onClick={save}>
          {saving ? t('mod.wait') : t('loadOrder.save')}
        </Button>
      </DialogFooter>
    </>
  )
}
