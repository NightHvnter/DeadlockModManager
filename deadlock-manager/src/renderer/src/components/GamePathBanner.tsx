import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/hooks/useI18n'
import { useSettings } from '@/hooks/useSettings'

/** Avviso mostrato finché la cartella di Deadlock non è impostata. */
export default function GamePathBanner(): React.JSX.Element | null {
  const { settings, detectGamePath, setSheetOpen } = useSettings()
  const { t } = useI18n()
  if (!settings || settings.gamePath) return null

  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-destructive/10 px-4 py-2 text-sm">
      <TriangleAlert className="size-4 text-destructive" />
      <span>{t('banner.missing')}</span>
      <div className="ml-auto flex gap-2">
        <Button size="sm" variant="outline" onClick={detectGamePath}>
          {t('settings.detect')}
        </Button>
        <Button size="sm" onClick={() => setSheetOpen(true)}>
          {t('banner.set')}
        </Button>
      </div>
    </div>
  )
}
