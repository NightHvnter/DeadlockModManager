import { join } from "node:path";
import { app } from "electron"
import { readFile, writeFile } from "node:fs/promises";
import type { InstalledMod } from "../types";

type Manifest = Record<string, InstalledMod>

const manifestPath = (): string => join(app.getPath('userData'), 'installed.json')

/** Cartella in cui finiscono i file delle mod disattivate (una sottocartella per mod). */
export const disabledDir = (modId: string): string =>
  join(app.getPath('userData'), 'disabled', modId)

export async function readManifest(): Promise<Manifest> {
  let raw: Record<string, InstalledMod | string[]>
  try {
    raw = JSON.parse(await readFile(manifestPath(), 'utf8'))
  } catch {
    return {} // file assente o illeggibile: nessuna mod installata
  }
  // Le versioni precedenti salvavano solo l'elenco dei file
  const manifest: Manifest = {}
  for (const [id, entry] of Object.entries(raw)) {
    manifest[id] = Array.isArray(entry)
      ? {
          id,
          files: entry,
          enabled: true,
          installedAt: null,
          fileName: null,
          name: id,
          author: '',
          category: '',
          hero: null,
          image: null
        }
      : entry
  }
  return manifest
}

export async function writeManifest(manifest: Manifest): Promise<void> {
  await writeFile(manifestPath(), JSON.stringify(manifest, null, 2))
}

/** Id delle mod installate, utile per mostrare "Installata" nell'interfaccia. */
export async function getInstalledModIds(): Promise<string[]> {
  return Object.keys(await readManifest())
}

/** Mod installate, dalla più recente. */
export async function getInstalledMods(): Promise<InstalledMod[]> {
  return Object.values(await readManifest()).sort((a, b) =>
    (b.installedAt ?? '').localeCompare(a.installedAt ?? '')
  )
}
