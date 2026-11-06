import { formatBRL } from '@estetica-os/utils'

/**
 * O "deu certo" da venda (A46 da 8ª simulação, 2026-11-06: a venda concluída
 * fechava a janela sem toast nem comprovante). Diz o que foi vendido, o valor
 * e onde fica o recibo — o recibo existe do que foi PAGO (o a receber, quando
 * entrar).
 */
export function avisoDaVenda(descricao: string, valor: number, forma: string): string {
  const pagaAgora = forma === 'AVISTA' || forma === 'PARCELADO'
  return `Venda registrada: ${descricao} — ${formatBRL(valor)}.`
    + (pagaAgora ? ' O recibo fica na aba Financeiro da ficha.' : ' O recibo sai quando o pagamento entrar.')
}
