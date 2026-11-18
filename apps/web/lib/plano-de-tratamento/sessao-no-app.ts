/**
 * A situação de cada sessão do plano no app da cliente (A45 da 6ª; PT3 da
 * revisão de 2026-11-13): feita, agendada ou a agendar. Puro, no relógio da
 * unidade do endereço (F62). Nada clínico: só o estado e as datas.
 */
export interface AgendamentoDaSessao {
  status: string
  scheduled_at: string
  completed_at: string | null
}

const AGENDADA = ['SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS']

export function situacaoDaSessaoNoApp(a: AgendamentoDaSessao | null | undefined, fuso: string): { texto: string; cor: string; aAgendar: boolean } {
  const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: fuso })
  const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: fuso })
  if (a?.status === 'COMPLETED') return { texto: `Feita em ${dia(a.completed_at ?? a.scheduled_at)}`, cor: 'var(--success)', aAgendar: false }
  // Ligada a um agendamento CANCELADO, só a desistência no meio: a sessão
  // conta como usada e não volta (o Heitor, 2026-11-18; `pre_pago_libera`
  // solta o cancelado antes de iniciar).
  if (a?.status === 'CANCELLED') return { texto: `Usada em ${dia(a.scheduled_at)} (atendimento interrompido)`, cor: 'var(--text-muted)', aAgendar: false }
  if (a && AGENDADA.includes(a.status)) {
    return { texto: `Agendada para ${dia(a.scheduled_at)} às ${hora(a.scheduled_at)}`, cor: 'var(--info)', aAgendar: false }
  }
  return { texto: 'A agendar', cor: 'var(--text-muted)', aAgendar: true }
}
