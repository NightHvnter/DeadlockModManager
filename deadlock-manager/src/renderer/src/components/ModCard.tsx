import { Download, Heart, Music } from 'lucide-react'
import { useI18n } from '@/hooks/useI18n'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import InstallButton from './InstallButton'
import type { Mod } from '../../../mission/types'

interface ModCardProps {
  mod: Mod
  /** Apre il dettaglio della mod. */
  onOpen: () => void
}

/** Card di una mod, con immagine, categoria, eroe e pulsante Installa/Disinstalla. */
export default function ModCard({ mod, onOpen }: ModCardProps): React.JSX.Element {
  const image = mod.thumbnailUrl ?? mod.images[0]
  const { t, formatNumber } = useI18n()

  return (
    <Card className="overflow-hidden pt-0">
      <button type="button" className="cursor-pointer text-left" onClick={onOpen}>
        {image ? (
          <img
            src={image}
            alt={mod.name}
            loading="lazy"
            className="aspect-video w-full object-cover transition-opacity hover:opacity-90"
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center bg-muted text-muted-foreground">
            {mod.isAudio && <Music className="size-8" />}
          </div>
        )}
      </button>
      <CardHeader>
        <CardTitle className="line-clamp-1" title={mod.name}>
          <button type="button" className="cursor-pointer hover:underline" onClick={onOpen}>
            {mod.name}
          </button>
        </CardTitle>
        <CardDescription>{mod.author}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-1">
        <Badge variant="secondary">{mod.category}</Badge>
        {mod.hero && <Badge variant="outline">{mod.hero}</Badge>}
        {mod.isAudio && <Badge variant="outline">{t('mod.audio')}</Badge>}
        {mod.isNSFW && <Badge variant="destructive">NSFW</Badge>}
      </CardContent>
      <CardFooter className="mt-auto justify-between gap-2">
        <span className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1" title={t('mod.downloads')}>
            <Download className="size-3.5" />
            {formatNumber(mod.downloadCount)}
          </span>
          <span className="flex items-center gap-1" title={t('mod.likes')}>
            <Heart className="size-3.5" />
            {formatNumber(mod.likes)}
          </span>
        </span>
        <InstallButton mod={mod} />
      </CardFooter>
    </Card>
  )
}
