import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Download, FolderOpen, Palette, RefreshCw, Search, Settings, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import SettingsGroup from '@/components/SettingsGroup'
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
import { useTheme, THEME_IDS, type Theme } from '@/hooks/useTheme'
import { LANGUAGE_IDS, LANGUAGES, type Language } from '../../../mission/i18n'
import { TEXT_SIZE_IDS, TEXT_SIZES, type Status, type TextSize } from '../../../mission/types'

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
  const [transferring, setTransferring] = useState(false)
  const navigate = useNavigate()
  const textSize = settings?.textSize ?? 'normal'
  const languageValue = settings?.language ?? SYSTEM_LANGUAGE

  // con il pannello aperto lo stato si aggiorna ogni secondo, per seguire la sincronizzazione
  useEffect(() => {
    if (!sheetOpen) return
    const load = (): void => void window.api.getModsStatus().then(setStatus)
    load()
    const timer = setInterval(load, 1000)
    return () => clearInterval(timer)
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

  async function exportMods(): Promise<void> {
    setTransferring(true)
    const result = await window.api.exportMods()
    setTransferring(false)
    if (!result.ok) return void toast.error(result.error)
    if (!result.data) return
    toast.success(t('interchange.exported', { count: result.data.exported }), {
      description: result.data.folder
    })
    if (result.data.skipped.length)
      toast.warning(t('interchange.exportSkipped', { mods: result.data.skipped.join(', ') }))
  }

  async function importMods(): Promise<void> {
    setTransferring(true)
    const result = await window.api.importMods()
    setTransferring(false)
    if (!result.ok) return void toast.error(result.error)
    if (!result.data) return
    const { imported, skipped } = result.data
    if (imported > 0) toast.success(t('interchange.imported', { count: imported }))
    else if (skipped.length === 0) toast.info(t('interchange.importEmpty'))
    if (skipped.length)
      toast.warning(t('interchange.importSkipped', { count: skipped.length }), {
        description: skipped
          .map((s) => `${s.name}: ${t(`interchange.reason.${s.reason}`)}`)
          .join('; ')
      })
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
              <Label className="flex items-center gap-2">
                <Checkbox
                  checked={settings?.autoRepairGameinfo ?? true}
                  onCheckedChange={(checked) => update({ autoRepairGameinfo: checked === true })}
                />
                {t('settings.autoRepair')}
              </Label>
              <p className="text-xs text-muted-foreground">{t('settings.autoRepairHint')}</p>
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

            <SettingsGroup
              id="accessibility"
              title={t('a11y.title')}
              description={t('a11y.description')}
            >
              <div className="grid gap-2">
                <Label>{t('a11y.textSize')}</Label>
                <Select
                  value={textSize}
                  onValueChange={(v) => v && update({ textSize: v as TextSize })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {t(`a11y.textSize.${textSize}`)} ({TEXT_SIZES[textSize]}%)
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {TEXT_SIZE_IDS.map((id) => (
                      <SelectItem key={id} value={id}>
                        {t(`a11y.textSize.${id}`)} ({TEXT_SIZES[id]}%)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1">
                <Label className="flex items-center gap-2">
                  <Checkbox
                    checked={settings?.reduceMotion ?? false}
                    onCheckedChange={(checked) => update({ reduceMotion: checked === true })}
                  />
                  {t('a11y.reduceMotion')}
                </Label>
                <p className="text-xs text-muted-foreground">{t('a11y.reduceMotionHint')}</p>
              </div>

              <div className="grid gap-1">
                <Label className="flex items-center gap-2">
                  <Checkbox
                    checked={settings?.highContrast ?? false}
                    onCheckedChange={(checked) => update({ highContrast: checked === true })}
                  />
                  {t('a11y.highContrast')}
                </Label>
                <p className="text-xs text-muted-foreground">{t('a11y.highContrastHint')}</p>
              </div>

              <div className="grid gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-self-start"
                  onClick={() => {
                    setSheetOpen(false)
                    navigate('/colors')
                  }}
                >
                  <Palette className="size-4" />
                  {t('a11y.gameColors')}
                </Button>
                <p className="text-xs text-muted-foreground">{t('a11y.gameColorsHint')}</p>
              </div>
            </SettingsGroup>

            <SettingsGroup
              id="content"
              title={t('settings.content')}
              description={t('settings.contentDescription')}
            >
              <Label className="flex items-center gap-2">
                <Checkbox
                  checked={settings?.includeNSFW ?? false}
                  onCheckedChange={(checked) => update({ includeNSFW: checked === true })}
                />
                {t('settings.nsfw')}
              </Label>
            </SettingsGroup>

            <SettingsGroup
              id="modList"
              title={t('settings.modList')}
              description={t('settings.modCount', { count: formatNumber(status?.total ?? 0) })}
            >
              <p className="text-sm text-muted-foreground">
                {t('settings.modCount', { count: formatNumber(status?.total ?? 0) })}
                {status?.lastUpdated &&
                  t('settings.lastUpdated', { time: formatTime(status.lastUpdated) })}
              </p>
              {status?.sync && (
                <p className="text-sm text-muted-foreground">
                  {t('settings.syncIndex', { done: status.sync.done, total: status.sync.total })}
                </p>
              )}
              {status?.lastError && <p className="text-sm text-destructive">{status.lastError}</p>}
              <Button
                variant="outline"
                size="sm"
                disabled={refreshing || !!status?.sync}
                onClick={refresh}
              >
                <RefreshCw className={refreshing ? 'size-4 animate-spin' : 'size-4'} />
                {t('settings.refreshNow')}
              </Button>
            </SettingsGroup>

            <SettingsGroup
              id="interchange"
              title={t('interchange.title')}
              description={t('interchange.summary')}
            >
              <p className="text-xs text-muted-foreground">{t('interchange.description')}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={transferring || !settings?.gamePath}
                  onClick={importMods}
                >
                  <Download className="size-4" />
                  {t('interchange.import')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={transferring || !settings?.gamePath}
                  onClick={exportMods}
                >
                  <Upload className="size-4" />
                  {t('interchange.export')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t('interchange.hint')}</p>
            </SettingsGroup>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
