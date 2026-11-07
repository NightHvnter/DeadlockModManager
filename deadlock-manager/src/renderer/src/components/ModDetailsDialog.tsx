import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useI18n } from '@/hooks/useI18n'
import { useModActions } from '@/hooks/useModActions'
import { sanitizeHtml } from '@/lib/sanitizeHtml'
import { cn } from '@/lib/utils'
import InstallButton from './InstallButton'
import { baseModId } from '../../../mission/types'
import type { Mod, ModChangelogEntry, ModDownload } from '../../../mission/types'

/** Dimensione leggibile di un file. */
function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

interface ModDetailsDialogProps {
  /** Mod da mostrare; `null` chiude la finestra. */
  mod: Mod | null
  onClose: () => void
}

/** Finestra con immagini, descrizione, dipendenze e file scaricabili di una mod. */
export default function ModDetailsDialog({
  mod,
  onClose
}: ModDetailsDialogProps): React.JSX.Element {
  return (
    <Dialog open={!!mod} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        {mod && <Details key={mod.id} mod={mod} />}
      </DialogContent>
    </Dialog>
  )
}

/** Riga di un file della mod: nome, dettagli e il suo pulsante. */
function FileRow({
  name,
  detail,
  children
}: {
  name: string
  detail: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <li className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="truncate" title={name}>
          {name}
        </div>
        <div className="truncate text-sm text-muted-foreground" title={detail}>
          {detail}
        </div>
      </div>
      {children}
    </li>
  )
}

function Details({ mod }: { mod: Mod }): React.JSX.Element {
  const [index, setIndex] = useState(0)
  const [downloads, setDownloads] = useState<ModDownload[] | null>(null)
  const [downloadsError, setDownloadsError] = useState<string | null>(null)
  const { t, formatNumber, formatDate } = useI18n()
  const description = useMemo(
    () => (mod.description ? sanitizeHtml(mod.description) : ''),
    [mod.description]
  )

  const [changelog, setChangelog] = useState<ModChangelogEntry[]>([])

  useEffect(() => {
    window.api.getDownloads(mod.id).then((result) => {
      if (!result.ok) return setDownloadsError(result.error)
      setDownloads(result.data)
    })
    // il changelog è facoltativo: se non arriva la sezione semplicemente non compare
    window.api.getChangelog(mod.id).then((result) => result.ok && setChangelog(result.data))
  }, [mod.id])

  const images = mod.images
  const image = images[index]

  // file installati che la pagina della mod non elenca più (sostituiti dall'autore o collegati)
  const { installedFiles } = useModActions()
  const unlisted = downloads
    ? installedFiles.filter(
        (f) => baseModId(f.id) === mod.id && !downloads.some((d) => d.name === f.fileName)
      )
    : []

  return (
    <>
      <DialogHeader>
        <DialogTitle className="pr-8 text-lg">{mod.name}</DialogTitle>
        <DialogDescription>
          {t('details.byline', {
            author: mod.author,
            downloads: formatNumber(mod.downloadCount),
            likes: formatNumber(mod.likes),
            date: formatDate(mod.remoteUpdatedAt)
          })}
        </DialogDescription>
      </DialogHeader>

      {image && (
        <div className="space-y-2">
          <div className="relative">
            <img
              src={image}
              alt=""
              className="aspect-video w-full rounded-lg object-contain bg-muted"
            />
            {images.length > 1 && (
              <>
                <Button
                  size="icon-sm"
                  variant="secondary"
                  className="absolute top-1/2 left-2 -translate-y-1/2"
                  aria-label={t('details.previousImage')}
                  onClick={() => setIndex((index - 1 + images.length) % images.length)}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  size="icon-sm"
                  variant="secondary"
                  className="absolute top-1/2 right-2 -translate-y-1/2"
                  aria-label={t('details.nextImage')}
                  onClick={() => setIndex((index + 1) % images.length)}
                >
                  <ChevronRight />
                </Button>
              </>
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {images.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setIndex(i)}
                  className={cn(
                    'shrink-0 overflow-hidden rounded-md ring-2 ring-transparent',
                    i === index && 'ring-primary'
                  )}
                >
                  <img src={src} alt="" loading="lazy" className="aspect-video w-24 object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        <Badge variant="secondary">{mod.category}</Badge>
        {mod.hero && <Badge variant="outline">{mod.hero}</Badge>}
        {mod.isAudio && <Badge variant="outline">{t('mod.audio')}</Badge>}
        {mod.isMap && <Badge variant="outline">{t('mod.map')}</Badge>}
        {mod.isNSFW && <Badge variant="destructive">NSFW</Badge>}
        {mod.tags
          .filter((t) => t !== mod.hero)
          .map((t) => (
            <Badge key={t} variant="ghost">
              #{t}
            </Badge>
          ))}
      </div>

      {mod.audioUrl && <audio controls src={mod.audioUrl} className="w-full" />}

      {description && (
        <div
          className="space-y-2 leading-relaxed break-words [&_a]:text-primary [&_a]:underline [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc"
          dangerouslySetInnerHTML={{ __html: description }}
        />
      )}

      {!!mod.dependencies?.length && (
        <div className="space-y-1">
          <h3 className="font-medium">{t('details.dependencies')}</h3>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {mod.dependencies.map((d) => (
              <li key={d.label}>
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noreferrer" className="underline">
                    {d.label}
                  </a>
                ) : (
                  d.label
                )}
                {d.level === 'required' && ` ${t('details.required')}`}
                {d.level === 'recommended' && ` ${t('details.recommended')}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {changelog.length > 0 && (
        <details className="space-y-2">
          <summary className="cursor-pointer font-medium">{t('details.changelog')}</summary>
          <ol className="mt-2 space-y-3">
            {changelog.map((entry) => (
              <li key={`${entry.date}-${entry.title}`}>
                <div className="font-medium">
                  {entry.title}
                  <span className="font-normal text-muted-foreground">
                    {' · '}
                    {entry.version && `${t('details.version', { version: entry.version })} · `}
                    {formatDate(entry.date)}
                  </span>
                </div>
                {entry.changes.length > 0 && (
                  <ul className="list-disc pl-5 text-muted-foreground">
                    {entry.changes.map((c, i) => (
                      <li key={i}>
                        {c.category && <span className="text-foreground">{c.category}: </span>}
                        {c.text}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}

      <div className="space-y-2 border-t pt-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium">{t('details.files')}</h3>
          <a
            href={mod.remoteUrl}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          >
            <ExternalLink className="size-4" />
            GameBanana
          </a>
        </div>

        {downloadsError ? (
          <p className="text-destructive">{downloadsError}</p>
        ) : !downloads ? (
          <p className="text-muted-foreground">{t('details.loadingFiles')}</p>
        ) : downloads.length + unlisted.length === 0 ? (
          <p className="text-muted-foreground">{t('details.noFiles')}</p>
        ) : (
          <ul className="grid gap-2">
            {downloads.map((d) => (
              <FileRow
                key={d.name}
                name={d.name}
                detail={[formatSize(d.size), d.description].filter(Boolean).join(' · ')}
              >
                <InstallButton mod={mod} fileName={d.name} />
              </FileRow>
            ))}
            {unlisted.map((f) => (
              <FileRow key={f.id} name={f.fileName ?? f.id} detail={t('details.notListed')}>
                <InstallButton mod={mod} entryId={f.id} />
              </FileRow>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
