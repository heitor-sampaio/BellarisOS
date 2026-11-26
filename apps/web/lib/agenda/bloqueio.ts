import { partsInTZ, dayKeyTZ } from '@/lib/datetime'
import { LIMITE_DE_DIAS, acimaDeCemAnos, avisoAcimaDoComum } from '@/lib/acima-do-comum'

/**
 * O bloqueio pontual da agenda (decisão 3 do Heitor, 7ª simulação,
 * 2026-11-05: "concordo") — o almoço de hoje, a folga, as férias: uma
 * PROFISSIONAL ou uma SALA, de `inicio` a `fim`, com o motivo. As contas
 * puras; a leitura mora em `lib/agenda/bloqueios.ts` (servidor).
 *
 * - Os livres (`computeAvailableSlots`: o app da cliente, o Copilot, o CRM)
 *   não oferecem o horário bloqueado.
 * - Marcar ou mover PARA dentro do bloqueio é RECUSADO, por qualquer caminho
 *   (R07, o Heitor, 26/11, no chat: "r07 se ta bloqueado não dá pra marcar"; era
 *   o encaixe avisado, princípio 2): `recusaDoBloqueioNoHorario`, no núcleo. O que
 *   já estava marcado quando o bloqueio nasceu continua.
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

/**
 * "das 12:00 às 13:00" no mesmo dia; senão "de 10/11 às 08:00 a 20/11 às 20:00".
 * No relógio da unidade (F62); sem o fuso, o de Brasília.
 */
