import { useEffect, useRef, useState } from 'react'
import { FileUp } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '@/hooks/useI18n'
import { LOCAL_MOD_EXTENSIONS, useLocalInstall } from '@/hooks/useLocalInstall'

const isModFile = (name: string): boolean =>
  LOCAL_MOD_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext))

/**
 * Permette di installare mod trascinando i loro file (`.zip`, `.rar`, `.vpk`) in qualsiasi punto
 * della finestra: mentre si trascina un file mostra un riquadro che copre tutta l'app.
 */
export default function DropZone(): React.JSX.Element | null {
  const { t } = useI18n()
  const { install } = useLocalInstall()
  const [dragging, setDragging] = useState(false)
  // i listener restano registrati una volta sola: leggono qui la versione attuale (lingua inclusa)
  const latest = useRef({ install, t })
  useEffect(() => {
    latest.current = { install, t }
  })

  useEffect(() => {
    // dragenter/dragleave scattano anche entrando e uscendo dai figli: si conta la profondità
    let depth = 0
    const hasFiles = (e: DragEvent): boolean => !!e.dataTransfer?.types.includes('Files')

    const onEnter = (e: DragEvent): void => {
      if (!hasFiles(e)) return
      depth++
      setDragging(true)
    }
    const onLeave = (e: DragEvent): void => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onOver = (e: DragEvent): void => {
      // senza preventDefault il browser aprirebbe il file al posto dell'app
      if (hasFiles(e)) e.preventDefault()
    }
    const onDrop = (e: DragEvent): void => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      const files = [...(e.dataTransfer?.files ?? [])]
      const mods = files.filter((f) => isModFile(f.name))
      if (mods.length < files.length) toast.warning(latest.current.t('local.unsupported'))
      if (mods.length) void latest.current.install(mods.map((f) => window.api.getPathForFile(f)))
    }

    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  if (!dragging) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-8 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-primary px-10 py-12 text-center">
        <FileUp className="size-10" />
        <p className="text-lg font-medium">{t('local.dropTitle')}</p>
        <p className="text-sm text-muted-foreground">{t('local.dropHint')}</p>
      </div>
    </div>
  )
}
