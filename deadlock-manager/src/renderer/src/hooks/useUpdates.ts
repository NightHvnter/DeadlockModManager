import { useEffect, useState } from 'react'
import type { UpdateStatus } from '../../../mission/types'

/** `true` se la versione `a` (es. `1.2.0`) è più recente di `b`. */
export function isNewer(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0)
  }
  return false
}

/** Stato degli aggiornamenti dell'app, aggiornato man mano che il processo main lo cambia. */
export function useUpdates(): {
  /** Versione installata, `null` finché non è letta. */
  version: string | null
  status: UpdateStatus
  /** Versione più recente da scaricare a mano, dove l'app non si aggiorna da sola. */
  manualUpdate: string | null
} {
  const [version, setVersion] = useState<string | null>(null)
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })

  useEffect(() => {
    window.api.getAppVersion().then(setVersion)
    window.api.getUpdateStatus().then(setStatus)
    return window.api.onUpdateStatus(setStatus)
  }, [])

  const manualUpdate =
    status.state === 'unsupported' && status.latest && version && isNewer(status.latest, version)
      ? status.latest
      : null
  return { version, status, manualUpdate }
}
