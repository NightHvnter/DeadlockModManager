import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ModActionsContext } from '@/hooks/useModActions'
import { useI18n } from '@/hooks/useI18n'
import type { IpcResult } from '../../../../mission/types'

/** Gestisce le operazioni sulle mod e il loro avanzamento per tutta l'app. */
export function ModActionsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [installedIds, setInstalledIds] = useState<string[]>([])
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [version, setVersion] = useState(0)
  const { t } = useI18n()

  const reload = useCallback(async () => {
    setInstalledIds(await window.api.getInstalledMods())
    setVersion((v) => v + 1)
  }, [])

  useEffect(() => {
    window.api.getInstalledMods().then(setInstalledIds)
    return window.api.onInstallProgress(({ modId, received, total }) => {
      if (total > 0) setProgress((p) => ({ ...p, [modId]: Math.min(received / total, 1) }))
    })
  }, [])

  /** Esegue un'operazione segnando la mod come occupata e mostrando l'esito. */
  async function run(
    modId: string,
    action: () => Promise<IpcResult<unknown>>,
    success: string
  ): Promise<boolean> {
    if (busy.has(modId)) return false
    setBusy((b) => new Set(b).add(modId))
    try {
      const result = await action()
      if (!result.ok) {
        toast.error(result.error)
        return false
      }
      toast.success(success)
      return true
    } finally {
      setBusy((b) => {
        const next = new Set(b)
        next.delete(modId)
        return next
      })
      setProgress((p) => {
        const next = { ...p }
        delete next[modId]
        return next
      })
      await reload()
    }
  }

  const value = {
    installedIds,
    version,
    isBusy: (modId: string) => busy.has(modId),
    progress: (modId: string) => progress[modId],
    install: (modId: string, fileName?: string) =>
      run(modId, () => window.api.installMod(modId, fileName), t('mod.installed')),
    uninstall: (modId: string) =>
      run(modId, () => window.api.uninstallMod(modId), t('mod.uninstalled')),
    update: (modId: string) => run(modId, () => window.api.updateMod(modId), t('mod.updated')),
    setEnabled: (modId: string, enabled: boolean) =>
      run(
        modId,
        () => window.api.setModEnabled(modId, enabled),
        t(enabled ? 'mod.enabled' : 'mod.disabled')
      )
  }

  return <ModActionsContext.Provider value={value}>{children}</ModActionsContext.Provider>
}
