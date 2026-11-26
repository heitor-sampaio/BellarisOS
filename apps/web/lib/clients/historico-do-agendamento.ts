import { notasDaAvaliacao, textoDasNotas, type NotaDoProcedimento } from '@/lib/avaliacao/notas'

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
  const base = { subtitle: null, amount: null, link, agendamentoId: a.id }
  const eventos: { id: string; date: string; type: 'APPOINTMENT_CONFIRMED' | 'APPOINTMENT_ARRIVED'; title: string; subtitle: null; amount: null; link: string | null; agendamentoId: string }[] = []
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
  /** F17-3: as notas de cada procedimento (`notasDosProcedimentos`, lib/avaliacao/leitura). */
  notas_dos_procedimentos?: NotaDoProcedimento[]
}

/**
 * A avaliação na linha do tempo da ficha (J-26): o comentário que a cliente
 * deixou não voltava a lugar nenhum. Sem nota nem comentário, não há evento.
 */
export function eventoDaAvaliacao(a: AvaliacaoDoAgendamento, link: string | null) {
  if (!a.client_confirmed_at) return null
  const comentario = a.client_feedback?.trim() || null
  // F17-3: a nota do atendimento e a de cada procedimento ("Atendimento 4/5 · Botox 5/5").
  const notas = notasDaAvaliacao({ client_rating: a.client_rating, procedure_rating: a.procedure_rating, procedureName: a.procedureName }, a.notas_dos_procedimentos ?? [])
  if (!notas.length && !comentario) return null
  const partes = [
    notas.length ? textoDasNotas(notas) : null,
    comentario ? `“${comentario}”` : null,
  ].filter(Boolean)
  return {
    id: `${a.id}-aval`, date: a.client_confirmed_at, type: 'APPOINTMENT_RATED' as const,
    title: `Avaliou: ${a.procedureName}`, subtitle: partes.join(' · '), amount: null, link, agendamentoId: a.id,
  }
}

/** Uma linha de `appointment_history`: quem fez o quê, e quando. */
export interface LinhaDoHistorico {
  appointment_id: string; action: string; changed_by_name: string | null; created_at: string
  /** O texto gravado (a remarcação diz de quando para quando — A2 da 31ª). */
  description?: string | null
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
export function comAutores<E extends { type: string; link: string | null; autor?: string | null; agendamentoId?: string | null }>(
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
    // O agendamento do evento: o id dele (A2 da 31ª — sem o Atendimento em Ver
    // o link é nulo, UM1, e o "por Fulana" sumia); o link, no evento de antes.
    const id = ev.agendamentoId ?? /\/agenda\/([0-9a-f-]{36})$/.exec(ev.link ?? '')?.[1]
    if (!acoes || !id) return ev
    const quem = acoes.map(a => ultima.get(`${id}:${a}`)).find(Boolean)?.changed_by_name ?? null
    return quem ? { ...ev, autor: quem } : ev
  })
}

/**
 * As remarcações na linha do tempo da ficha (A2 da 31ª; princípio 3): ela não
 * as registrava — só o agendamento, no horário novo. Uma por linha
 * RESCHEDULED do histórico, com o texto gravado (de quando para quando) e quem
 * remarcou ("Fulana (app)", a marca "via suporte").
 */
export function eventosDeRemarcacao(
  historico: readonly LinhaDoHistorico[], nomeDoProcedimento: ReadonlyMap<string, string>,
  link: (agendamentoId: string) => string | null,
) {
  return historico.filter(h => h.action === 'RESCHEDULED' && nomeDoProcedimento.has(h.appointment_id)).map((h, i) => ({
    id: `${h.appointment_id}-remarc-${i}`, date: h.created_at, type: 'APPOINTMENT_RESCHEDULED' as const,
    title: `Remarcado: ${nomeDoProcedimento.get(h.appointment_id)}`,
    subtitle: rotuloDaAcao(h.action, h.description ?? null), amount: null,
    link: link(h.appointment_id), autor: h.changed_by_name, agendamentoId: h.appointment_id,
  }))
}

/** O nome de cada ação do histórico, na janela do agendamento (J-27). */
const ROTULO_DA_ACAO: Record<string, string> = {
  CREATED: 'Agendado', CONFIRMED: 'Confirmado', CHECKIN: 'Chegou', ARRIVED: 'Chegou',
  STARTED: 'Atendimento iniciado', IN_PROGRESS: 'Atendimento iniciado', COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado', NO_SHOW: 'Não compareceu', RESCHEDULED: 'Remarcado',
  REASSIGNED: 'Profissional trocado', EDITED: 'Editado', PAYMENT_CONFIRMED: 'Pagamento recebido',
  CHECKOUT_COMPLETED: 'Plano fechado', PLAN_PROPOSED: 'Plano proposto', FOTO_CLINICA: 'Foto clínica anexada',
  FOTO_CLINICA_APAGADA: 'Foto clínica apagada', FOTO_ENVIADA: 'Foto enviada à cliente',
  FOTO_TIRADA_DO_APP: 'Foto tirada do app da cliente', PAYMENT_REVERSED: 'Pagamento estornado',
  CREDIT_LINKED: 'Ligado ao que já foi pago',
}
export function rotuloDaAcao(action: string, descricao: string | null): string {
  // A troca de profissional diz de quem para quem (A22 da 8ª simulação): a
  // descrição gravada desde então ("Profissional trocado de X para Y", e o
  // repasse da desativação). A de antes ("…reatribuído para X") fica no rótulo.
  if (action === 'REASSIGNED' && descricao && /^(Profissional trocado|Repassado) /.test(descricao)) return descricao
  if (action === 'RESCHEDULED' && descricao?.startsWith('Reagendado para ')) return `Remarcado para ${descricao.slice('Reagendado para '.length)}`
  // A remarcação pelo app (actions/portal-agendamentos.ts) já diz o novo
  // horário: "Remarcado pela cliente no app para 25/11, 14:00" (princípio 3).
  if (action === 'RESCHEDULED' && descricao?.startsWith('Remarcado ')) return descricao
  return ROTULO_DA_ACAO[action] ?? descricao ?? action
}

/**
 * O link do evento do histórico à tela do atendimento: só a quem tem o
 * Atendimento em Ver (UM1, 23/11 — abrir a tela do atendimento é desse
 * módulo). Sem ele, o evento fica sem link (o texto continua).
 */
export function linkDoAtendimento(abreOAtendimento: boolean, base: string, id: string): string | null {
  return abreOAtendimento ? `${base}/agenda/${id}` : null
}
