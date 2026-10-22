import { AppError } from '../i18n'

/*
 * Modifica di `game/citadel/gameinfo.gi` perché Deadlock carichi le mod da `citadel/addons`.
 *
 * Nel blocco `SearchPaths`, se mancano le chiavi `Mod` e `Write` il motore usa il PRIMO percorso
 * `Game` come cartella principale del gioco e come cartella di scrittura (lo spiega il commento
 * di Valve nel file). L'attuale `gameinfo.gi` non ha né `Mod` né `Write`: aggiungere solo
 * `Game citadel/addons` in cima rende `addons` la cartella principale e il gioco si blocca
 * ("Unable to read default keybinding configuration"). Come l'app ufficiale, quindi, prima di
 * `Game citadel` si aggiungono anche `Mod citadel` e `Write citadel`: le mod in `addons` hanno la
 * priorità sui file del gioco, ma la cartella principale resta `citadel`.
 *
 * Le righe aggiunte sono racchiuse tra due commenti, così si possono riconoscere e togliere.
 */

const MARKER_START = '// Deadlock Mod Manager - start'
const MARKER_END = '// Deadlock Mod Manager - end'
const INDENT = '\t\t\t'

/** Riga `Game citadel/addons`, anche quella scritta senza marcatori dalle versioni precedenti. */
const ADDONS_LINE = /^[ \t]*Game[ \t]+citadel\/addons[ \t]*$/
const CITADEL_LINE = /^[ \t]*Game[ \t]+citadel[ \t]*$/

/** Righe del blocco `SearchPaths` (indici `start`/`end` delle righe con `{` e `}`). */
function searchPathsBlock(lines: string[]): { start: number; end: number } {
  const header = lines.findIndex((l) => /^\s*SearchPaths\b/.test(l))
  if (header < 0) throw new AppError('error.searchPaths')
  const start = lines.findIndex((l, i) => i >= header && l.includes('{'))
  const end = lines.findIndex((l, i) => i > start && l.includes('}'))
  if (start < 0 || end < 0) throw new AppError('error.searchPaths')
  return { start, end }
}

const splitLines = (text: string): string[] => text.split(/\r?\n/)
const eolOf = (text: string): string => (text.includes('\r\n') ? '\r\n' : '\n')

/**
 * `true` se `gameinfo.gi` carica le mod correttamente: `citadel/addons` viene prima di
 * `citadel` e le chiavi `Mod` e `Write` sono presenti, così `addons` non diventa la cartella
 * principale del gioco.
 */
export function isPatched(text: string): boolean {
  const lines = splitLines(text)
  const { start, end } = searchPathsBlock(lines)
  const block = lines.slice(start + 1, end)
  const addons = block.findIndex((l) => ADDONS_LINE.test(l))
  const citadel = block.findIndex((l) => CITADEL_LINE.test(l))
  const hasKey = (key: string): boolean =>
    block.some((l) => new RegExp(`^[ \\t]*${key}[ \\t]+\\S`).test(l))
  return addons >= 0 && citadel > addons && hasKey('Mod') && hasKey('Write')
}

/** Il file senza le righe aggiunte dall'app (incluse quelle senza marcatori delle versioni precedenti). */
export function unpatch(text: string): string {
  const lines = splitLines(text)
  const out: string[] = []
  let inside = false
  for (const line of lines) {
    if (line.includes(MARKER_START)) inside = true
    else if (line.includes(MARKER_END)) inside = false
    else if (!inside && !ADDONS_LINE.test(line)) out.push(line)
  }
  return out.join(eolOf(text))
}

/**
 * Aggiunge le righe che caricano le mod subito prima di `Game citadel`, mantenendo i fine riga
 * del file. Restituisce il file modificato e quello originale senza le righe dell'app (per il
 * backup).
 */
export function patch(text: string): { patched: string; original: string } {
  const original = unpatch(text)
  const lines = splitLines(original)
  const { start, end } = searchPathsBlock(lines)
  const block = lines.slice(start + 1, end)
  const citadel = block.findIndex((l) => CITADEL_LINE.test(l))
  if (citadel < 0) throw new AppError('error.searchPaths')

  const hasKey = (key: string): boolean =>
    block.some((l) => new RegExp(`^[ \\t]*${key}[ \\t]+\\S`).test(l))
  const added = [
    `${INDENT}${MARKER_START}`,
    `${INDENT}Game\t\t\t\tcitadel/addons`,
    // le chiavi si aggiungono solo se Valve non le ha già messe
    ...(hasKey('Mod') ? [] : [`${INDENT}Mod\t\t\t\t\tcitadel`]),
    ...(hasKey('Write') ? [] : [`${INDENT}Write\t\t\t\tcitadel`]),
    `${INDENT}${MARKER_END}`
  ]
  lines.splice(start + 1 + citadel, 0, ...added)
  return { patched: lines.join(eolOf(text)), original }
}
