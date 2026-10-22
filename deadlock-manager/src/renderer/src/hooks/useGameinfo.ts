import { createContext, useContext } from 'react'
import type { GameinfoStatus } from '../../../mission/types'

export interface GameinfoContextValue {
  /** Esito dell'ultimo controllo di `gameinfo.gi`; `null` finché il primo non è finito. */
  status: GameinfoStatus | null
  /** Controlla `gameinfo.gi` e avvia Deadlock tramite Steam. */
  play: () => Promise<void>
  /** Rimette la riga che carica le mod, anche con la riparazione automatica spenta. */
  repair: () => Promise<void>
  /** `true` mentre "Gioca" sta controllando e avviando il gioco. */
  launching: boolean
}

export const GameinfoContext = createContext<GameinfoContextValue | undefined>(undefined)

/** Stato di `gameinfo.gi` e azioni "Gioca" e "Ripara". */
export function useGameinfo(): GameinfoContextValue {
  const ctx = useContext(GameinfoContext)
  if (!ctx) throw new Error('useGameinfo va usato dentro GameinfoProvider')
  return ctx
}
