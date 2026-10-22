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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useI18n } from '@/hooks/useI18n'
import { sanitizeHtml } from '@/lib/sanitizeHtml'
import { cn } from '@/lib/utils'
import InstallButton from './InstallButton'
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

function Details({ mod }: { mod: Mod }): React.JSX.Element {
  const [index, setIndex] = useState(0)
  const [downloads, setDownloads] = useState<ModDownload[] | null>(null)
  const [downloadsError, setDownloadsError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | undefined>()
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
      setFileName(result.data[0]?.name)
    })
    // il changelog è facoltativo: se non arriva la sezione semplicemente non compare
    window.api.getChangelog(mod.id).then((result) => result.ok && setChangelog(result.data))
  }, [mod.id])

  const images = mod.images
  const image = images[index]

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

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        {downloadsError ? (
          <span className="text-destructive">{downloadsError}</span>
        ) : downloads && downloads.length > 1 ? (
          <Select value={fileName} onValueChange={(v) => v && setFileName(v)}>
            <SelectTrigger className="max-w-sm">
              <SelectValue>{fileName}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {downloads.map((d) => (
                <SelectItem key={d.name} value={d.name}>
                  {d.name} ({formatSize(d.size)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : downloads?.[0] ? (
          <span className="text-muted-foreground">
            {downloads[0].name} ({formatSize(downloads[0].size)})
          </span>
        ) : downloads ? (
          <span className="text-muted-foreground">{t('details.noFiles')}</span>
        ) : (
          <span className="text-muted-foreground">{t('details.loadingFiles')}</span>
        )}

        <div className="ml-auto flex gap-2">
          <a
            href={mod.remoteUrl}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: 'ghost' })}
          >
            <ExternalLink className="size-4" />
            GameBanana
          </a>
          <InstallButton mod={mod} fileName={fileName} size="default" />
        </div>
      </div>
    </>
  )
}
