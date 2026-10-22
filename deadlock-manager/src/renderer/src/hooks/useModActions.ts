import { createContext, useContext } from 'react'

export interface ModActionsContextValue {
  /** Id delle mod installate. */
  installedIds: string[]
  /** `true` se sulla mod è in corso un'operazione. */
  isBusy: (modId: string) => boolean
  /** Avanzamento del download (0-1), `undefined` se non è in corso o la dimensione è ignota. */
  progress: (modId: string) => number | undefined
  install: (modId: string, fileName?: string) => Promise<boolean>
  uninstall: (modId: string) => Promise<boolean>
  update: (modId: string) => Promise<boolean>
  setEnabled: (modId: string, enabled: boolean) => Promise<boolean>
  /** Cambia ogni volta che l'elenco delle mod installate cambia. */
  version: number
}

export const ModActionsContext = createContext<ModActionsContextValue | undefined>(undefined)

/** Installazione, disinstallazione e stato delle operazioni sulle mod, condivisi tra le pagine. */
export function useModActions(): ModActionsContextValue {
  const ctx = useContext(ModActionsContext)
  if (!ctx) throw new Error('useModActions va usato dentro ModActionsProvider')
  return ctx
}
