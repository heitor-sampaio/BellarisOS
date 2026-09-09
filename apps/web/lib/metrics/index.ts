/**
 * Camada única de indicadores.
 *
 * Regra: nenhuma tela soma ou conta por conta própria. Toda métrica exibida
 * vem daqui, com uma definição só por indicador. Antes havia 3 fórmulas de
 * "ticket médio", 2 de "receita" e 4 de "giro de estoque" espalhadas pelas
 * páginas, e elas não batiam entre si.
 *
 * Definições canônicas:
 *   revenueCash     — recebido no período (INCOME pago, eixo em paid_at).
 *   revenuePending  — a receber (INCOME não pago).
 *   serviceRevenue  — preço dos atendimentos concluídos (eixo em scheduled_at).
 *   ticketMedio     — serviceRevenue ÷ atendimentos concluídos. Mesmo conjunto
 *                     nos dois lados da divisão; antes o numerador vinha do
 *                     caixa (incluindo vendas sem atendimento) e o denominador
 *                     da agenda, então a conta nunca fechava na mão.
 *   occupancy       — minutos agendados ÷ capacidade (profissionais × jornada
 *                     × dias com expediente no período).
 */

export * from './period'
export * from './queries'

/** Jornada considerada por profissional. Não há cadastro de horário de
 *  funcionamento no schema — quando houver, trocar por ele. */
export const CAPACITY_HOURS_PER_DAY = 8

/** Dias com expediente (seg–sáb) entre duas datas, no fuso do negócio. */
export function businessDaysBetween(from: Date, to: Date): number {
  const MS_DAY = 86_400_000
  const days = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / MS_DAY))
  let count = 0
  for (let i = 0; i < days; i++) {
    const d = new Date(from.getTime() + i * MS_DAY)
    const wd = d.getUTCDay()
    if (wd !== 0) count++   // domingo não conta
  }
  return Math.max(1, count)
}

/**
 * Ocupação: percentual da capacidade que foi efetivamente agendada.
 * Retorna null quando não há capacidade (sem profissional), para a UI
 * mostrar "—" em vez de 0% — que era lido como "ninguém atendeu".
 */
export function occupancyPct(
  scheduledMinutes: number,
  professionals: number,
  from: Date,
  to: Date,
): number | null {
  if (!professionals) return null
  const capacity = professionals * CAPACITY_HOURS_PER_DAY * 60 * businessDaysBetween(from, to)
  if (!capacity) return null
  return Math.min((scheduledMinutes / capacity) * 100, 100)
}
