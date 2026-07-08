const SESSION_KEY = 'supabase-session'

type StoredSession = { access_token: string; refresh_token: string }

// Lazy-loads @capacitor/preferences only on native platforms (Android + iOS).
// Returns null silently on web browser — no-op in that context.
async function getPrefs() {
  if (typeof window === 'undefined') return null
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (!Capacitor.isNativePlatform()) return null
    const { Preferences } = await import('@capacitor/preferences')
    return Preferences
  } catch {
    return null
  }
}

export const nativeStore = {
  async save(session: StoredSession): Promise<void> {
    const prefs = await getPrefs()
    if (!prefs) return
    await prefs.set({ key: SESSION_KEY, value: JSON.stringify(session) })
  },

  async load(): Promise<StoredSession | null> {
    const prefs = await getPrefs()
    if (!prefs) return null
    try {
      const { value } = await prefs.get({ key: SESSION_KEY })
      if (!value) return null
      return JSON.parse(value) as StoredSession
    } catch {
      return null
    }
  },

  async clear(): Promise<void> {
    const prefs = await getPrefs()
    if (!prefs) return
    await prefs.remove({ key: SESSION_KEY })
  },
}
