import { Link } from 'react-router'
import { buttonVariants } from '@/components/ui/button'

export default function NotFound(): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <h1 className="text-2xl font-semibold">Pagina non trovata</h1>
      <p className="text-muted-foreground">La pagina che cerchi non esiste.</p>
      <Link to="/" className={buttonVariants({ variant: 'outline' })}>
        Torna alle mod
      </Link>
    </div>
  )
}
