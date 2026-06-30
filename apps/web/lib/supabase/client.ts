'use client'

import { createBrowserClient } from '@supabase/ssr'

function getConfig(): { url: string; key: string } {
  // Em produção o servidor injeta os valores via window globals (layout.tsx),
  // evitando dependência de build-time inlining de NEXT_PUBLIC_* vars.
  if (typeof window !== 'undefined') {
    const w = window as unknown as Record<string, string>
    if (w.__SUPABASE_URL__ && w.__SUPABASE_KEY__) {
      return { url: w.__SUPABASE_URL__, key: w.__SUPABASE_KEY__ }
    }
  }
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  }
}

export function createClient() {
  const { url, key } = getConfig()
  return createBrowserClient(url, key)
}
