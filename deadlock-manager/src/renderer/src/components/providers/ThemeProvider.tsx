import { useEffect, useState } from 'react'
import { ThemeContext, THEMES, type Theme } from '@/hooks/useTheme'

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
