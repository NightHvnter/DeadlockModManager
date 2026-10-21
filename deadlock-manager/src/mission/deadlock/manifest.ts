import { join } from "node:path";
import { app } from "electron"
import { readFile, writeFile } from "node:fs/promises";

type Manifest = Record<string, string[]>

const manifestPath = () => join(app.getPath('userData'), 'installed.json')

export async function readManifest(): Promise<Manifest> {
  try {
    return JSON.parse(await readFile(manifestPath(), 'utf8'))
  } catch {
    return {} // file assente o illeggibile: nessuna mod installata
  }
}

export async function writeManifest(manifest: Manifest) {
  await writeFile(manifestPath(), JSON.stringify(manifest, null, 2))
}

/** Id delle mod installate, utile per mostrare "Installata" nell'interfaccia. */
export async function getInstalledModIds(): Promise<string[]> {
  return Object.keys(await readManifest())
}