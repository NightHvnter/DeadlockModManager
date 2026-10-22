import { useEffect, useState } from 'react'
import { useI18n } from '@/hooks/useI18n'
import Spinner from './Spinner'
import type { SyncProgress } from '../../../mission/types'

/**
 * Avanzamento della sincronizzazione completa del catalogo, mostrato mentre le mod arrivano.
 * Lo stato viene letto ogni secondo finché la sincronizzazione è in corso.
 */
export default function CatalogSyncBanner(): React.JSX.Element | null {
  const { t, formatNumber } = useI18n()
  const [sync, setSync] = useState<SyncProgress | undefined>()

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined
    const check = async (): Promise<void> => {
      const { sync } = await window.api.getModsStatus()
      setSync(sync)
      if (sync && !timer) timer = setInterval(check, 1000)
      if (!sync && timer) {
        clearInterval(timer)
        timer = undefined
      }
    }
    check()
    // una sincronizzazione può partire dopo (es. quella settimanale): si ricontrolla a ogni aggiornamento
    const unsubscribe = window.api.onModsUpdated(check)
    return () => {
      unsubscribe()
      clearInterval(timer)
    }
  }, [])

  if (!sync) return null
  const percent = sync.expected > 0 ? Math.min(100, (sync.loaded / sync.expected) * 100) : 0

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
      <Spinner className="size-4" />
      <span className="text-muted-foreground">
        {t('home.syncing', {
          loaded: formatNumber(sync.loaded),
          expected: formatNumber(sync.expected)
        })}
      </span>
      <div className="ml-auto h-1.5 w-40 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
