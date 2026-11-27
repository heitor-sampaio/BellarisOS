import { formatBRL } from '@estetica-os/utils'
import { valoresDoPagamento, type PagamentoDoPlano } from '@/lib/checkout/pagamento'
import { VARIAVEIS_DE_DOCUMENTO, type TipoDeModelo } from './variaveis'
import { dataPorExtenso, formatarDataCivil } from './valores'

const FUSO = 'America/Sao_Paulo'

/** O dia civil de `agora` no fuso, mais `dias` — `aaaa-mm-dd`. */
function diaMais(agora: Date, dias: number): string {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora)
  const [a, m, d] = hoje.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10)
}

/**
 * A venda de exemplo de cada contrato: o valor antes do desconto, o desconto e
 * a entrada — o saldo em 3 parcelas iguais. Escolhidos para a conta fechar.
 */
const VENDA: Partial<Record<TipoDeModelo, { total: number; desconto: number; entrada: number }>> = {
  CONTRATO:        { total: 1200, desconto: 120, entrada: 180 },
  CONTRATO_PLANO:  { total: 4800, desconto: 480, entrada: 1320 },
  CONTRATO_PACOTE: { total: 1800, desconto: 180, entrada: 420 },
}

/**
 * Os dados de exemplo da prévia do modelo (A16 da 37ª simulação; princípio 3):
 * os do catálogo, com o pagamento montado pela MESMA conta do contrato de
 * verdade (`valoresDoPagamento`) sobre uma venda que fecha, e as datas a
 * partir de hoje. Só a prévia usa — nada daqui vai a documento emitido.
 */
export function exemplosDoTipo(tipo: TipoDeModelo, agora: Date = new Date()): Record<string, string | null> {
  const exemplos: Record<string, string | null> = Object.fromEntries(
    Object.entries(VARIAVEIS_DE_DOCUMENTO).map(([nome, v]) => [nome, v.exemplo]),
  )
  exemplos['data.hoje'] = dataPorExtenso(agora, FUSO)
  exemplos['data.hoje_curta'] = formatarDataCivil(diaMais(agora, 0))
  exemplos['agendamento.data'] = formatarDataCivil(diaMais(agora, 7))
  exemplos['pacote.validade'] = `180 dias, até ${formatarDataCivil(diaMais(agora, 180))}`
  exemplos['procedimento.valor'] = formatBRL(VENDA.CONTRATO!.total)
  exemplos['procedimentos.lista'] = ['Bioestimulador de colágeno — 2 sessões — R$ 2.400,00', 'Toxina botulínica — 2 sessões — R$ 2.400,00'].join('\n')
  exemplos['plano.total'] = formatBRL(VENDA.CONTRATO_PLANO!.total)
  exemplos['plano.sessoes'] = '4'
  exemplos['pacote.procedimentos'] = 'Drenagem linfática — 6 sessões; Massagem modeladora — 4 sessões'
  exemplos['pacote.sessoes'] = '10'
  exemplos['pacote.total'] = formatBRL(VENDA.CONTRATO_PACOTE!.total)

  const venda = VENDA[tipo]
  if (venda) {
    const pagamento: PagamentoDoPlano = {
      forma: 'PARCELADO', metodo: 'PIX', entrada: venda.entrada, parcelas: 3, primeiroVencimento: new Date(`${diaMais(agora, 30)}T12:00:00-03:00`).toISOString(),
    }
    Object.assign(exemplos, valoresDoPagamento(pagamento, venda.total, venda.desconto))
  }
  return exemplos
}
