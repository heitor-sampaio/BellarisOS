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
import { ocupacaoEmPct, type Horario } from '@/lib/agenda/horario'
export * from './queries'

/**
 * Ocupação: percentual da capacidade que foi agendada — minutos dos
 * agendamentos que não foram cancelados nem faltas (os concluídos contam) ÷ a
 * capacidade do HORÁRIO de funcionamento: a soma, por profissional e por dia,
 * dos minutos em que ele atende na unidade (`capacidadeEmMinutos`,
 * lib/agenda/horario.ts). Percentual inteiro, até 100.
 *
 * Era 8 h por profissional (seg–sáb) aqui e 12 h na agenda, que fazia a conta
 * na tela: as duas davam números diferentes (D12 da simulação de 2026-10-20).
 * Retorna null sem capacidade (sem profissional), para a UI mostrar "—" em
 * vez de 0% — que era lido como "ninguém atendeu".
 */
export function occupancyPct(
  scheduledMinutes: number,
  horarios: { unidade: Horario | null; profissionais: (Horario | null)[] },
  from: Date,
  to: Date,
): number | null {
  return ocupacaoEmPct(scheduledMinutes, horarios.unidade, horarios.profissionais, from, to)
}
