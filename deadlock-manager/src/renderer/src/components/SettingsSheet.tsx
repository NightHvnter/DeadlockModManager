import { useEffect, useState } from 'react'
import { FolderOpen, RefreshCw, Search, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { useSettings } from '@/hooks/useSettings'
import { useTheme, THEMES, THEME_IDS, type Theme } from './providers/ThemeProvider'
import type { Status } from '../../../mission/types'

/** Pulsante impostazioni che apre un pannello laterale da destra. */
export default function SettingsSheet(): React.JSX.Element {
  const { theme, setTheme } = useTheme()
  const { settings, update, detectGamePath, browseGamePath, sheetOpen, setSheetOpen } =
    useSettings()
  const [status, setStatus] = useState<Status | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (sheetOpen) window.api.getModsStatus().then(setStatus)
  }, [sheetOpen])

  async function refresh(): Promise<void> {
    setRefreshing(true)
    const result = await window.api.refreshMods()
    setRefreshing(false)
    if (result.ok) toast.success('Elenco delle mod aggiornato')
    else toast.error(result.error)
    setStatus(await window.api.getModsStatus())
  }

  async function openAddons(): Promise<void> {
    const result = await window.api.openAddonsFolder()
    if (!result.ok) toast.error(result.error)
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="ml-auto"
        title="Impostazioni"
        onClick={() => setSheetOpen(true)}
      >
        <Settings className="size-4" />
      </Button>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Impostazioni</SheetTitle>
            <SheetDescription>Personalizza le impostazioni dell&apos;applicazione</SheetDescription>
          </SheetHeader>

          <div className="grid gap-6 px-4 pb-4">
            <section className="grid gap-2">
              <Label>Cartella di Deadlock</Label>
              <Input
                readOnly
                value={settings?.gamePath ?? ''}
                placeholder="Non impostata"
                title={settings?.gamePath ?? undefined}
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={browseGamePath}>
                  <FolderOpen className="size-4" />
                  Sfoglia
                </Button>
                <Button variant="outline" size="sm" onClick={detectGamePath}>
                  <Search className="size-4" />
                  Rileva
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!settings?.gamePath}
                  onClick={openAddons}
                >
                  Apri addons
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                La cartella che contiene <code>game/citadel</code>, di solito
                <code> steamapps/common/Deadlock</code>.
              </p>
            </section>

            <section className="grid gap-2">
              <Label>Tema</Label>
              <Select value={theme} onValueChange={(v) => v && setTheme(v as Theme)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{THEMES[theme].label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {THEME_IDS.map((id) => (
                    <SelectItem key={id} value={id}>
                      {THEMES[id].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>

            <section className="grid gap-2">
              <Label className="flex items-center gap-2">
                <Checkbox
                  checked={settings?.includeNSFW ?? false}
                  onCheckedChange={(checked) => update({ includeNSFW: checked === true })}
                />
                Mostra le mod NSFW
              </Label>
            </section>

            <section className="grid gap-2">
              <Label>Elenco delle mod</Label>
              <p className="text-sm text-muted-foreground">
                {status?.total ?? 0} mod
                {status?.lastUpdated &&
                  `, aggiornato alle ${new Date(status.lastUpdated).toLocaleTimeString()}`}
              </p>
              {status?.lastError && (
                <p className="text-sm text-destructive">{status.lastError}</p>
              )}
              <Button variant="outline" size="sm" disabled={refreshing} onClick={refresh}>
                <RefreshCw className={refreshing ? 'size-4 animate-spin' : 'size-4'} />
                Aggiorna ora
              </Button>
            </section>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
