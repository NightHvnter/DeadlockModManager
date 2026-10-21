import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { FolderOpen } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import Spinner from '@/components/Spinner'
import { useModActions } from '@/hooks/useModActions'
import type { InstalledModInfo } from '../../../mission/types'

/** Pagina con le mod installate: attivazione, aggiornamento e disinstallazione. */
export default function Installed(): React.JSX.Element {
  const { version, isBusy, progress, uninstall, update, setEnabled } = useModActions()
  const [mods, setMods] = useState<InstalledModInfo[] | null>(null)
  const [search, setSearch] = useState('')

  // ricarica l'elenco a ogni installazione, disinstallazione o cambio di stato
  useEffect(() => {
    window.api.getInstalledModsInfo().then(setMods)
  }, [version])

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
  const visible = mods.filter(
    (m) => !q || m.name.toLowerCase().includes(q) || m.author.toLowerCase().includes(q)
  )
  const updates = mods.filter((m) => m.updateAvailable).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="max-w-sm"
          placeholder="Cerca tra le installate..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="text-sm text-muted-foreground">
          {mods.length} installate
          {updates > 0 && `, ${updates} da aggiornare`}
        </span>
        <Button variant="outline" size="sm" className="ml-auto" onClick={openAddons}>
          <FolderOpen className="size-4" />
          Apri cartella addons
        </Button>
      </div>

      {mods.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 text-muted-foreground">
          <span>Non hai ancora installato nessuna mod.</span>
          <Link to="/" className={buttonVariants({ variant: 'outline' })}>
            Sfoglia le mod
          </Link>
        </div>
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
                    className="aspect-video w-28 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <div className="aspect-video w-28 shrink-0 rounded-md bg-muted" />
                )}

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="truncate font-medium" title={mod.name}>
                    {mod.name}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {mod.author}
                    {mod.installedAt &&
                      ` · installata il ${new Date(mod.installedAt).toLocaleDateString()}`}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {mod.category && <Badge variant="secondary">{mod.category}</Badge>}
                    {mod.hero && <Badge variant="outline">{mod.hero}</Badge>}
                    {!mod.enabled && <Badge variant="outline">Disattivata</Badge>}
                    {mod.updateAvailable && <Badge>Aggiornamento disponibile</Badge>}
                    {!mod.available && (
                      <Badge variant="destructive">Non più disponibile</Badge>
                    )}
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={mod.enabled}
                    disabled={busy}
                    onCheckedChange={(checked) => setEnabled(mod.id, checked === true)}
                  />
                  Attiva
                </label>

                {mod.updateAvailable && (
                  <Button size="sm" disabled={busy} onClick={() => update(mod.id)}>
                    {busy && p !== undefined ? `${Math.round(p * 100)}%` : 'Aggiorna'}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => uninstall(mod.id)}
                >
                  {busy ? 'Attendi...' : 'Disinstalla'}
                </Button>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
