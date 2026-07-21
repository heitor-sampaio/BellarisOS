import { createClient, type SupportedStorage } from '@supabase/supabase-js'

// Persiste a sessão no chrome.storage.local (a extensão não tem cookies do app).
const chromeStorage: SupportedStorage = {
  getItem: (key) =>
    new Promise((resolve) => chrome.storage.local.get(key, (r) => resolve(r[key] ?? null))),
  setItem: (key, value) =>
    new Promise((resolve) => chrome.storage.local.set({ [key]: value }, () => resolve())),
  removeItem: (key) =>
    new Promise((resolve) => chrome.storage.local.remove(key, () => resolve())),
}

const url  = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(url, anon, {
  auth: {
    storage: chromeStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})
