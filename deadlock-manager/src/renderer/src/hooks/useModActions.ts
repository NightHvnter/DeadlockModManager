import { createContext, useContext } from 'react'
import type { InstalledFile } from '../../../mission/types'

export interface ModActionsContextValue {
  /** File installati, uno per voce del manifest. */
  installedFiles: InstalledFile[]
  /** `true` se sulla voce (o sull'`installKey`) è in corso un'operazione. */
  isBusy: (key: string) => boolean
  /** Avanzamento del download (0-1), `undefined` se non è in corso o la dimensione è ignota. */
  progress: (key: string) => number | undefined
  install: (modId: string, fileName?: string) => Promise<boolean>
  uninstall: (modId: string) => Promise<boolean>
  update: (modId: string) => Promise<boolean>
  /** Aggiorna le mod una alla volta; un errore non ferma le altre. */
  updateAll: (mods: { id: string; name: string }[]) => Promise<void>
  /** Avanzamento di `updateAll`, `null` se non è in corso. */
  updatingAll: { done: number; total: number } | null
  setEnabled: (modId: string, enabled: boolean) => Promise<boolean>
  /** Collega la mod esterna `localId` alla mod di GameBanana `modId`. */
  link: (localId: string, modId: string) => Promise<boolean>
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
