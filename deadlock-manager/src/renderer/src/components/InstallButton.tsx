import { Button } from '@/components/ui/button'
import { useI18n } from '@/hooks/useI18n'
import { useModActions } from '@/hooks/useModActions'
import { baseModId, installKey } from '../../../mission/types'
import type { Mod } from '../../../mission/types'

interface InstallButtonProps {
  mod: Mod
  /** File a cui si riferisce il pulsante; se assente vale per la mod intera. */
  fileName?: string
  /** Voce installata a cui si riferisce il pulsante, per i file che la mod non elenca più. */
  entryId?: string
  /** Mostra i file della mod, quando ce n'è più di uno installato e non si sa quale togliere. */
  onManage?: () => void
  size?: 'sm' | 'default'
}

/** Pulsante Installa/Disinstalla di una mod o di un suo file, con l'avanzamento del download. */
export default function InstallButton({
  mod,
  fileName,
  entryId,
  onManage,
  size = 'sm'
}: InstallButtonProps): React.JSX.Element {
  const { installedFiles, isBusy, progress, install, uninstall } = useModActions()
  const { t } = useI18n()
  const files = installedFiles.filter((f) => baseModId(f.id) === mod.id)
  const entry = entryId
    ? files.find((f) => f.id === entryId)
    : fileName
      ? files.find((f) => f.fileName === fileName)
      : files[0]
  const key = entry?.id ?? installKey(mod.id, fileName)
  const busy = isBusy(key)
  const p = progress(key)

  if (onManage && files.length > 1) {
    return (
      <Button size={size} variant="outline" onClick={onManage} className="min-w-24">
        {t('mod.manageFiles', { count: files.length })}
      </Button>
    )
  }

  let label = t(entry ? 'mod.uninstall' : 'mod.install')
  if (busy) label = p !== undefined && p < 1 ? `${Math.round(p * 100)}%` : t('mod.wait')

  return (
    <Button
      size={size}
      variant={entry ? 'outline' : 'default'}
      disabled={busy || (!entry && mod.downloadable === false)}
      onClick={() => (entry ? uninstall(entry.id) : install(mod.id, fileName))}
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
