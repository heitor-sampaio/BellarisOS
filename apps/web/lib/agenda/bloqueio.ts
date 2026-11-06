import { partsInTZ, dayKeyTZ } from '@/lib/datetime'

/**
 * O bloqueio pontual da agenda (decisão 3 do Heitor, 7ª simulação,
 * 2026-11-05: "concordo") — o almoço de hoje, a folga, as férias: uma
 * PROFISSIONAL ou uma SALA, de `inicio` a `fim`, com o motivo. As contas
 * puras; a leitura mora em `lib/agenda/bloqueios.ts` (servidor).
 *
 * - Os livres (`computeAvailableSlots`: o app da cliente, o Copilot, o CRM)
 *   não oferecem o horário bloqueado.
 * - A equipe, pela agenda, é AVISADA e encaixa (princípio 2).
 */
export interface BloqueioDaAgenda {
  id:             string
  branchId:       string
  professionalId: string | null
  roomId:         string | null
  inicio:         string
  fim:            string
  motivo:         string
  criadoPorNome:  string | null
}

type Periodo = { inicio: string; fim: string }

/** O bloqueio se sobrepõe a [ini, fim) (ms)? Encostar não é sobrepor. */
export function bloqueioBate(b: Periodo, ini: number, fim: number): boolean {
  return ini < new Date(b.fim).getTime() && fim > new Date(b.inicio).getTime()
}

const hh = (d: Date) => { const p = partsInTZ(d); return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}` }
const ddmm = (d: Date) => { const [, m, dia] = dayKeyTZ(d).split('-'); return `${dia}/${m}` }

/** "das 12:00 às 13:00" no mesmo dia (Brasília); senão "de 10/11 às 08:00 a 20/11 às 20:00". */
export function trechoDoBloqueio(b: Periodo): string {
  const ini = new Date(b.inicio), fim = new Date(b.fim)
  // O fim à meia-noite do dia seguinte ainda é "do mesmo dia" ("das 08:00 às 24:00").
  const fimNoDia = new Date(fim.getTime() - 1)
  if (dayKeyTZ(ini) === dayKeyTZ(fimNoDia)) {
    const ate = hh(fim) === '00:00' && fim.getTime() > ini.getTime() ? '24:00' : hh(fim)
    return `das ${hh(ini)} às ${ate}`
  }
  return `de ${ddmm(ini)} às ${hh(ini)} a ${ddmm(fim)} às ${hh(fim)}`
}

export function avisoDoBloqueioDaProfissional(nome: string, b: Periodo & { motivo: string }): string {
  return `Horário bloqueado para ${nome} ${trechoDoBloqueio(b)} (${b.motivo}). O encaixe é permitido.`
}

export function avisoDoBloqueioDaSala(nome: string, b: Periodo & { motivo: string }): string {
  return `${nome} está bloqueada ${trechoDoBloqueio(b)} (${b.motivo}). O encaixe é permitido.`
}

/**
 * Na tela do atendimento (A31 da 8ª simulação): iniciar dentro das férias da
 * Débora dizia só "faltam 3 h 57 min". Só aviso — o atendimento segue.
 */
export function avisoDoBloqueioNoAtendimento(quem: { profissional?: string | null; sala?: string | null }, b: Periodo & { motivo: string }): string {
  const de = quem.profissional ? `Horário bloqueado para ${quem.profissional}` : `${quem.sala ?? 'A sala'} está bloqueada`
  return `${de} ${trechoDoBloqueio(b)} (${b.motivo}). O atendimento pode seguir: o bloqueio só avisa.`
}

/** O que se recusa ao bloquear (o resto é da clínica — princípio 2). */
export function recusaDoBloqueio(e: { inicio: string; fim: string; motivo: string }, agora = new Date()): string | null {
  const ini = new Date(e.inicio).getTime(), fim = new Date(e.fim).getTime()
  if (!Number.isFinite(ini) || !Number.isFinite(fim)) return 'Informe o início e o fim do bloqueio.'
  if (!e.motivo?.trim()) return 'Diga o motivo do bloqueio (almoço, folga, férias…).'
  if (e.motivo.trim().length > 200) return 'O motivo vai até 200 caracteres.'
  if (fim <= ini) return 'O fim do bloqueio tem de ser depois do início.'
  if (fim - ini > 366 * 86_400_000) return 'O bloqueio vai até um ano.'
  if (fim <= agora.getTime()) return 'Esse período já passou.'
  return null
}

/**
 * O pedaço do bloqueio que cai num dia da grade, em minutos desde a meia-noite
 * do relógio de quem vê (a grade posiciona os agendamentos assim também).
 * Nulo: o bloqueio não toca o dia.
 */
export function bloqueioNoDia(b: Periodo, dia: Date): { de: number; ate: number } | null {
  const inicioDoDia = new Date(dia); inicioDoDia.setHours(0, 0, 0, 0)
  const fimDoDia = new Date(inicioDoDia); fimDoDia.setDate(fimDoDia.getDate() + 1)
  const ini = Math.max(new Date(b.inicio).getTime(), inicioDoDia.getTime())
  const fim = Math.min(new Date(b.fim).getTime(), fimDoDia.getTime())
  if (fim <= ini) return null
  return { de: (ini - inicioDoDia.getTime()) / 60_000, ate: (fim - inicioDoDia.getTime()) / 60_000 }
}

/** A recusa de quem tem a agenda "só os meus" ao bloquear outra pessoa ou uma sala. */
export const SO_O_PROPRIO = 'Com a agenda “só os meus”, você bloqueia só o seu horário.'

/**
 * O pedaço do bloqueio num dia, em palavras, para a vista da SEMANA (sobra da
 * F30): "das 12:00 às 13:00", ou "o dia todo" no meio das férias. No relógio de
 * quem vê, como a grade. Nulo: o bloqueio não toca o dia.
 */
export function trechoNoDia(b: Periodo, dia: Date): string | null {
  const noDia = bloqueioNoDia(b, dia)
  if (!noDia) return null
  if (noDia.de <= 0 && noDia.ate >= 24 * 60) return 'o dia todo'
  const h = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`
  return `das ${h(noDia.de)} às ${h(noDia.ate)}`
}
