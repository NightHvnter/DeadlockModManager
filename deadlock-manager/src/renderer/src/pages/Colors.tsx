import { useState } from 'react'
import { toast } from 'sonner'
import { Check, RotateCcw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import Spinner from '@/components/Spinner'
import { useI18n } from '@/hooks/useI18n'
import { useSettings } from '@/hooks/useSettings'
import {
  COLOR_SLOTS,
  COLOR_SLOT_IDS,
  type ColorSlot,
  type InterfaceColors
} from '../../../mission/types'

/** Combinazioni di colori pronte; il nome di ognuna è nei testi, alla chiave `colors.preset.<id>`. */
const PRESETS = {
  original: {},
  colorblind: {
    enemy: '#FFB000',
    friendly: '#3D9BFF',
    localHealth: '#2F7BFF',
    friendlyHealth: '#2A5FA8'
  },
  neon: {
    text: '#E0F7FF',
    accent: '#FF2BD6',
    brand: '#00F0FF',
    enemy: '#FF2B4E',
    friendly: '#39FF14',
    souls: '#B4FF00',
    tech: '#00F0FF'
  },
  ice: {
    text: '#E6F4FF',
    accent: '#7FD4FF',
    brand: '#5FB8FF',
    souls: '#A8E6FF',
    tech: '#9AD0FF'
  },
  crimson: {
    text: '#FFE3E0',
    accent: '#FF5A4E',
    brand: '#E8433A',
    souls: '#FF8A7A'
  }
} satisfies Record<string, InterfaceColors>

type Preset = keyof typeof PRESETS
const PRESET_IDS = Object.keys(PRESETS) as Preset[]

const original = (slot: ColorSlot): string => COLOR_SLOTS[slot].original
const valueOf = (colors: InterfaceColors, slot: ColorSlot): string =>
  (colors[slot] ?? original(slot)).toUpperCase()

/** Tiene solo i colori diversi dall'originale. */
function normalize(colors: InterfaceColors): InterfaceColors {
  const out: InterfaceColors = {}
  for (const slot of COLOR_SLOT_IDS)
    if (valueOf(colors, slot) !== original(slot)) out[slot] = valueOf(colors, slot)
  return out
}

const sameColors = (a: InterfaceColors, b: InterfaceColors): boolean =>
  COLOR_SLOT_IDS.every((slot) => valueOf(a, slot) === valueOf(b, slot))

/** Pagina per cambiare i colori dell'interfaccia di Deadlock senza installare altre mod. */
export default function Colors(): React.JSX.Element {
  const { settings, reload, setSheetOpen } = useSettings()
  const { t } = useI18n()
  // modifiche non ancora applicate; `null` mostra i colori salvati
  const [edits, setDraft] = useState<InterfaceColors | null>(null)
  const [applying, setApplying] = useState(false)
  const [conflicts, setConflicts] = useState<string[]>([])
  const saved = settings?.interfaceColors ?? {}
  const draft = edits ?? saved

  if (!settings) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  const changed = !sameColors(draft, saved)
  const activePreset = PRESET_IDS.find((id) => sameColors(draft, PRESETS[id]))

  async function apply(colors: InterfaceColors): Promise<void> {
    setApplying(true)
    const result = await window.api.applyInterfaceColors(normalize(colors))
    setApplying(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    await reload()
    setDraft(null)
    setConflicts(result.data.conflicts)
    toast.success(t(result.data.file ? 'colors.applied' : 'colors.restored'))
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">{t('colors.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('colors.description')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={activePreset ?? ''}
          onValueChange={(v) => v && setDraft({ ...PRESETS[v as Preset] })}
        >
          <SelectTrigger className="w-48">
            <SelectValue>
              {activePreset ? t(`colors.preset.${activePreset}`) : t('colors.custom')}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {PRESET_IDS.map((id) => (
              <SelectItem key={id} value={id}>
                {t(`colors.preset.${id}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={applying || (Object.keys(normalize(saved)).length === 0 && !changed)}
            onClick={() => apply({})}
          >
            <RotateCcw className="size-4" />
            {t('colors.restoreAll')}
          </Button>
          <Button
            size="sm"
            disabled={applying || !changed || !settings.gamePath}
            onClick={() => apply(draft)}
          >
            <Check className="size-4" />
            {t(applying ? 'colors.applying' : 'colors.apply')}
          </Button>
        </div>
      </div>

      {!settings.gamePath && (
        <p className="text-sm text-destructive">
          {t('colors.noGame')}{' '}
          <button className="underline" onClick={() => setSheetOpen(true)}>
            {t('banner.set')}
          </button>
        </p>
      )}

      {conflicts.length > 0 && (
        <Card className="flex-row items-start gap-3 p-3 text-sm">
          <TriangleAlert className="size-4 shrink-0 text-destructive" />
          <span>{t('colors.conflicts', { mods: conflicts.join(', ') })}</span>
        </Card>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {COLOR_SLOT_IDS.map((slot) => {
          const value = valueOf(draft, slot)
          const isOriginal = value === original(slot)
          return (
            <Card key={slot} className="flex-row items-center gap-3 p-3">
              <input
                type="color"
                aria-label={t(`colors.slot.${slot}`)}
                className="size-10 shrink-0 cursor-pointer rounded-md border bg-transparent"
                value={value.toLowerCase()}
                onChange={(e) => setDraft({ ...draft, [slot]: e.target.value.toUpperCase() })}
              />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{t(`colors.slot.${slot}`)}</div>
                <div className="text-xs text-muted-foreground">
                  {t(`colors.hint.${slot}`)} · <span className="font-mono">{value}</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                title={t('colors.restore', { color: original(slot) })}
                disabled={isOriginal}
                onClick={() => setDraft({ ...draft, [slot]: original(slot) })}
              >
                <RotateCcw className="size-4" />
              </Button>
            </Card>
          )
        })}
      </div>

      <p className="text-xs text-muted-foreground">{t('colors.footer')}</p>
    </div>
  )
}
