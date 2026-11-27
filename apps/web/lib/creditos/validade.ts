import { formatDia } from '@estetica-os/utils'
import { dayKeyTZ } from '@/lib/datetime'
import { FUSO_PADRAO, fusoValido } from '@/lib/unidades/fuso'

/**
 * A validade do crédito (a sessão do pacote, a do pré-pago) — PP-05: "confere
 * o crédito: é da cliente, da rede, está livre e dentro da validade".
 *
 * Decisões do Claude, 27/11 (37ª simulação, A3 e A6 do relatório):
 * - vale o DIA MARCADO para a sessão, não o dia em que se agenda: marcar para
 *   depois da validade é recusado, em todo caminho (o agendar da equipe e do
 *   app, a sessão do pacote, a do pré-pago, o Copilot, a remarcação, o "Usar o
 *   pacote" num avulso já marcado), e a recusa diz até quando ele vale. O app
 *   aceitava 30/11 num pacote que vence em 29/11;
 * - a validade é um DIA (ES-24; a tela diz "válido até 29/11"), no fuso da
 *   unidade do crédito: a venda gravava a hora da compra (29/11 05:22), e às
 *   10h de 29/11 o pacote já não se agendava. O dado gravado fica; a conta é
 *   pelo dia.
 *
 * Puro: o servidor e o teste leem daqui.
 */

/** 'pacote' (a sessão do pacote) ou 'pré-pago' (a sessão do pré-pago). */
export type CreditoComValidade = 'pacote' | 'pré-pago'

/** O último dia em que o crédito vale ('YYYY-MM-DD', no fuso da unidade dele). */
export function diaDaValidade(expiresAt: string, fuso: string = FUSO_PADRAO): string {
  return dayKeyTZ(expiresAt, fusoValido(fuso))
}

/** O crédito ainda vale HOJE (o dia de hoje no fuso da unidade dele é até o da validade)? Sem validade, sempre. */
export function creditoValeHoje(expiresAt: string | null | undefined, fuso: string = FUSO_PADRAO, agora: Date = new Date()): boolean {
  if (!expiresAt) return true
  return dayKeyTZ(agora, fusoValido(fuso)) <= diaDaValidade(expiresAt, fuso)
}

/**
 * Por que o crédito não serve a uma sessão marcada em `quando` (ou hoje, sem
 * ela) — ou null. `fusoDoDia`: o da unidade do AGENDAMENTO (sem ele, o do
 * crédito).
 */
export function recusaDaValidadeDoCredito(o: {
  tipo: CreditoComValidade
  expiresAt: string | null | undefined
  fuso?: string | null
  quando?: string | Date | null
  fusoDoDia?: string | null
  agora?: Date
}): string | null {
  if (!o.expiresAt) return null
  const fuso = fusoValido(o.fuso)
  const ate = diaDaValidade(o.expiresAt, fuso)
  const rotulo = formatDia(ate) ?? ate
  if (!creditoValeHoje(o.expiresAt, fuso, o.agora ?? new Date())) return `Este ${o.tipo} venceu em ${rotulo}.`
  if (o.quando) {
    const quando = typeof o.quando === 'string' ? new Date(o.quando) : o.quando
    if (!Number.isNaN(quando.getTime()) && dayKeyTZ(quando, fusoValido(o.fusoDoDia ?? fuso)) > ate) {
      return `Este ${o.tipo} vale até ${rotulo}: marque a sessão até esse dia.`
    }
  }
  return null
}
