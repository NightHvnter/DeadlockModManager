import { createContext, useContext } from 'react'
import type { Settings } from '../../../mission/types'

export interface SettingsContextValue {
  /** `null` finché le impostazioni non sono state lette. */
  settings: Settings | null
  /** Salva una parte delle impostazioni; restituisce `false` (e mostra l'errore) se fallisce. */
  update: (patch: Partial<Settings>) => Promise<boolean>
  /** Rilegge le impostazioni, dopo che il processo main le ha cambiate da solo. */
  reload: () => Promise<void>
  /** Cerca Deadlock nelle librerie di Steam. */
  detectGamePath: () => Promise<void>
  /** Fa scegliere la cartella del gioco all'utente. */
  browseGamePath: () => Promise<void>
  /** Apre o chiude il pannello delle impostazioni. */
  sheetOpen: boolean
  setSheetOpen: (open: boolean) => void
}

export const SettingsContext = createContext<SettingsContextValue | undefined>(undefined)

/** Impostazioni dell'app e funzioni per modificarle. */
export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings va usato dentro SettingsProvider')
  return ctx
}
