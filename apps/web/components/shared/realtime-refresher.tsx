'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Props {
  /** Tabelas a observar. Qualquer INSERT/UPDATE/DELETE chama router.refresh(). */
  tables: string[]
  /** Filtro opcional no formato "coluna=eq.valor" (PostgREST filter syntax). */
  filter?: string
  /** Janela de agrupamento dos eventos. */
  debounceMs?: number
}

/**
 * Drop-in em qualquer Server Component page: adiciona subscriptions Realtime
 * para as tabelas informadas e chama router.refresh() em qualquer mudança.
 *
 * Uso:
 *   <RealtimeRefresher tables={['products', 'branch_product_stock']} />
 *
 * `router.refresh()` re-executa a página inteira no servidor — TODAS as queries
 * dela, não só a da tabela que mudou. Em `/admin/reports` são 9 tabelas
 * observadas ao mesmo tempo: sem cuidado, um único checkout dispara vários
 * re-renders completos por aba aberta. Daí as duas proteções abaixo.
 */
export function RealtimeRefresher({ tables, filter, debounceMs = 500 }: Props) {
  const router = useRouter()
  const key = tables.join(',')

  useEffect(() => {
    const supabase = createClient()
    const channelName = `rt-${key}-${Math.random().toString(36).slice(2, 7)}`
    const channel = supabase.channel(channelName)

    let timer: ReturnType<typeof setTimeout> | null = null
    let pendente = false

    function refreshAgora() {
      timer = null
      pendente = false
      router.refresh()
    }

    function agendar() {
      // 1. Aba em segundo plano não re-renderiza. Uma aba esquecida aberta o dia
      //    todo re-executaria as queries a cada evento sem ninguém olhando; fica
      //    marcada como pendente e atualiza quando voltar ao primeiro plano.
      if (document.visibilityState === 'hidden') {
        pendente = true
        return
      }
      // 2. Debounce: concluir um atendimento escreve em appointments,
      //    financial_transactions, commissions e stock_movements na sequência.
      //    Sem agrupar, isso vira quatro re-renders da mesma página.
      if (timer) clearTimeout(timer)
      timer = setTimeout(refreshAgora, debounceMs)
    }

    function aoMudarVisibilidade() {
      if (document.visibilityState === 'visible' && pendente) agendar()
    }

    for (const table of tables) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        agendar,
      )
    }

    channel.subscribe()
    document.addEventListener('visibilitychange', aoMudarVisibilidade)

    return () => {
      // Sem limpar o timer, um refresh agendado dispara depois de sair da página.
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', aoMudarVisibilidade)
      supabase.removeChannel(channel)
    }
  }, [key, filter, router, debounceMs])

  return null
}
