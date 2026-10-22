import { app } from 'electron'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { COLOR_SLOTS, COLOR_SLOT_IDS, type ColorTarget, type InterfaceColors } from '../types'
import { VpkReader } from './vpk'

/** Cartella degli stili Panorama dentro i VPK. */
const STYLES_PREFIX = 'panorama/styles/'

/** Stato del VPK dei colori, salvato in `userData/interface-colors.json`. */
interface ColorsState {
  /** Nome del VPK in `addons`, `null` se non è installato. */
  file: string | null
}

const statePath = (): string => join(app.getPath('userData'), 'interface-colors.json')

export async function readColorsState(): Promise<ColorsState> {
  try {
    return { file: null, ...JSON.parse(await readFile(statePath(), 'utf8')) }
  } catch {
    return { file: null } // file assente o illeggibile: nessun VPK dei colori
  }
}

export async function writeColorsState(state: ColorsState): Promise<void> {
  await writeFile(statePath(), JSON.stringify(state, null, 2))
}

/** Cosa cambiare negli stili per i colori scelti, già normalizzato (`RRGGBB` maiuscolo). */
interface ColorPlan {
  /** Valore originale → nuovo valore, per le sostituzioni ovunque. */
  hex: Map<string, string>
  /** Nome della `@define` → nuovo valore. */
  defines: Map<string, string>
  /** `@define` che appartengono a un colore: le sostituzioni `hex` non le toccano. */
  claimed: Set<string>
  /** Percorso dello stile → regole a cui aggiungere `wash-color`. */
  wash: Map<string, { selector: string; color: string }[]>
}

function colorPlan(colors: InterfaceColors): ColorPlan {
  const plan: ColorPlan = {
    hex: new Map(),
    defines: new Map(),
    claimed: new Set(),
    wash: new Map()
  }
  for (const slot of COLOR_SLOT_IDS) {
    const target: ColorTarget = COLOR_SLOTS[slot]
    target.defines?.forEach((name) => plan.claimed.add(name))
    const value = colors[slot]?.replace('#', '').toUpperCase()
    if (!value || !/^[0-9A-F]{6}$/.test(value) || `#${value}` === target.original.toUpperCase())
      continue
    for (const original of target.hex ?? []) plan.hex.set(original.slice(1).toUpperCase(), value)
    for (const name of target.defines ?? []) plan.defines.set(name, value)
    for (const { style, selector } of target.wash ?? []) {
      if (!plan.wash.has(style)) plan.wash.set(style, [])
      plan.wash.get(style)!.push({ selector, color: value })
    }
  }
  return plan
}

/** `true` se almeno un colore è diverso dall'originale. */
export function hasCustomColors(colors: InterfaceColors): boolean {
  const plan = colorPlan(colors)
  return plan.hex.size + plan.defines.size + plan.wash.size > 0
}

const HEX = /#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?(?![0-9a-fA-F])/g

