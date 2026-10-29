import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useI18n } from '@/hooks/useI18n'
import type { IpcResult, ProfilesState } from '../../../mission/types'

/**
 * Profili di mod e azioni per gestirli. L'elenco si rilegge quando cambiano le mod, perché il
 * profilo attivo le segue da solo.
 */
export function useProfiles(): {
  /** `null` finché i profili non sono letti. */
  state: ProfilesState | null
  /** Id del profilo che si sta applicando. */
  applying: string | null
  create: (name: string, fromCurrent: boolean) => Promise<boolean>
  rename: (id: string, name: string) => Promise<void>
  remove: (id: string) => Promise<void>
  apply: (id: string) => Promise<void>
} {
  const { t } = useI18n()
  const [state, setState] = useState<ProfilesState | null>(null)
  const [applying, setApplying] = useState<string | null>(null)

  useEffect(() => {
    const load = (): void => void window.api.getProfiles().then(setState)
    load()
    return window.api.onModsUpdated(load)
  }, [])

  /** Applica l'esito di una modifica: aggiorna i profili oppure mostra l'errore. */
  function done(result: IpcResult<ProfilesState>): boolean {
    if (!result.ok) {
      toast.error(result.error)
      return false
    }
    setState(result.data)
    return true
  }

  return {
    state,
    applying,
    create: async (name, fromCurrent) => done(await window.api.createProfile(name, fromCurrent)),
    rename: async (id, name) => void done(await window.api.renameProfile(id, name)),
    remove: async (id) => void done(await window.api.deleteProfile(id)),
    apply: async (id) => {
      setApplying(id)
      const result = await window.api.applyProfile(id)
      setApplying(null)
      setState(await window.api.getProfiles())
      if (!result.ok) return void toast.error(result.error)
      toast.success(t('profiles.applied', { name: result.data.profile.name }))
      if (result.data.missing.length)
        toast.warning(t('profiles.missing', { count: result.data.missing.length }), {
          description: result.data.missing.map((m) => m.name).join(', ')
        })
    }
  }
}
