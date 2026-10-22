import { NavLink } from 'react-router'
import { Download, LayoutGrid, Package } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { useI18n } from '@/hooks/useI18n'
import { cn } from '@/lib/utils'
import SettingsSheet from './SettingsSheet'
import type { MessageKey } from '../../../mission/i18n'

/** Voci di navigazione dell'app. */
const links: { to: string; label: MessageKey; icon: typeof LayoutGrid }[] = [
  { to: '/', label: 'nav.mods', icon: LayoutGrid },
  { to: '/installed', label: 'nav.installed', icon: Download }
]

/** Barra di navigazione fissa in alto, con il titolo, i link alle pagine e il cambio tema. */
export default function AppBar(): React.JSX.Element {
  const { t } = useI18n()

  return (
    <nav className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/80 px-4 py-2 backdrop-blur">
      <div className="mr-4 flex items-center gap-2 font-semibold">
        <Package className="size-5" />
        Deadlock Mod Manager
      </div>

      {links.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            cn(buttonVariants({ variant: isActive ? 'secondary' : 'ghost', size: 'sm' }))
          }
        >
          <Icon className="size-4" />
          {t(label)}
        </NavLink>
      ))}

      <SettingsSheet />
    </nav>
  )
}