/** Applica il piano al CSS di uno stile; restituisce il testo invariato se non c'è nulla da fare. */
function patchCss(css: string, style: string, plan: ColorPlan): string {
  const recolor = (text: string, to: (rgb: string) => string | undefined): string =>
    text.replace(HEX, (match, rgb: string, alpha = '') => {
      const color = to(rgb.toUpperCase())
      return color ? `#${color}${alpha}` : match
    })

  // le `@define` di un colore prendono il suo valore; le altre e il resto del testo seguono `hex`
  let out = css.replace(
    /(@define\s+([\w-]+)\s*:[^;]*;)|#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?(?![0-9a-fA-F])/g,
    (match, define: string | undefined, name: string | undefined) => {
      if (define && name) {
        const value = plan.defines.get(name)
        if (value) return recolor(define, () => value)
        if (plan.claimed.has(name)) return define
      }
      return recolor(match, (rgb) => plan.hex.get(rgb))
    }
  )

  for (const { selector, color } of plan.wash.get(style) ?? []) {
    // solo la regola con esattamente quel selettore, all'inizio del testo o dopo un'altra regola
    out = out.replace(
      new RegExp(`(^|\\})(${escapeRegExp(selector)}\\{)`),
      (_, before: string, rule: string) => `${before}${rule}wash-color:#${color};`
    )
  }
  return out
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Riporta `css` alla lunghezza `length`: gli spazi dopo i due punti delle dichiarazioni
 * (`color: red` → `color:red`, che Panorama accetta) pagano i caratteri aggiunti, gli spazi in
 * fondo riempiono quelli tolti. `null` se non bastano gli spazi da togliere.
 */
function fitLength(css: string, length: number): string | null {
  let extra = css.length - length
  if (extra < 0) return css + ' '.repeat(-extra)
  let out = css
  while (extra > 0) {
    const at = out.lastIndexOf(': ')
    if (at < 0) return null
    out = out.slice(0, at + 1) + out.slice(at + 2)
    extra--
  }
  return out
}

/**
 * Applica il piano al blocco DATA di uno stile compilato (`.vcss_c`). Il blocco contiene un CRC32
 * (4 byte), il numero delle dipendenze (2 byte), le dipendenze e poi il CSS in chiaro. Il CSS
 * riscritto ha sempre la stessa lunghezza dell'originale (vedi `fitLength`), così le dimensioni
 * e gli offset della risorsa non cambiano: è la modifica provata nel gioco.
 * Restituisce `null` se lo stile non cambia.
 */
function patchStyle(resource: Buffer, style: string, plan: ColorPlan): Buffer | null {
  const tableStart = 8 + resource.readUInt32LE(8)
  for (let i = 0; i < resource.readUInt32LE(12); i++) {
    const block = tableStart + i * 12
    if (resource.toString('ascii', block, block + 4) !== 'DATA') continue
    const start = block + 4 + resource.readUInt32LE(block + 4)
    const end = start + resource.readUInt32LE(block + 8)
    let p = start + 6
    for (let d = 0; d < resource.readUInt16LE(start + 4); d++) p = resource.indexOf(0, p) + 1 + 8

    // latin1 conserva ogni byte: un carattere è un byte, quindi le lunghezze coincidono
    const css = resource.toString('latin1', p, end)
    const patched = patchCss(css, style, plan)
    if (patched === css) return null
    const fitted = fitLength(patched, css.length)
    if (fitted === null) return null
    const out = Buffer.from(resource)
    out.write(fitted, p, 'latin1')
    return out
  }
  return null
}

/** VPK attivi in `addons` (`pakNN_dir.vpk`), dalla priorità più alta (indice più basso). */
async function addonVpks(addons: string): Promise<string[]> {
  return (await readdir(addons).catch(() => []))
    .filter((f) => /^pak\d{2}_dir\.vpk$/i.test(f))
    .sort()
}

/**
 * Stili ricolorati per il VPK dei colori, che in `addons` si chiamerà `ownFile`. Ogni stile parte
 * dalla versione che il gioco caricherebbe senza i colori: quella di una mod con priorità più
 * bassa, se ne contiene una, altrimenti quella del gioco. Gli stili che una mod con priorità più
 * alta sovrascrive comunque vengono saltati e i file di quelle mod finiscono in `conflicts`.
 */
export async function buildColorStyles(
  citadel: string,
  colors: InterfaceColors,
  ownFile: string
): Promise<{ styles: Map<string, Buffer>; conflicts: string[] }> {
  const plan = colorPlan(colors)
  const styles = new Map<string, Buffer>()
  const conflicts = new Set<string>()
  if (!hasCustomColors(colors)) return { styles, conflicts: [] }

  const addons = join(citadel, 'addons')
  const sources: { file: string; vpk: VpkReader }[] = []
  for (const file of await addonVpks(addons)) {
    if (file.toLowerCase() === ownFile.toLowerCase()) continue
    // un VPK illeggibile non deve impedire di cambiare i colori
    const vpk = await VpkReader.open(join(addons, file)).catch(() => null)
    if (vpk) sources.push({ file, vpk })
  }
  const game = await VpkReader.open(join(citadel, 'pak01_dir.vpk'))

  for (const path of game.paths()) {
    if (!path.startsWith(STYLES_PREFIX) || !path.endsWith('.vcss_c')) continue
    const override = sources.find((s) => s.vpk.has(path))
    const source = override?.vpk ?? game
    const patched = patchStyle(await source.read(path), path, plan)
    if (!patched) continue
    if (override && override.file.toLowerCase() < ownFile.toLowerCase()) {
      conflicts.add(override.file)
      continue
    }
    styles.set(path, patched)
  }
  return { styles, conflicts: [...conflicts] }
}
