import { useState } from 'react'
import { toast } from 'sonner'
import { useI18n } from '@/hooks/useI18n'

/** Estensioni dei file che si possono installare. */
export const LOCAL_MOD_EXTENSIONS = ['.zip', '.rar', '.vpk']

/**
 * Installazione di mod da file sul computer, con i messaggi di esito. `install()` senza percorsi
 * fa scegliere i file all'utente; con i percorsi (es. trascinati) li installa direttamente.
 */
export function useLocalInstall(): {
  install: (paths?: string[]) => Promise<void>
  installing: boolean
} {
  const { t } = useI18n()
  const [installing, setInstalling] = useState(false)

  async function install(paths?: string[]): Promise<void> {
    setInstalling(true)
    const id = toast.loading(t('local.installing'))
    const result = await window.api.installLocalFiles(paths)
    setInstalling(false)
    toast.dismiss(id)
    if (!result.ok) return void toast.error(result.error)
    if (!result.data) return
    const ok = result.data.filter((r) => !r.error)
    const failed = result.data.filter((r) => r.error)
    if (ok.length)
      toast.success(t('local.installed', { count: ok.length }), {
        description: ok.map((r) => r.file).join(', ')
      })
    for (const r of failed)
      toast.error(t('local.failed', { file: r.file }), { description: r.error })
  }

  return { install, installing }
}