export function trechoDoBloqueio(b: Periodo, fuso?: string): string {
  const hh = (d: Date) => { const p = partsInTZ(d, fuso); return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}` }
  const dayKeyNoFuso = (d: Date) => dayKeyTZ(d, fuso)
  const ddmm = (d: Date) => { const [, m, dia] = dayKeyNoFuso(d).split('-'); return `${dia}/${m}` }
  const ini = new Date(b.inicio), fim = new Date(b.fim)
  // O fim à meia-noite do dia seguinte ainda é "do mesmo dia" ("das 08:00 às 24:00").
  const fimNoDia = new Date(fim.getTime() - 1)
  // O "Dia inteiro" (A17 da 9ª: dizia "das 00:00 às 24:00"): de meia-noite a meia-noite.
  if (hh(ini) === '00:00' && hh(fim) === '00:00' && fim.getTime() > ini.getTime()) {
    return dayKeyNoFuso(ini) === dayKeyNoFuso(fimNoDia)
      ? `o dia ${ddmm(ini)} inteiro`
      : `de ${ddmm(ini)} a ${ddmm(fimNoDia)}, os dias inteiros`
  }
  if (dayKeyNoFuso(ini) === dayKeyNoFuso(fimNoDia)) {
    const ate = hh(fim) === '00:00' && fim.getTime() > ini.getTime() ? '24:00' : hh(fim)
    return `das ${hh(ini)} às ${ate}`
  }
  return `de ${ddmm(ini)} às ${hh(ini)} a ${ddmm(fim)} às ${hh(fim)}`
}

/** O bloqueio da pessoa que atende, em palavras: o que a janela diz depois de "Não vai ser agendado:". */
export function avisoDoBloqueioDaProfissional(nome: string, b: Periodo & { motivo: string }, fuso?: string): string {
  return `${nome} está com o horário bloqueado ${trechoDoBloqueio(b, fuso)} (${b.motivo}).`
}

/** O bloqueio da sala, em palavras. */
export function avisoDoBloqueioDaSala(nome: string, b: Periodo & { motivo: string }, fuso?: string): string {
  return `${nome} está bloqueada ${trechoDoBloqueio(b, fuso)} (${b.motivo}).`
}

/**
 * Os bloqueios do horário que o agendar e o remarcar mostram, juntos. Desde a
 * R07 (o Heitor, 26/11: "r07 se ta bloqueado não dá pra marcar") não pedem mais
 * "confirme só se for isso mesmo" (A9 da 32ª): o bloqueado não se marca. Nulo sem bloqueio.
 */
export function avisoDosBloqueios(frases: string[]): string | null {
  return frases.length ? frases.join(' ') : null
}

/**
 * A recusa do horário bloqueado (R07): as frases dos bloqueios e o pedido de
 * outro horário — "Bruna está com o horário bloqueado das 12:00 às 13:00
 * (Almoço). Escolha outro horário.". Nulo sem bloqueio.
 */
export function recusaDoHorarioBloqueado(frases: string[]): string | null {
  return frases.length ? `${frases.join(' ')} Escolha outro horário.` : null
}

/**
 * O que já estava marcado perto do período do bloqueio continua na agenda
 * (princípio 2): o aviso, com a contagem. O "Bloquear horário" o mostra ANTES
 * de gravar (A10 da 32ª; AG-20) e no toast depois. Nulo sem nenhum.
 */
export function avisoDosMarcadosNoBloqueio(quantos: number): string | null {
  if (!quantos) return null
  return `${quantos === 1 ? 'Já há 1 atendimento marcado' : `Já há ${quantos} atendimentos marcados`} perto desse período: ${quantos === 1 ? 'ele continua' : 'eles continuam'} na agenda. Remarque se precisar.`
}

/**
 * Na tela do atendimento (A31 da 8ª simulação): iniciar dentro das férias da
 * Débora dizia só "faltam 3 h 57 min". Só aviso — o atendimento segue.
 */
export function avisoDoBloqueioNoAtendimento(quem: { profissional?: string | null; sala?: string | null }, b: Periodo & { motivo: string }, fuso?: string): string {
  const de = quem.profissional ? `Horário bloqueado para ${quem.profissional}` : `${quem.sala ?? 'A sala'} está bloqueada`
  return `${de} ${trechoDoBloqueio(b, fuso)} (${b.motivo}). O atendimento pode seguir: o bloqueio só avisa.`
}

const UM_DIA_MS = 86_400_000

/**
 * O que se recusa ao bloquear: só o impossível (o resto é da rede —
 * princípio 2). Até 25/11 o bloqueio ia até um ano; o Heitor, 25/11,
 * perguntado se um bloqueio mais longo (uma licença) recusa ou avisa, escolheu
 * "Acima de 1 ano avisa" (`avisoDoBloqueioLongo`). O impossível é passar de
 * 100 anos, o limite das datas (decisão do Claude, 25/11: `LIMITE_DE_DIAS`; o
 * banco tem a mesma faixa, migration `20261207500001`).
 */
export function recusaDoBloqueio(e: { inicio: string; fim: string; motivo: string }, agora = new Date()): string | null {
  const ini = new Date(e.inicio).getTime(), fim = new Date(e.fim).getTime()
  if (!Number.isFinite(ini) || !Number.isFinite(fim)) return 'Informe o início e o fim do bloqueio.'
  if (!e.motivo?.trim()) return 'Diga o motivo do bloqueio (almoço, folga, férias…).'
  if (e.motivo.trim().length > 200) return 'O motivo vai até 200 caracteres.'
  if (fim <= ini) return 'O fim do bloqueio tem de ser depois do início.'
  if (fim - ini > LIMITE_DE_DIAS * UM_DIA_MS) return acimaDeCemAnos(LIMITE_DE_DIAS, 'dias')
  if (fim <= agora.getTime()) return 'Esse período já passou.'
  return null
}

/**
 * O aviso do bloqueio acima do comum — o teto de antes, um ano (decisão do
 * Claude, 25/11): o fim depois do mesmo dia e hora do ano seguinte. O bloqueio
 * grava como está; a tela diz ao lado do fim. Nulo: até um ano, ou o período
 * ainda inválido (a recusa é que fala).
 */
export function avisoDoBloqueioLongo(e: { inicio: string; fim: string }): string | null {
  const ini = new Date(e.inicio), fim = new Date(e.fim).getTime()
  if (!Number.isFinite(ini.getTime()) || !Number.isFinite(fim) || fim <= ini.getTime()) return null
  const umAnoDepois = new Date(ini)
  umAnoDepois.setUTCFullYear(umAnoDepois.getUTCFullYear() + 1)
  const anos = 1 + Math.max(0, fim - umAnoDepois.getTime()) / (365 * UM_DIA_MS)
  return avisoAcimaDoComum(anos, 1, 'ano')
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
