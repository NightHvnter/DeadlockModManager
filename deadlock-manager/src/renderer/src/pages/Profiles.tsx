import { useState } from 'react'
import { Check, Pencil, Play, Plus, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import Spinner from '@/components/Spinner'
import { useI18n } from '@/hooks/useI18n'
import { useProfiles } from '@/hooks/useProfiles'
import type { ModProfile } from '../../../mission/types'

/** Mod mostrate per ogni profilo prima di "e altre N". */
const PREVIEW = 6

/** Pagina dei profili di mod: creazione, rinomina, eliminazione e cambio di profilo. */
export default function Profiles(): React.JSX.Element {
  const { t, formatDate } = useI18n()
  const profiles = useProfiles()
  const [name, setName] = useState('')

  if (!profiles.state) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }
  const { activeId, profiles: list } = profiles.state

  async function create(fromCurrent: boolean): Promise<void> {
    const fallback = t('profiles.defaultName', { n: list.length + 1 })
    if (await profiles.create(name || fallback, fromCurrent)) setName('')
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">{t('profiles.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('profiles.description')}</p>
      </div>

      <Card className="gap-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="max-w-xs"
            placeholder={t('profiles.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create(true)}
          />
          <Button size="sm" onClick={() => create(true)}>
            <Plus className="size-4" />
            {t('profiles.createFromCurrent')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => create(false)}>
            {t('profiles.createEmpty')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t('profiles.createHint')}</p>
      </Card>

      {list.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">{t('profiles.empty')}</p>
      ) : (
        <div className="grid gap-2">
          {list.map((p) => (
            <ProfileCard
              key={p.id}
              profile={p}
              active={p.id === activeId}
              applying={profiles.applying === p.id}
              busy={profiles.applying !== null}
              createdOn={t('profiles.createdOn', { date: formatDate(p.createdAt) })}
              onApply={() => profiles.apply(p.id)}
              onRename={(n) => profiles.rename(p.id, n)}
              onDelete={() => {
                if (window.confirm(t('profiles.confirmDelete', { name: p.name })))
                  void profiles.remove(p.id)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ProfileCard({
  profile,
  active,
  applying,
  busy,
  createdOn,
  onApply,
  onRename,
  onDelete
}: {
  profile: ModProfile
  active: boolean
  applying: boolean
  busy: boolean
  createdOn: string
  onApply: () => void
  onRename: (name: string) => void
  onDelete: () => void
}): React.JSX.Element {
  const { t } = useI18n()
  const [editing, setEditing] = useState<string | null>(null)

  function saveName(): void {
    if (editing?.trim()) onRename(editing)
    setEditing(null)
  }

  return (
    <Card className={active ? 'gap-2 p-3 ring-2 ring-primary' : 'gap-2 p-3'}>
      <div className="flex flex-wrap items-center gap-2">
        {editing !== null ? (
          <>
            <Input
              autoFocus
              className="h-8 max-w-xs"
              value={editing}
              aria-label={t('profiles.rename')}
              onChange={(e) => setEditing(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveName()
                if (e.key === 'Escape') setEditing(null)
              }}
            />
            <Button size="icon" variant="ghost" title={t('profiles.save')} onClick={saveName}>
              <Check className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              title={t('profiles.cancel')}
              onClick={() => setEditing(null)}
            >
              <X className="size-4" />
            </Button>
          </>
        ) : (
          <span className="font-medium">{profile.name}</span>
        )}
        {active && <Badge>{t('profiles.active')}</Badge>}
        <span className="text-xs text-muted-foreground">
          {t('profiles.modCount', { count: profile.mods.length })} · {createdOn}
        </span>

        <div className="ml-auto flex gap-1">
          <Button size="sm" disabled={active || busy} onClick={onApply}>
            {applying ? <Spinner className="size-4" /> : <Play className="size-4" />}
            {t(applying ? 'profiles.applying' : 'profiles.apply')}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            title={t('profiles.rename')}
            onClick={() => setEditing(profile.name)}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            title={t('profiles.delete')}
            disabled={busy}
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {profile.mods.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('profiles.noMods')}</p>
      ) : (
        <ol className="flex flex-wrap gap-1 text-xs">
          {profile.mods.slice(0, PREVIEW).map((m, i) => (
            <li key={m.id}>
              <Badge variant="outline" title={m.name}>
                {i + 1}. {m.name}
              </Badge>
            </li>
          ))}
          {profile.mods.length > PREVIEW && (
            <li className="self-center text-muted-foreground">
              {t('profiles.more', { count: profile.mods.length - PREVIEW })}
            </li>
          )}
        </ol>
      )}
      {active && <p className="text-xs text-muted-foreground">{t('profiles.activeHint')}</p>}
    </Card>
  )
}
