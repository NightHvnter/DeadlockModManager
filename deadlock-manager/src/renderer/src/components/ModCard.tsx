import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import type { Mod } from '../../../mission/types'

interface ModCardProps {
  mod: Mod
  /** `true` se la mod risulta già installata. */
  installed: boolean
  /** `true` mentre è in corso un'installazione o una disinstallazione. */
  busy: boolean
  onToggle: () => void
}

/** Card di una mod, con immagine, categoria, eroe e pulsante Installa/Disinstalla. */
export default function ModCard({ mod, installed, busy, onToggle }: ModCardProps): React.JSX.Element {
  const image = mod.images[0]

  return (
    <Card className="overflow-hidden pt-0">
      {image ? (
        <img src={image} alt={mod.name} loading="lazy" className="aspect-video w-full object-cover" />
      ) : (
        <div className="aspect-video w-full bg-muted" />
      )}
      <CardHeader>
        <CardTitle className="line-clamp-1" title={mod.name}>
          {mod.name}
        </CardTitle>
        <CardDescription>{mod.author}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-1">
        <Badge variant="secondary">{mod.category}</Badge>
        {mod.hero && <Badge variant="outline">{mod.hero}</Badge>}
      </CardContent>
      <CardFooter className="justify-between">
        <span className="text-sm text-muted-foreground">
          {mod.downloadCount.toLocaleString()} download
        </span>
        <Button
          size="sm"
          variant={installed ? 'outline' : 'default'}
          disabled={busy || mod.downloadable === false}
          onClick={onToggle}
        >
          {busy ? 'Attendi...' : installed ? 'Disinstalla' : 'Installa'}
        </Button>
      </CardFooter>
    </Card>
  )
}