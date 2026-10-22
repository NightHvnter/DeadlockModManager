import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useGameinfo } from '@/hooks/useGameinfo'
import { useI18n } from '@/hooks/useI18n'

/**
 * Avviso mostrato quando un aggiornamento di Deadlock ha tolto da `gameinfo.gi` la riga che
 * carica le mod e la riparazione automatica è disattivata.
 */
export default function GameinfoBanner(): React.JSX.Element | null {
  const { status, repair } = useGameinfo()
  const { t } = useI18n()
  if (status !== 'needsRepair') return null

  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-destructive/10 px-4 py-2 text-sm">
      <TriangleAlert className="size-4 text-destructive" />
      <span>{t('gameinfo.needsRepair')}</span>
      <Button size="sm" className="ml-auto" onClick={repair}>
        {t('gameinfo.repair')}
      </Button>
    </div>
  )
}
