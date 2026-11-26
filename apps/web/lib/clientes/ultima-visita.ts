import { formatDistance } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { BUSINESS_TZ, partsInTZ } from '@/lib/datetime'

/** A meia-noite (em UTC, sem fuso) do dia de calendário do instante no fuso. */
function diaDeCalendario(instante: Date, fuso: string): Date {
  const p = partsInTZ(instante, fuso)
  return new Date(Date.UTC(p.year, p.month - 1, p.day))
}

/**
 * Os dias de calendário, no fuso, desde a última visita (null sem visita). A
 * conta da lista de Clientes e do "Reativar clientes" dos dashboards — a mesma,
 * para o número bater (o mesmo defeito do D9 da 33ª no dashboard, que contava
 * blocos de 24 h). Concluído antes da hora marcada (scheduled_at mais tarde que
 * agora): é hoje, não "-1 dias" (simulação de um dia de clínica, 2026-10-20).
 */
export function diasDesdeAUltimaVisita(iso: string | null, agora: Date = new Date(), fuso: string = BUSINESS_TZ): number | null {
  if (!iso) return null
  const diaDaVisita = diaDeCalendario(new Date(iso), fuso)
  const hoje = diaDeCalendario(agora, fuso)
  return Math.max(0, Math.round((hoje.getTime() - diaDaVisita.getTime()) / 86400000))
}

/**
 * A "Última visita" de cada linha da lista de Clientes, em DIAS DE CALENDÁRIO
 * no fuso do portal (D9 da 33ª simulação; CLAUDE.md §14): contava as horas
 * desde a visita, e o "há 20 dias" da manhã virava "há 21 dias" à tarde. Hoje
 * é o mesmo dia no fuso; ontem, o dia anterior — mesmo com menos de 24 horas.
 * Puro: a lista e o teste dividem.
 */
export function rotuloDaUltimaVisita(iso: string | null, agora: Date = new Date(), fuso: string = BUSINESS_TZ): string {
  if (!iso) return 'Sem visitas'
  const diaDaVisita = diaDeCalendario(new Date(iso), fuso)
  const hoje = diaDeCalendario(agora, fuso)
  const dias = diasDesdeAUltimaVisita(iso, agora, fuso)!
  if (dias === 0) return 'Última visita: Hoje'
  if (dias === 1) return 'Última visita: Ontem'
  if (dias < 7)  return `Última visita: ${dias} dias`
  // Entre as duas meias-noites, a distância é de dias inteiros: o texto
  // ("há 20 dias", "há cerca de 1 mês") não muda no correr do dia.
  return `Última visita: ${formatDistance(diaDaVisita, hoje, { locale: ptBR, addSuffix: true })}`
}
