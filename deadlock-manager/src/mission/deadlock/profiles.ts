import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { AppError } from '../i18n'
import type { ApplyProfileResult, ModProfile, ProfileMod, ProfilesState } from '../types'
import { ManageMods } from './ManageMods'
import { readManifest } from './manifest'

const profilesPath = (): string => join(app.getPath('userData'), 'profiles.json')

export async function readProfiles(): Promise<ProfilesState> {
  try {
    const raw = JSON.parse(await readFile(profilesPath(), 'utf8'))
    return {
      activeId: raw?.activeId ?? null,
      profiles: Array.isArray(raw?.profiles) ? raw.profiles : []
    }
  } catch {
    return { activeId: null, profiles: [] } // file assente o illeggibile: nessun profilo
  }
}

async function writeProfiles(state: ProfilesState): Promise<void> {
  await writeFile(profilesPath(), JSON.stringify(state, null, 2))
}

/** Mod attive adesso, nell'ordine di caricamento. */
async function currentMods(): Promise<ProfileMod[]> {
  return (await ManageMods.getLoadOrder()).map((e) => ({ id: e.id, name: e.name }))
}

/**
 * Aggiorna il profilo attivo con le mod attive adesso e il loro ordine. Le mod del profilo che
 * non sono più installate restano in fondo, così si possono reinstallare (per esempio da un
 * modpack). Va chiamata dopo ogni modifica alle mod; non scrive nulla se il profilo non cambia.
 */
export async function syncActiveProfile(): Promise<void> {
  const state = await readProfiles()
  const profile = state.profiles.find((p) => p.id === state.activeId)
  if (!profile) return
  const manifest = await readManifest()
  const mods = [...(await currentMods()), ...profile.mods.filter((m) => !manifest[m.id])]
  if (JSON.stringify(mods) === JSON.stringify(profile.mods)) return
  profile.mods = mods
  await writeProfiles(state)
}

/**
 * Crea un profilo con le mod attive adesso (che diventa il profilo in uso) oppure vuoto.
 * @param fromCurrent `true` per partire dalle mod attive, `false` per un profilo vuoto
 */
export async function createProfile(name: string, fromCurrent: boolean): Promise<ProfilesState> {
  const state = await readProfiles()
  const profile: ModProfile = {
    id: randomUUID(),
    name: name.trim() || 'Profilo',
    createdAt: new Date().toISOString(),
    mods: fromCurrent ? await currentMods() : []
  }
  state.profiles.push(profile)
  if (fromCurrent) state.activeId = profile.id
  await writeProfiles(state)
  return state
}

export async function renameProfile(id: string, name: string): Promise<ProfilesState> {
  const state = await readProfiles()
  const profile = state.profiles.find((p) => p.id === id)
  if (!profile) throw new AppError('error.profileNotFound')
  profile.name = name.trim() || profile.name
  await writeProfiles(state)
  return state
}

/** Elimina un profilo; le mod restano come sono. */
export async function deleteProfile(id: string): Promise<ProfilesState> {
  const state = await readProfiles()
  state.profiles = state.profiles.filter((p) => p.id !== id)
  if (state.activeId === id) state.activeId = null
  await writeProfiles(state)
  return state
}

/**
 * Applica un profilo: attiva le sue mod installate, disattiva tutte le altre e imposta l'ordine
 * di caricamento del profilo. Durante l'applicazione nessun profilo è attivo, così i passaggi
 * intermedi non lo modificano; alla fine diventa il profilo in uso, anche se un passaggio è
 * fallito (in quel caso prende lo stato reale delle mod).
 */
export async function applyProfile(id: string, gamePath: string): Promise<ApplyProfileResult> {
  const state = await readProfiles()
  const profile = state.profiles.find((p) => p.id === id)
  if (!profile) throw new AppError('error.profileNotFound')
  await writeProfiles({ ...state, activeId: null })

  const manifest = await readManifest()
  const wanted = profile.mods.filter((m) => manifest[m.id])
  const missing = profile.mods.filter((m) => !manifest[m.id])
  const wantedIds = new Set(wanted.map((m) => m.id))
  try {
    for (const entry of Object.values(manifest)) {
      const enable = wantedIds.has(entry.id)
      if (entry.enabled !== enable) await ManageMods.setEnabled(entry.id, enable, gamePath)
    }
    if (wanted.length > 0)
      await ManageMods.setLoadOrder(
        wanted.map((m) => m.id),
        gamePath
      )
  } finally {
    await writeProfiles({ ...(await readProfiles()), activeId: profile.id })
    await syncActiveProfile()
  }
  const updated = (await readProfiles()).profiles.find((p) => p.id === id) ?? profile
  return { profile: updated, missing }
}
