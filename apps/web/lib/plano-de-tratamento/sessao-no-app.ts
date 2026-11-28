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

/**
 * AT-21 (o Heitor, 2026-11-18): a sessão já paga gasta pela desistência no
 * meio — a do PACOTE (`USED`) e a do PRÉ-PAGO (`USADA`) — fica ligada ao
 * agendamento CANCELADO (o cancelado antes de iniciar se solta: `pre_pago_libera`).
 * D4 da 37ª: a frase valia só para a sessão do plano.
 */
export function sessaoInterrompida(statusDaSessao: string | null | undefined, statusDoAgendamento: string | null | undefined): boolean {
  return (statusDaSessao === 'USED' || statusDaSessao === 'USADA') && statusDoAgendamento === 'CANCELLED'
}

/** "Usada em 26/11 (atendimento interrompido)" — a mesma frase da sessão do plano. */
export function textoDaSessaoInterrompida(scheduledAt: string, fuso: string): string {
  return situacaoDaSessaoNoApp({ status: 'CANCELLED', scheduled_at: scheduledAt, completed_at: null }, fuso).texto
}

/**
 * O "Agendar" da sessão em aberto, na página do plano no app (D6 da 42ª; PL-19
 * e CLAUDE.md §6, "Portal não é a unidade do registro"): o agendar do app usa a
 * unidade do ENDEREÇO (§5, H5), e o link montava o endereço de onde ela estava —
 * a sessão do plano de Arapongas, aberta pelo portal de Apucarana, ia ao agendar
 * de Apucarana, que pode nem fazer o procedimento. Abre no endereço da unidade
 * DO PLANO; com mais de uma unidade, o agendar ainda pergunta "Em qual
 * unidade?" (a cliente é da rede e agenda em qualquer uma — H5). A unidade do
 * plano desativada fica de fora (só as ativas se agendam): o endereço de onde
 * ela está.
 */
export function rotaDoAgendarDaSessaoNoApp(
  slugDoEndereco: string,
  unidadeDoPlano: { slug: string; is_active: boolean } | null | undefined,
  procedimentoId: string,
): string {
  const slug = unidadeDoPlano?.is_active && unidadeDoPlano.slug ? unidadeDoPlano.slug : slugDoEndereco
  return `/${slug}/cliente/agendamentos/novo?procedimento=${procedimentoId}`
}
