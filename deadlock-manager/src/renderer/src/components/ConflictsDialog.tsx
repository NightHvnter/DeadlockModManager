import { useState } from 'react'
import { Check, ChevronRight, ListOrdered, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
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
import type { InstalledModInfo, ModConflict } from '../../../mission/types'

/** Etichetta di una mod per raggrupparla: eroe e categoria, come i tag della pagina Installate. */
const tagsOf = (mod: InstalledModInfo | undefined): string =>
  [mod?.hero, mod?.category].filter(Boolean).join(' · ')

/**
 * Elenco dei conflitti tra le mod attive, diviso in sezioni per tag (eroe e categoria della mod
 * che vince). Ogni riga dice quale mod vince, quale perde e quanti file hanno in comune, e si può
 * accettare: i conflitti accettati restano in fondo alla sezione e non vengono più segnalati.
 */
export default function ConflictsDialog({
  open,
  onOpenChange,
  conflicts,
  mods,
  onConflictsChange,
  onOpenLoadOrder
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  conflicts: ModConflict[]
  mods: InstalledModInfo[]
  /** Riceve i conflitti aggiornati dopo averne accettato o ripristinato qualcuno. */
  onConflictsChange: (conflicts: ModConflict[]) => void
  /** Chiude il modale e apre l'ordine di caricamento. */
  onOpenLoadOrder: () => void
}): React.JSX.Element {
  const { t } = useI18n()
  const byId = new Map(mods.map((m) => [m.id, m]))
  const nameOf = (id: string): string => byId.get(id)?.name ?? id
  const [saving, setSaving] = useState(false)
  const pending = conflicts.filter((c) => !c.accepted)

  async function accept(pairs: ModConflict[], accepted: boolean): Promise<void> {
    setSaving(true)
    const result = await window.api.acceptConflicts(
      pairs.map(({ winner, loser }) => ({ winner, loser })),
      accepted
    )
    setSaving(false)
    if (result.ok) onConflictsChange(result.data)
    else toast.error(result.error)
  }

  const sections = new Map<string, ModConflict[]>()
  for (const c of conflicts) {
    const tag = tagsOf(byId.get(c.winner)) || t('conflicts.untagged')
    sections.set(tag, [...(sections.get(tag) ?? []), c])
  }
  const sorted = [...sections]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tag, items]) => [tag, items.sort((a, b) => +a.accepted - +b.accepted)] as const)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('conflicts.title')}</DialogTitle>
          <DialogDescription>{t('conflicts.description')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {sorted.map(([tag, items]) => (
            <section key={tag} className="grid gap-2">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                {tag}
                <Badge variant="secondary">{items.filter((c) => !c.accepted).length}</Badge>
              </h3>
              {items.map((c) => {
                const loserTags = tagsOf(byId.get(c.loser))
                return (
                  <div
                    key={`${c.winner}-${c.loser}`}
                    className={`grid gap-1 rounded-lg border p-3 ${c.accepted ? 'opacity-60' : ''}`}
                  >
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium" title={t('conflicts.winner')}>
                        {nameOf(c.winner)}
                      </span>
                      <ChevronRight className="size-4 text-muted-foreground" />
                      <span className="text-muted-foreground line-through decoration-1">
                        {nameOf(c.loser)}
                      </span>
                      {loserTags && loserTags !== tag && (
                        <Badge variant="outline">{loserTags}</Badge>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {t('conflicts.files', { count: c.files })}
                      </span>
                      {c.accepted ? (
                        <>
                          <Badge variant="outline">{t('conflicts.accepted')}</Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={saving}
                            title={t('conflicts.unacceptHint')}
                            onClick={() => void accept([c], false)}
                          >
                            <Undo2 className="size-4" />
                            {t('conflicts.unaccept')}
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={saving}
                          title={t('conflicts.acceptHint')}
                          onClick={() => void accept([c], true)}
                        >
                          <Check className="size-4" />
                          {t('conflicts.accept')}
                        </Button>
                      )}
                    </div>
                    <ul className="text-xs text-muted-foreground" title={c.sample.join('\n')}>
                      {c.sample.slice(0, 3).map((f) => (
                        <li key={f} className="truncate font-mono">
                          {f}
                        </li>
                      ))}
                      {c.files > 3 && <li>{t('conflicts.more', { count: c.files - 3 })}</li>}
                    </ul>
                  </div>
                )
              })}
            </section>
          ))}
        </div>

        <DialogFooter>
          {pending.length > 1 && (
            <Button variant="outline" disabled={saving} onClick={() => void accept(pending, true)}>
              <Check className="size-4" />
              {t('conflicts.acceptAll')}
            </Button>
          )}
          <Button variant="outline" onClick={onOpenLoadOrder}>
            <ListOrdered className="size-4" />
            {t('installed.loadOrder')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
