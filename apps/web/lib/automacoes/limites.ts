import { createAdminClient } from '@/lib/supabase/admin'
import { LIMITES_PADRAO, type LimitesDaAutomacao } from '@estetica-os/types'
import { partsInTZ, startOfDayTZ } from '@/lib/datetime'

/**
 * O que impede a automação de incomodar.
 *
 * Duas travas, e as duas existem porque o destinatário é um cliente de verdade
 * com um celular na mesa de cabeceira:
 *
 *  - **silêncio noturno** — a automação não decide não mandar, ela ESPERA o
 *    horário. Descartar a mensagem faria o lembrete do dia seguinte
 *    simplesmente não acontecer;
 *  - **teto por cliente por dia** — cinco fluxos diferentes reagindo ao mesmo
 *    atendimento mandam cinco mensagens, cada um convencido de estar certo.
 *
 * Valem **só para o que fala com o cliente**. Avisar a equipe e anotar na
 * oportunidade não acordam ninguém, e travá-los faria a recepção descobrir de
 * manhã um no-show da véspera.
 */

export interface Veredito {
  liberado: boolean
  /** Quando `liberado` é falso e há hora: esperar até aqui, não desistir. */
  esperarAte?: Date
  motivo?:  string
}

export function limitesDe(bruto: unknown): LimitesDaAutomacao {
  return { ...LIMITES_PADRAO, ...(bruto as LimitesDaAutomacao ?? {}) }
}

/**
 * Está dentro do silêncio agora?
 *
 * A faixa atravessa a meia-noite (21:00 → 08:00), então a comparação é por
 * dentro OU por fora conforme a ordem dos dois horários — comparar sempre com
 * `>=` e `<=` daria "nunca é noite" justamente no caso normal.
 */
export function noSilencio(
  limites: LimitesDaAutomacao,
  agora = new Date(),
  // O relógio da CLIENTE (F62b): o da unidade do agendamento, do evento ou
  // dela; sem fuso, o de Brasília.
  fuso?: string,
): { dentro: boolean; liberaEm?: Date } {
  const de  = limites.silencioDe
  const ate = limites.silencioAte
  if (!de || !ate) return { dentro: false }

  const p = partsInTZ(agora, fuso)
  const minutosAgora = p.hour * 60 + p.minute
  const minutosDe  = emMinutos(de)
  const minutosAte = emMinutos(ate)
  if (minutosDe === null || minutosAte === null) return { dentro: false }

  const atravessaMeiaNoite = minutosDe > minutosAte
  const dentro = atravessaMeiaNoite
    ? (minutosAgora >= minutosDe || minutosAgora < minutosAte)
    : (minutosAgora >= minutosDe && minutosAgora < minutosAte)

  if (!dentro) return { dentro: false }

  // A hora de liberar é hoje, se ainda não passou; senão, amanhã.
  const libera = new Date(agora)
  libera.setUTCMinutes(libera.getUTCMinutes() + minutosAte1(minutosAgora, minutosAte))
  return { dentro: true, liberaEm: libera }
}

/**
 * "Se cair de madrugada, mandar na véspera às 20:00" (D17 do levantamento das
 * regras, o Heitor, 2026-11-11: "a + c opcional"; a opção, desligada por
 * padrão, voltou na auditoria das regras, 2026-11-18). Com ela LIGADA, a
 * espera "antes de" uma data (o lembrete) que terminaria dentro do silêncio
 * termina na véspera às 20:00 — o último 20:00 antes do momento. Sem ela, a
 * mensagem espera o fim do silêncio, e o lembrete de um horário antes das
 * 08:00 não sai (D2 da 19ª: o momento passou).
 *
 * Devolve `null` (nada muda) quando a opção está desligada, sem silêncio, o
 * momento não cai no silêncio, as 20:00 já passaram, ou as próprias 20:00
 * estão dentro do silêncio (a rede que silencia antes das 20:00).
 */
export function vesperaSeCairNoSilencio(
  limites: LimitesDaAutomacao,
  ate: Date,
  agora = new Date(),
  fuso?: string,
): Date | null {
  if (!limites.madrugadaNaVespera) return null
  if (!noSilencio(limites, ate, fuso).dentro) return null
  const inicio = startOfDayTZ(ate, fuso)
  let vespera = new Date(inicio.getTime() + 20 * 60 * 60_000)
  if (vespera.getTime() > ate.getTime()) vespera = new Date(vespera.getTime() - 24 * 60 * 60_000)
  if (vespera.getTime() <= agora.getTime()) return null
  if (noSilencio(limites, vespera, fuso).dentro) return null
  return vespera
}

function emMinutos(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const h = Number(m[1]), min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** Quantos minutos faltam de `agora` até `alvo`, dando a volta no dia. */
function minutosAte1(agora: number, alvo: number): number {
  const falta = alvo - agora
  return falta > 0 ? falta : falta + 24 * 60
}

/**
 * Quantas vezes ESTA automação já falou com ESTE cliente hoje.
 *
 * Conta execuções concluídas do dia, não mensagens: uma execução que mandou
 * duas mensagens ainda é um contato só do ponto de vista de quem recebe.
 */
export async function falouHojeCom(
  automationId: string,
  clienteId: string,
  fuso?: string,
): Promise<number> {
  // Início do dia no fuso do NEGÓCIO. `new Date().setHours(0,0,0,0)` usaria o
  // fuso do processo, que no container é UTC — e às 21h de Brasília já seria
  // "amanhã", zerando o teto justamente no horário de pico.
  // O dia é o da unidade (F62b).
  const inicio = startOfDayTZ(new Date(), fuso)

  const { data, error } = await createAdminClient()
    .from('automation_runs')
    .select('id, contexto')
    .eq('automation_id', automationId)
    // Ensaio não fala com ninguém, então não gasta o teto do dia. Contá-lo
    // faria conferir o fluxo três vezes calar a automação até amanhã.
    .eq('simulacao', false)
    .in('status', ['ok', 'esperando'])
    .gte('created_at', inicio.toISOString())

  if (error) { console.error('[falouHojeCom]', error.message); return 0 }

  return (data ?? []).filter(r => {
    const ctx = r.contexto as { cliente?: { id?: string } } | null
    return ctx?.cliente?.id === clienteId
  }).length
}

/**
 * Pode falar com este cliente agora?
 *
 * Silêncio devolve uma HORA para esperar; teto devolve recusa seca — esperar
 * até amanhã acumularia a fila e mandaria tudo de uma vez às 8h01.
 */
export async function podeFalarCom(
  automationId: string,
  clienteId: string | null,
  limites: LimitesDaAutomacao,
  agora = new Date(),
  fuso?: string,
): Promise<Veredito> {
  const silencio = noSilencio(limites, agora, fuso)
  if (silencio.dentro) {
    return {
      liberado: false,
      esperarAte: silencio.liberaEm,
      motivo: `Silêncio até ${limites.silencioAte}. A mensagem espera o horário.`,
    }
  }

  const teto = limites.tetoPorClienteDia
  if (teto && clienteId) {
    const jaFalou = await falouHojeCom(automationId, clienteId, fuso)
    // `>=` e não `>`: o teto é quantas vezes PODE, e a execução atual ainda
    // não contou.
    if (jaFalou >= teto) {
      return {
        liberado: false,
        motivo: `Esta automação já falou ${jaFalou}× com este cliente hoje (teto: ${teto}).`,
      }
    }
  }

  return { liberado: true }
}
