import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

/** Chiave in `localStorage` in cui si ricorda se il gruppo `id` è aperto. */
const storageKey = (id: string): string => `settings.open.${id}`

function readOpen(id: string): boolean {
  try {
    return localStorage.getItem(storageKey(id)) === '1'
  } catch {
    return false
  }
}

/**
 * Gruppo di impostazioni che si apre e si chiude dal titolo, per occupare meno spazio nel
 * pannello. È un `<details>` nativo, quindi funziona da tastiera e con gli screen reader; resta
 * aperto o chiuso come l'utente l'ha lasciato.
 */
export default function SettingsGroup({
  id,
  title,
  description,
  children
}: {
  /** Identificatore del gruppo, per ricordarne lo stato. */
  id: string
  title: string
  /** Riga sotto il titolo, visibile anche a gruppo chiuso. */
  description?: string
  children: React.ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(() => readOpen(id))

  function toggle(e: React.SyntheticEvent<HTMLDetailsElement>): void {
    const next = e.currentTarget.open
    setOpen(next)
    try {
      localStorage.setItem(storageKey(id), next ? '1' : '0')
    } catch {
      // senza localStorage il gruppo semplicemente non ricorda lo stato
    }
  }

  return (
    <details className="group rounded-lg border" open={open} onToggle={toggle}>
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg p-3 select-none hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-sm font-medium">{title}</span>
          {description && <span className="text-xs text-muted-foreground">{description}</span>}
        </div>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="grid gap-3 px-3 pb-3">{children}</div>
    </details>
  )
}
