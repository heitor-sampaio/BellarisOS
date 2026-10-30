/**
 * A confirmação e a chegada na linha do tempo da cliente (A23, 2026-10-27):
 * só o agendamento, o atendimento e o cancelamento apareciam. As datas já
 * moram no agendamento (`confirmed_at`, `arrived_at`).
 */
export interface EventoDoAgendamento {
  id: string; procedureName: string
  confirmed_at: string | null; arrived_at: string | null
}

export function eventosDeConfirmacaoEChegada(a: EventoDoAgendamento, link: string | null) {
  const base = { subtitle: null, amount: null, link }
  const eventos: { id: string; date: string; type: 'APPOINTMENT_CONFIRMED' | 'APPOINTMENT_ARRIVED'; title: string; subtitle: null; amount: null; link: string | null }[] = []
  if (a.confirmed_at) eventos.push({ id: `${a.id}-conf`, date: a.confirmed_at, type: 'APPOINTMENT_CONFIRMED', title: `Confirmado: ${a.procedureName}`, ...base })
  if (a.arrived_at) eventos.push({ id: `${a.id}-cheg`, date: a.arrived_at, type: 'APPOINTMENT_ARRIVED', title: `Chegou: ${a.procedureName}`, ...base })
  return eventos
}

// -- J-26 e J-27 (2026-10-30) ---------------------------------------------------

/** O agendamento como a ficha o lê, com a avaliação da cliente (o "Confirmar e avaliar" do app). */
export interface AvaliacaoDoAgendamento {
  id: string; procedureName: string
  client_confirmed_at?: string | null
  procedure_rating?: number | null; client_rating?: number | null
  client_feedback?: string | null
}

/**
 * A avaliação na linha do tempo da ficha (J-26): o comentário que a cliente
 * deixou não voltava a lugar nenhum. Sem nota nem comentário, não há evento.
 */
export function eventoDaAvaliacao(a: AvaliacaoDoAgendamento, link: string | null) {
  if (!a.client_confirmed_at) return null
  const comentario = a.client_feedback?.trim() || null
  if (a.procedure_rating == null && a.client_rating == null && !comentario) return null
  const partes = [
    a.procedure_rating != null ? `Procedimento ${a.procedure_rating}/5` : null,
    a.client_rating != null ? `Profissional ${a.client_rating}/5` : null,
    comentario ? `“${comentario}”` : null,
  ].filter(Boolean)
  return {
    id: `${a.id}-aval`, date: a.client_confirmed_at, type: 'APPOINTMENT_RATED' as const,
    title: `Avaliou: ${a.procedureName}`, subtitle: partes.join(' · '), amount: null, link,
  }
}

/** Uma linha de `appointment_history`: quem fez o quê, e quando. */
export interface LinhaDoHistorico {
  appointment_id: string; action: string; changed_by_name: string | null; created_at: string
}

/**
 * Qual ação do histórico é cada evento da linha do tempo (J-27). A chegada
 * se grava como CHECKIN; as outras, com o nome do status.
 */
const ACAO_DO_EVENTO: Record<string, readonly string[]> = {
  APPOINTMENT_SCHEDULED: ['CREATED'],
  APPOINTMENT_CONFIRMED: ['CONFIRMED'],
  APPOINTMENT_ARRIVED:   ['CHECKIN', 'ARRIVED'],
  APPOINTMENT_COMPLETED: ['COMPLETED'],
  APPOINTMENT_CANCELLED: ['CANCELLED'],
  APPOINTMENT_NO_SHOW:   ['NO_SHOW'],
}

/**
 * Põe em cada evento de agendamento da linha do tempo QUEM fez (J-27): o nome
 * que `appointment_history` guardou — com a marca "via suporte", quando foi o
 * suporte. Vale a última vez que a ação aconteceu. O agendamento do evento sai
 * do link dele (`…/agenda/<id>`).
 */
export function comAutores<E extends { type: string; link: string | null; autor?: string | null }>(
  eventos: E[], historico: readonly LinhaDoHistorico[],
): E[] {
  const ultima = new Map<string, LinhaDoHistorico>()
  for (const h of historico) {
    const chave = `${h.appointment_id}:${h.action}`
    const antes = ultima.get(chave)
    if (!antes || h.created_at > antes.created_at) ultima.set(chave, h)
  }
  return eventos.map(ev => {
    const acoes = ACAO_DO_EVENTO[ev.type]
    const id = /\/agenda\/([0-9a-f-]{36})$/.exec(ev.link ?? '')?.[1]
    if (!acoes || !id) return ev
    const quem = acoes.map(a => ultima.get(`${id}:${a}`)).find(Boolean)?.changed_by_name ?? null
    return quem ? { ...ev, autor: quem } : ev
  })
}

/** O nome de cada ação do histórico, na janela do agendamento (J-27). */
const ROTULO_DA_ACAO: Record<string, string> = {
  CREATED: 'Agendado', CONFIRMED: 'Confirmado', CHECKIN: 'Chegou', ARRIVED: 'Chegou',
  STARTED: 'Atendimento iniciado', IN_PROGRESS: 'Atendimento iniciado', COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado', NO_SHOW: 'Não compareceu', RESCHEDULED: 'Remarcado',
  REASSIGNED: 'Profissional trocado', EDITED: 'Editado', PAYMENT_CONFIRMED: 'Pagamento recebido',
  CHECKOUT_COMPLETED: 'Plano fechado', PLAN_PROPOSED: 'Plano proposto', FOTO_CLINICA: 'Foto clínica anexada',
}
export function rotuloDaAcao(action: string, descricao: string | null): string {
  return ROTULO_DA_ACAO[action] ?? descricao ?? action
}
