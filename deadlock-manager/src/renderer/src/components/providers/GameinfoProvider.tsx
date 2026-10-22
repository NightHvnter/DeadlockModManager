import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { GameinfoContext } from '@/hooks/useGameinfo'
import { useI18n } from '@/hooks/useI18n'
import { useModActions } from '@/hooks/useModActions'
import type { GameinfoStatus, IpcResult } from '../../../../mission/types'

/**
 * Controlla `gameinfo.gi` all'apertura dell'app e a ogni "Gioca". Non osserva mai i file del
 * gioco in background: se un aggiornamento di Deadlock ha tolto la riga delle mod, la
 * riparazione avviene (o viene proposta) solo in questi momenti.
 */
export function GameinfoProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { t } = useI18n()
  const { version } = useModActions()
  const [status, setStatus] = useState<GameinfoStatus | null>(null)
  const [launching, setLaunching] = useState(false)
  // `t` cambia con la lingua: un ref evita di ripetere il controllo quando la si cambia
  const tRef = useRef(t)
  useEffect(() => {
    tRef.current = t
  }, [t])

  /** Applica l'esito di un controllo: avviso se è stato riparato, errore se è fallito. */
  const apply = useCallback((result: IpcResult<GameinfoStatus>): void => {
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    if (result.data === 'repaired') toast.success(tRef.current('gameinfo.repaired'))
    setStatus(result.data)
  }, [])

  // un solo controllo all'apertura dell'app
  useEffect(() => {
    window.api.checkGameinfo().then(apply)
  }, [apply])

  // installando o riattivando una mod la riga viene rimessa: si aggiorna il banner se era visibile
  const needsRecheck = status === 'needsRepair'
  useEffect(() => {
    if (needsRecheck) window.api.checkGameinfo().then(apply)
    // si ricontrolla solo quando cambiano le mod installate
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version])

  const value = {
    status,
    launching,
    play: async () => {
      setLaunching(true)
      try {
        const result = await window.api.play()
        apply(result)
        if (result.ok) toast(t('play.launching'))
      } finally {
        setLaunching(false)
      }
    },
    repair: async () => apply(await window.api.repairGameinfo())
  }

  return <GameinfoContext.Provider value={value}>{children}</GameinfoContext.Provider>
}
