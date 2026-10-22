import { useMemo } from 'react'
import { useSettings } from './useSettings'
import {
  detectLanguage,
  translate,
  type Language,
  type MessageKey,
  type MessageParams
} from '../../../mission/i18n'

export interface I18n {
  /** Lingua in uso: quella scelta nelle impostazioni o quella del sistema. */
  language: Language
  /** Testo tradotto, con i segnaposto `{nome}` sostituiti da `params`. */
  t: (key: MessageKey, params?: MessageParams) => string
  /** Numero formattato secondo la lingua (separatore delle migliaia). */
  formatNumber: (n: number) => string
  /** Data (senza ora) formattata secondo la lingua. */
  formatDate: (date: string | Date) => string
  /** Ora formattata secondo la lingua. */
  formatTime: (date: string | Date) => string
}

/** Traduzioni e formattazione nella lingua corrente. */
export function useI18n(): I18n {
  const { settings } = useSettings()
  const language = settings?.language ?? detectLanguage(navigator.language)

  return useMemo(
    () => ({
      language,
      t: (key, params) => translate(language, key, params),
      formatNumber: (n) => n.toLocaleString(language),
      formatDate: (date) => new Date(date).toLocaleDateString(language),
      formatTime: (date) => new Date(date).toLocaleTimeString(language)
    }),
    [language]
  )
}
