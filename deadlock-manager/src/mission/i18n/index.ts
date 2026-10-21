import { de } from './locales/de'
import { en } from './locales/en'
import { es } from './locales/es'
import { fr } from './locales/fr'
import { it, type MessageKey, type Messages } from './locales/it'

export type { MessageKey }

/** Lingue disponibili, con il loro nome nella lingua stessa. */
export const LANGUAGES = {
  it: 'Italiano',
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch'
} as const

export type Language = keyof typeof LANGUAGES
export const LANGUAGE_IDS = Object.keys(LANGUAGES) as Language[]

const MESSAGES: Record<Language, Messages> = { it, en, es, fr, de }

/** Parametri sostituiti nei segnaposto `{nome}` dei testi. */
export type MessageParams = Record<string, string | number>

/** Testo `key` nella lingua `language`, con i segnaposto `{nome}` sostituiti da `params`. */
export function translate(language: Language, key: MessageKey, params?: MessageParams): string {
  const text = MESSAGES[language][key] ?? it[key] ?? key
  return params ? text.replace(/\{(\w+)\}/g, (m, name) => String(params[name] ?? m)) : text
}

/** Lingua supportata corrispondente a un codice come `it-IT` o `en`; inglese se non è supportata. */
export function detectLanguage(locale: string | undefined): Language {
  const code = locale?.slice(0, 2).toLowerCase()
  return code && code in LANGUAGES ? (code as Language) : 'en'
}

/** Errore con un testo traducibile: il messaggio viene tradotto quando arriva all'utente. */
export class AppError extends Error {
  constructor(
    public readonly key: MessageKey,
    public readonly params?: MessageParams
  ) {
    super(translate('it', key, params))
  }
}

/** Messaggio di un errore qualsiasi nella lingua `language`. */
export function describeError(e: unknown, language: Language): string {
  if (e instanceof AppError) return translate(language, e.key, e.params)
  if (e instanceof Error) return e.message
  return translate(language, 'error.unknown')
}
