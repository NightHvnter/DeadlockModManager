import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { SettingsContext } from '@/hooks/useSettings'
import { detectLanguage, translate } from '../../../../mission/i18n'
import type { IpcResult, Settings } from '../../../../mission/types'

/** Carica le impostazioni dal processo main e le rende disponibili con `useSettings`. */
export function SettingsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const language = settings?.language ?? detectLanguage(navigator.language)

  useEffect(() => {
    window.api.getSettings().then(setSettings)
  }, [])

  // la lingua del documento serve anche agli screen reader e alla sillabazione
  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  /** Applica l'esito di una modifica: aggiorna lo stato oppure mostra l'errore. */
  function apply(result: IpcResult<Settings | null>): boolean {
    if (!result.ok) {
      toast.error(result.error)
      return false
    }
    if (result.data) setSettings(result.data)
    return true
  }

  const value = {
    settings,
    sheetOpen,
    setSheetOpen,
    update: async (patch: Partial<Settings>) => apply(await window.api.setSettings(patch)),
    detectGamePath: async () => {
      if (apply(await window.api.detectGamePath()))
        toast.success(translate(language, 'settings.gameFound'))
    },
    browseGamePath: async () => {
      apply(await window.api.browseGamePath())
    }
  }

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}
