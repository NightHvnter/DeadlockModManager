import { LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Icona di caricamento che ruota. */
export default function Spinner({ className }: { className?: string }): React.JSX.Element {
  return <LoaderCircle className={cn('size-8 animate-spin text-muted-foreground', className)} />
}
