import { ArrowDownToLine, RotateCw } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { useI18n } from '@/hooks/useI18n'
import { useUpdates } from '@/hooks/useUpdates'
import { RELEASES_URL } from '../../../mission/types'

/**
 * Avviso mostrato quando c'è una versione nuova dell'app: scaricata e pronta da installare con
 * un riavvio, oppure (dove l'app non si aggiorna da sola) da scaricare dalla pagina dei release.
 */
export default function UpdateBanner(): React.JSX.Element | null {
  const { status, manualUpdate } = useUpdates()
  const { t } = useI18n()

  if (status.state === 'ready') {
    return (
      <div className="flex flex-wrap items-center gap-3 border-b bg-primary/10 px-4 py-2 text-sm">
        <ArrowDownToLine className="size-4" />
        <span>{t('updates.ready', { version: status.version })}</span>
        <Button size="sm" className="ml-auto" onClick={() => window.api.installUpdate()}>
          <RotateCw className="size-4" />
          {t('updates.restart')}
        </Button>
      </div>
    )
  }

  if (manualUpdate) {
    return (
      <div className="flex flex-wrap items-center gap-3 border-b bg-primary/10 px-4 py-2 text-sm">
        <ArrowDownToLine className="size-4" />
        <span>{t('updates.manual', { version: manualUpdate })}</span>
        <a
          href={RELEASES_URL}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ size: 'sm', className: 'ml-auto' })}
        >
          {t('updates.download')}
        </a>
      </div>
    )
  }

  return null
}
