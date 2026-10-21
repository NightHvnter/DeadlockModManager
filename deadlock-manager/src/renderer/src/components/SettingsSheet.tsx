import { useState } from 'react'
import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { useTheme, THEMES, THEME_IDS, type Theme } from './providers/ThemeProvider'

/** Pulsante impostazioni che apre un pannello laterale da destra con la scelta del tema. */
export default function SettingsSheet(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const { theme, setTheme } = useTheme()

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="ml-auto"
        title="Impostazioni"
        onClick={() => setOpen(true)}
      >
        <Settings className="size-4" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Impostazioni</SheetTitle>
            <SheetDescription>Personalizza le impostazioni dell'applicazione</SheetDescription>
          </SheetHeader>

          <div className="grid gap-2 px-4">
            <Label>Tema</Label>
            <Select value={theme} onValueChange={(v) => v && setTheme(v as Theme)}>
              <SelectTrigger>
                <SelectValue>{THEMES[theme].label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {THEME_IDS.map((id) => (
                  <SelectItem key={id} value={id}>
                    {THEMES[id].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}