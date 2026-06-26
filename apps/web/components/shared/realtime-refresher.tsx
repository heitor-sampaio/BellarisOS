'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Props {
  /** Tabelas a observar. Qualquer INSERT/UPDATE/DELETE chama router.refresh(). */
  tables: string[]
  /** Filtro opcional no formato "coluna=eq.valor" (PostgREST filter syntax). */
  filter?: string
}

/**
 * Drop-in em qualquer Server Component page: adiciona subscriptions Realtime
 * para as tabelas informadas e chama router.refresh() em qualquer mudança.
 *
 * Uso:
 *   <RealtimeRefresher tables={['products', 'branch_product_stock']} />
 */
export function RealtimeRefresher({ tables, filter }: Props) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    const channelName = `rt-${tables.join('-')}-${Math.random().toString(36).slice(2, 7)}`
    const channel = supabase.channel(channelName)

    for (const table of tables) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        () => router.refresh(),
      )
    }

    channel.subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [tables.join(','), filter, router])

  return null
}
