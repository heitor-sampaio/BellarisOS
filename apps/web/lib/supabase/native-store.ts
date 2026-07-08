const SESSION_KEY = 'supabase-session'

type StoredSession = { access_token: string; refresh_token: string }

async function isNative(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  try {
    const { Capacitor } = await import('@capacitor/core')
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

export const nativeStore = {
  async save(session: StoredSession): Promise<void> {
    if (!(await isNative())) return
    try {
      const { Preferences } = await import('@capacitor/preferences')
      await Preferences.set({ key: SESSION_KEY, value: JSON.stringify(session) })
    } catch { /* ignore */ }
  },

  async load(): Promise<StoredSession | null> {
    if (!(await isNative())) return null
    try {
      const { Preferences } = await import('@capacitor/preferences')
      const { value } = await Preferences.get({ key: SESSION_KEY })
      if (!value) return null
      return JSON.parse(value) as StoredSession
    } catch {
      return null
    }
  },

  async clear(): Promise<void> {
    if (!(await isNative())) return
    try {
      const { Preferences } = await import('@capacitor/preferences')
      await Preferences.remove({ key: SESSION_KEY })
    } catch { /* ignore */ }
  },
}
