'use client'

import { useEffect, useEffectEvent } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/**
 * O novo agendamento pedido PELA URL (`?novo=1[&cliente=<id>]`) — a porta da
 * busca universal e da ficha do cliente (2026-10-08). Abre o modal da agenda
 * (com o cliente, quando vem) e tira os dois parâmetros da URL: recarregar a
 * página não o reabre. Quem não pode agendar só perde os parâmetros.
 */
export interface PedidoDeAgendamento {
  /** O procedimento e a profissional do agendamento de onde veio o pedido (o "Reagendar" da falta, A27 da 7ª). */
  procedimento: string | null
  profissional: string | null
}

export function useNovoAgendamentoDaUrl(pode: boolean, abrir: (clienteId: string | null, pedido: PedidoDeAgendamento) => void): void {
  const params   = useSearchParams()
  const router   = useRouter()
  const pathname = usePathname()
  const novo     = params.get('novo')
  const cliente  = params.get('cliente')
  const procedimento = params.get('procedimento')
  const profissional = params.get('profissional')

  const aoPedir = useEffectEvent(() => {
    if (pode) abrir(cliente, { procedimento, profissional })
    const q = new URLSearchParams(params.toString())
    q.delete('novo')
    q.delete('cliente')
    q.delete('procedimento')
    q.delete('profissional')
    const resto = q.toString()
    router.replace(resto ? `${pathname}?${resto}` : pathname, { scroll: false })
  })
  useEffect(() => { if (novo === '1') aoPedir() }, [novo, cliente])
}
