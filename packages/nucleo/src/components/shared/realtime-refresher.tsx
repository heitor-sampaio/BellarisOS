'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase/client'
import { juntarEmRajada } from '../../lib/sinais-em-rajada'

/**
 * Os tópicos de `public.sinais` (migration 20261128200001). A sessão só lê
 * SINAIS (o Heitor, 19/11, "vai na 2"; CLAUDE.md §4): a tela assina o tópico,
 * sem conteúdo nenhum, e recarrega pelo servidor, que aplica a permissão, o
 * escopo e a abrangência.
 */
export type TopicoDeSinal =
  | 'agenda' | 'estoque' | 'procedimentos' | 'unidades' | 'equipe' | 'clientes'
  | 'pacotes' | 'planos' | 'inbox' | 'campanhas' | 'avisos'

/** O filtro do Realtime para os tópicos: `topico=in.(a,b)`. */
export function filtroDosTopicos(topicos: readonly TopicoDeSinal[]): string {
  return `topico=in.(${[...topicos].sort().join(',')})`
}

/**
 * Chama `aoMudar` a cada sinal de um dos tópicos (a equipe recebe os da rede
 * dela; cada pessoa, os avisos dela — a RLS de `sinais` decide). Para o
 * componente que recarrega por conta própria (o inbox, o sino, os modais);
 * a página inteira usa o `<RealtimeRefresher topicos>`.
 *
 * `esperaMs` junta a rajada (`juntarEmRajada`): a tela vai ao servidor uma
 * vez por janela, por mais sinais que cheguem nela.
 */
export function useSinais(topicos: readonly TopicoDeSinal[], aoMudar: () => void, ligado = true, esperaMs = 0) {
  useSinalFiltrado(filtroDosTopicos(topicos), aoMudar, ligado, esperaMs)
}

/** O filtro do Realtime do sinal de UMA conversa: `chave=eq.c:<id>`. */
export function filtroDaConversa(conversationId: string): string {
  return `chave=eq.c:${conversationId}`
}

/**
 * O sinal de UMA conversa (a chave `c:<id>`): a mensagem nova, o recibo do
 * WhatsApp, a conversa ou a oportunidade dela que mudou. Só a tela com a
 * conversa aberta assina — o recibo de uma não acorda o inbox da rede inteira
 * (19/11, ao Heitor: "o inbox que pode ter muita atualização").
 */
export function useSinalDaConversa(conversationId: string | null, aoMudar: () => void, esperaMs = 0) {
  useSinalFiltrado(conversationId ? filtroDaConversa(conversationId) : '', aoMudar, !!conversationId, esperaMs)
}

function useSinalFiltrado(filtro: string, aoMudar: () => void, ligado: boolean, esperaMs: number) {
  const ref = useRef(aoMudar)
  useEffect(() => { ref.current = aoMudar }, [aoMudar])

  useEffect(() => {
    if (!ligado || !filtro) return
    const supabase = createClient()
    const rajada = juntarEmRajada(() => ref.current(), esperaMs)
    // Nome único por montagem: o cliente do navegador é um só, e o canal com
    // o mesmo nome de um que ainda está saindo recusaria os callbacks.
    const channel = supabase.channel(`sinais-${filtro}-${Math.random().toString(36).slice(2, 7)}`)
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'sinais', filter: filtro }, () => rajada.chamar())
    channel.subscribe()
    return () => { rajada.cancelar(); supabase.removeChannel(channel) }
  }, [filtro, ligado, esperaMs])
}

interface Props {
  /** Tabelas de sinal antigas (`*_sinais`) a observar. */
  tables?: string[]
  /** Os tópicos de `public.sinais` a observar. */
  topicos?: TopicoDeSinal[]
  /** Filtro opcional das `tables` no formato "coluna=eq.valor" (PostgREST filter syntax). */
  filter?: string
  /** Janela de agrupamento dos eventos. */
  debounceMs?: number
}

/**
 * Drop-in em qualquer Server Component page: assina os SINAIS informados e
 * chama router.refresh() quando um deles muda.
 *
 * Uso:
 *   <RealtimeRefresher topicos={['estoque']} tables={['financeiro_sinais']} />
 *
 * O navegador não assina tabela de conteúdo (o Heitor, 19/11, "vai na 2"):
 * só os sinais — `public.sinais` (os tópicos) e as `*_sinais` que já
 * existiam. A página recarrega pelo servidor.
 *
 * `router.refresh()` re-executa a página inteira no servidor — TODAS as queries
 * dela, não só a da tabela que mudou. Em `/admin/reports` são vários sinais
 * observados ao mesmo tempo: sem cuidado, um único checkout dispara vários
 * re-renders completos por aba aberta. Daí as duas proteções abaixo.
 *
 * Desenha só um marcador escondido (`data-tempo-real`, `data-estado`): o canal
 * sobe DEPOIS da hidratação, e o que muda antes disso não chega. Quem precisa
 * saber se a tela já escuta (o E2E) espera `data-estado="ligado"` em vez de
 * chutar um tempo. "Ligado" é a confirmação do SERVIDOR de que a escuta no
 * Postgres subiu (a mensagem `system` do postgres_changes) — não o SUBSCRIBED
 * do canal, que chega antes: o que muda nesse meio não é entregue.
 */
export function RealtimeRefresher({ tables = [], topicos = [], filter, debounceMs = 500 }: Props) {
  const router = useRouter()
  const key = tables.join(',')
  const filtroDeTopicos = topicos.length ? filtroDosTopicos(topicos) : ''
  const marca = [key, ...[...topicos].sort()].filter(Boolean).join(',')
  const [ligado, setLigado] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    const channelName = `rt-${marca}-${Math.random().toString(36).slice(2, 7)}`
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
    if (filtroDeTopicos) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'sinais', filter: filtroDeTopicos }, agendar)
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
  }, [key, filtroDeTopicos, marca, filter, router, debounceMs])

  return <span hidden data-tempo-real={marca} data-estado={ligado ? 'ligado' : 'aguardando'} />
}
