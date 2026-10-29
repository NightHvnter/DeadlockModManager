/** Mod di un profilo, con il nome salvato per mostrarla anche se non è più installata. */
export interface ProfileMod {
  id: string
  name: string
}

/**
 * Profilo di mod: le mod da tenere attive, nell'ordine di caricamento (la prima ha la priorità).
 * Applicandolo, le altre mod installate vengono disattivate.
 */
export interface ModProfile {
  id: string
  name: string
  createdAt: string
  mods: ProfileMod[]
}

/** Profili salvati in `userData/profiles.json`. */
export interface ProfilesState {
  /** Profilo in uso, che segue da solo le modifiche alle mod; `null` se nessuno. */
  activeId: string | null
  profiles: ModProfile[]
}

/** Esito dell'applicazione di un profilo. */
export interface ApplyProfileResult {
  profile: ModProfile
  /** Mod del profilo che non sono installate e quindi non si sono potute attivare. */
  missing: ProfileMod[]
}
