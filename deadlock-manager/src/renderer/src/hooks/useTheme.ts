import { createContext, useContext } from 'react'

/** Identificatori dei temi disponibili. Per aggiungerne uno: qui, in `THEMES` e in `main.css`. */
export const THEME_IDS = ['light', 'dark', 'system', 'ocean', 'forest'] as const
export type Theme = (typeof THEME_IDS)[number]

/** Il nome visualizzato di ogni tema è nei testi tradotti, alla chiave `theme.<id>`. */
interface ThemeDef {
  /** Tema di partenza dei temi custom: decide se attivare la classe `dark`. */
  base?: 'light' | 'dark'
}

export const THEMES: Record<Theme, ThemeDef> = {
  light: {},
  dark: {},
  system: {},
  ocean: { base: 'dark' },
  forest: { base: 'dark' }
}

export interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

/** Restituisce il tema corrente e la funzione per cambiarlo. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme va usato dentro ThemeProvider')
  return ctx
}
