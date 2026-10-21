import { Button } from '@/components/ui/button'
import { useModActions } from '@/hooks/useModActions'
import type { Mod } from '../../../mission/types'

interface InstallButtonProps {
  mod: Mod
  /** File da installare; se assente si usa il primo disponibile. */
  fileName?: string
  size?: 'sm' | 'default'
}

/** Pulsante Installa/Disinstalla con l'avanzamento del download. */
export default function InstallButton({
  mod,
  fileName,
  size = 'sm'
}: InstallButtonProps): React.JSX.Element {
  const { installedIds, isBusy, progress, install, uninstall } = useModActions()
  const installed = installedIds.includes(mod.id)
  const busy = isBusy(mod.id)
  const p = progress(mod.id)

  let label = installed ? 'Disinstalla' : 'Installa'
  if (busy) label = p !== undefined && p < 1 ? `${Math.round(p * 100)}%` : 'Attendi...'

  return (
    <Button
      size={size}
      variant={installed ? 'outline' : 'default'}
      disabled={busy || (!installed && mod.downloadable === false)}
      onClick={() => (installed ? uninstall(mod.id) : install(mod.id, fileName))}
      className="relative min-w-24 overflow-hidden"
    >
      {busy && p !== undefined && (
        <span
          className="absolute inset-y-0 left-0 bg-primary-foreground/20 transition-[width]"
          style={{ width: `${p * 100}%` }}
        />
      )}
      <span className="relative">{label}</span>
    </Button>
  )
}
