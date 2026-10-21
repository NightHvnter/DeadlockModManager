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
import { useI18n } from '@/hooks/useI18n'
import { useSettings } from '@/hooks/useSettings'
import { useTheme, THEME_IDS, type Theme } from './providers/ThemeProvider'
import { LANGUAGE_IDS, LANGUAGES, type Language } from '../../../mission/i18n'
import type { Status } from '../../../mission/types'

/** Valore della select per "usa la lingua del sistema" (le select non accettano `null`). */
const SYSTEM_LANGUAGE = 'system'

/** Pulsante impostazioni che apre un pannello laterale da destra. */
export default function SettingsSheet(): React.JSX.Element {
  const { theme, setTheme } = useTheme()
  const { settings, update, detectGamePath, browseGamePath, sheetOpen, setSheetOpen } =
    useSettings()
  const { t, formatNumber, formatTime } = useI18n()
  const [status, setStatus] = useState<Status | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const languageValue = settings?.language ?? SYSTEM_LANGUAGE

  useEffect(() => {
    if (sheetOpen) window.api.getModsStatus().then(setStatus)
  }, [sheetOpen])

  async function refresh(): Promise<void> {
    setRefreshing(true)
    const result = await window.api.refreshMods()
    setRefreshing(false)
    if (result.ok)
      toast.success(t(result.data ? 'settings.listUpdated' : 'settings.listAlreadyUpdated'))
    else toast.error(result.error)
    setStatus(await window.api.getModsStatus())
  }

  async function openAddons(): Promise<void> {
    const result = await window.api.openAddonsFolder()
    if (!result.ok) toast.error(result.error)
  }

  async function changeLanguage(value: string): Promise<void> {
    await update({ language: value === SYSTEM_LANGUAGE ? null : (value as Language) })
    // il messaggio d'errore dello stato arriva tradotto dal processo main
    setStatus(await window.api.getModsStatus())
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="ml-auto"
        title={t('settings.title')}
        onClick={() => setSheetOpen(true)}
      >
        <Settings className="size-4" />
      </Button>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t('settings.title')}</SheetTitle>
            <SheetDescription>{t('settings.description')}</SheetDescription>
          </SheetHeader>

          <div className="grid gap-6 px-4 pb-4">
            <section className="grid gap-2">
              <Label>{t('settings.gamePath')}</Label>
              <Input
                readOnly
                value={settings?.gamePath ?? ''}
                placeholder={t('settings.notSet')}
                title={settings?.gamePath ?? undefined}
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={browseGamePath}>
                  <FolderOpen className="size-4" />
                  {t('settings.browse')}
                </Button>
                <Button variant="outline" size="sm" onClick={detectGamePath}>
                  <Search className="size-4" />
                  {t('settings.detect')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!settings?.gamePath}
                  onClick={openAddons}
                >
                  {t('settings.openAddons')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t('settings.gamePathHint')}</p>
            </section>

            <section className="grid gap-2">
              <Label>{t('settings.language')}</Label>
              <Select value={languageValue} onValueChange={(v) => v && changeLanguage(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {languageValue === SYSTEM_LANGUAGE
                      ? t('settings.languageSystem')
                      : LANGUAGES[languageValue]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SYSTEM_LANGUAGE}>{t('settings.languageSystem')}</SelectItem>
                  {LANGUAGE_IDS.map((id) => (
                    <SelectItem key={id} value={id}>
                      {LANGUAGES[id]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>

            <section className="grid gap-2">
              <Label>{t('settings.theme')}</Label>
              <Select value={theme} onValueChange={(v) => v && setTheme(v as Theme)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{t(`theme.${theme}`)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {THEME_IDS.map((id) => (
                    <SelectItem key={id} value={id}>
                      {t(`theme.${id}`)}
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
                {t('settings.nsfw')}
              </Label>
            </section>

            <section className="grid gap-2">
              <Label>{t('settings.modList')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('settings.modCount', { count: formatNumber(status?.total ?? 0) })}
                {status?.lastUpdated &&
                  t('settings.lastUpdated', { time: formatTime(status.lastUpdated) })}
              </p>
              {status?.lastError && (
                <p className="text-sm text-destructive">{status.lastError}</p>
              )}
              <Button variant="outline" size="sm" disabled={refreshing} onClick={refresh}>
                <RefreshCw className={refreshing ? 'size-4 animate-spin' : 'size-4'} />
                {t('settings.refreshNow')}
              </Button>
            </section>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
