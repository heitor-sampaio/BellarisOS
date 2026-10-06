'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase/client'

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
 *
 * Desenha só um marcador escondido (`data-tempo-real`, `data-estado`): o canal
 * sobe DEPOIS da hidratação, e o que muda antes disso não chega. Quem precisa
 * saber se a tela já escuta (o E2E) espera `data-estado="ligado"` em vez de
 * chutar um tempo. "Ligado" é a confirmação do SERVIDOR de que a escuta no
 * Postgres subiu (a mensagem `system` do postgres_changes) — não o SUBSCRIBED
 * do canal, que chega antes: o que muda nesse meio não é entregue.
 */
export function RealtimeRefresher({ tables, filter, debounceMs = 500 }: Props) {
  const router = useRouter()
  const key = tables.join(',')
  const [ligado, setLigado] = useState(false)

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

    // As tabelas saem da `key`, não do array: o array é novo a cada render do
    // pai, e depender dele reassinaria o canal toda vez.
    for (const table of (key ? key.split(',') : [])) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        agendar,
      )
    }

    channel.on('system', {}, (msg: { extension?: string; status?: string }) => {
      if (msg?.extension === 'postgres_changes') setLigado(msg.status === 'ok')
    })
    channel.subscribe(status => { if (status !== 'SUBSCRIBED') setLigado(false) })
    document.addEventListener('visibilitychange', aoMudarVisibilidade)

    return () => {
      // Sem limpar o timer, um refresh agendado dispara depois de sair da página.
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', aoMudarVisibilidade)
      supabase.removeChannel(channel)
      setLigado(false)
    }
  }, [key, filter, router, debounceMs])

  return <span hidden data-tempo-real={key} data-estado={ligado ? 'ligado' : 'aguardando'} />
}
