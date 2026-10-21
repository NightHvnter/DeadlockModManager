import { createContext, useContext, useEffect, useState } from 'react'

/** Identificatori dei temi disponibili. Per aggiungerne uno: qui, in `THEMES` e in `main.css`. */
export const THEME_IDS = ['light', 'dark', 'system', 'ocean', 'forest'] as const
export type Theme = (typeof THEME_IDS)[number]

interface ThemeDef {
  label: string
  /** Tema di partenza dei temi custom: decide se attivare la classe `dark`. */
  base?: 'light' | 'dark'
}

export const THEMES: Record<Theme, ThemeDef> = {
  light: { label: 'Chiaro' },
  dark: { label: 'Scuro' },
  system: { label: 'Sistema' },
  ocean: { label: 'Oceano', base: 'dark' },
  forest: { label: 'Foresta', base: 'dark' }
}

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)
const STORAGE_KEY = 'theme'

/** Gestisce il tema dell'app e lo salva in `localStorage`. */
export function ThemeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved && saved in THEMES ? (saved as Theme) : 'system'
  })

  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      const base = THEMES[theme].base
      const dark = base
        ? base === 'dark'
        : theme === 'dark' || (theme === 'system' && media.matches)
      root.classList.toggle('dark', dark)
      // rimuove le classi theme-* precedenti e applica quella del tema custom
      root.classList.forEach((c) => c.startsWith('theme-') && root.classList.remove(c))
      if (base) root.classList.add(`theme-${theme}`)
    }
    apply()
    if (theme !== 'system') return
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  const setTheme = (t: Theme): void => {
    localStorage.setItem(STORAGE_KEY, t)
    setThemeState(t)
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

/** Restituisce il tema corrente e la funzione per cambiarlo. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme va usato dentro ThemeProvider')
  return ctx
}