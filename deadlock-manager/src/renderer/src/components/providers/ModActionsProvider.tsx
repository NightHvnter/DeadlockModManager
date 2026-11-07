import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ModActionsContext } from '@/hooks/useModActions'
import { useI18n } from '@/hooks/useI18n'
import { installKey } from '../../../../mission/types'
import type { InstalledFile, IpcResult } from '../../../../mission/types'

/** Gestisce le operazioni sulle mod e il loro avanzamento per tutta l'app. */
export function ModActionsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [installedFiles, setInstalledFiles] = useState<InstalledFile[]>([])
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [version, setVersion] = useState(0)
  const [updatingAll, setUpdatingAll] = useState<{ done: number; total: number } | null>(null)
  const { t } = useI18n()

  const reload = useCallback(async () => {
    setInstalledFiles(await window.api.getInstalledMods())
    setVersion((v) => v + 1)
  }, [])

  useEffect(() => {
    window.api.getInstalledMods().then(setInstalledFiles)
    return window.api.onInstallProgress(({ modId, received, total }) => {
      if (total > 0) setProgress((p) => ({ ...p, [modId]: Math.min(received / total, 1) }))
    })
  }, [])

  /**
   * Esegue un'operazione segnando la mod come occupata e mostrando l'esito.
   * @param success Messaggio di riuscita; `null` per non mostrarne uno
   * @param name Nome della mod da citare nell'errore, se non si capisce da dove arriva
   */
  async function run(
    modId: string,
    action: () => Promise<IpcResult<unknown>>,
    success: string | null,
    name?: string
  ): Promise<boolean> {
    if (busy.has(modId)) return false
    setBusy((b) => new Set(b).add(modId))
    try {
      const result = await action()
      if (!result.ok) {
        toast.error(name ? `${name}: ${result.error}` : result.error)
        return false
      }
      if (success) toast.success(success)
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
    installedFiles,
    version,
    isBusy: (modId: string) => busy.has(modId),
    progress: (modId: string) => progress[modId],
    install: (modId: string, fileName?: string) =>
      run(
        installKey(modId, fileName),
        () => window.api.installMod(modId, fileName),
        t('mod.installed')
      ),
    uninstall: (modId: string) =>
      run(modId, () => window.api.uninstallMod(modId), t('mod.uninstalled')),
    update: (modId: string) => run(modId, () => window.api.updateMod(modId), t('mod.updated')),
    updatingAll,
    updateAll: async (mods: { id: string; name: string }[]) => {
      let updated = 0
      try {
        for (const [done, { id, name }] of mods.entries()) {
          setUpdatingAll({ done, total: mods.length })
          if (await run(id, () => window.api.updateMod(id), null, name)) updated++
        }
      } finally {
        setUpdatingAll(null)
      }
      if (updated > 0) toast.success(t('mod.updatedAll', { count: updated, total: mods.length }))
    },
    setEnabled: (modId: string, enabled: boolean) =>
      run(
        modId,
        () => window.api.setModEnabled(modId, enabled),
        t(enabled ? 'mod.enabled' : 'mod.disabled')
      ),
    link: (localId: string, modId: string) =>
      run(localId, () => window.api.linkMod(localId, modId), t('link.done'))
  }

  return <ModActionsContext.Provider value={value}>{children}</ModActionsContext.Provider>
}
