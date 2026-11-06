import { describe, it, expect } from 'vitest'
import { valoresDoPagamento, type PagamentoDoPlano } from '@/lib/checkout/pagamento'
import { parcelasEmTexto } from '@/lib/checkout/resumo-do-pagamento'
import { dividirEmParcelas } from '@/lib/checkout/parcelas'

/**
 * D2 e A42 da 7ª simulação (2026-11-05; princípio 3): o crediário da Larissa
 * aparecia "3x de R$ 890,67" na tela do checkout e no contrato — que somam
 * R$ 2.672,01 —, e o banco gravou 890,66 + 890,66 + 890,68 (`dividirEmParcelas`:
 * o piso dos centavos, a sobra na última). Eram duas contas para o mesmo valor:
 * a cliente assinava um valor que não era o cobrado. E o contrato do plano não
 * listava cada parcela com a data (A42).
 *
 * A conta é UMA, a dos lançamentos: a tela e o contrato dizem as parcelas
 * gravadas.
 */
const br = (s: string | null | undefined) => (s ?? '').replace(/\s/g, ' ')
const venc = new Date('2026-12-05T12:00:00-03:00').toISOString()
const larissa: PagamentoDoPlano = { forma: 'PARCELADO', metodo: 'CREDIT_CARD', vezes: 3, entrada: 1000, parcelas: 3, primeiroVencimento: venc }

describe('D2: as parcelas que a tela e o contrato dizem são as gravadas', () => {
  it('a divisão gravada é a de dividirEmParcelas', () => {
    expect(dividirEmParcelas(2672, 3, venc).map(p => p.amount)).toEqual([890.66, 890.66, 890.68])
  })

  it('a tela junta as parcelas iguais: "2x de R$ 890,66 + 1x de R$ 890,68"', () => {
    expect(br(parcelasEmTexto(2672, 3))).toBe('2x de R$ 890,66 + 1x de R$ 890,68')
    expect(br(parcelasEmTexto(3000, 3))).toBe('3x de R$ 1.000,00')
    expect(br(parcelasEmTexto(500, 1))).toBe('1x de R$ 500,00')
    expect(parcelasEmTexto(0, 3)).toBeNull()
  })

  it('o contrato diz cada parcela com o valor e a data (A42)', () => {
    const v = valoresDoPagamento(larissa, 3672)
    expect(br(v['pagamento.forma'])).toBe(
      'entrada de R$ 1.000,00 no cartão de crédito em 3x + 3 parcelas (2x de R$ 890,66 + 1x de R$ 890,68) com a clínica'
      + ': R$ 890,66 em 05/12/2026, R$ 890,66 em 05/01/2027 e R$ 890,68 em 05/02/2027')
    expect(br(v['pagamento.valor_parcela']), 'nunca a média arredondada (890,67)').toBe('R$ 890,66 (a última, R$ 890,68)')
  })

  it('a Sophie: 3 × R$ 1.733,33 dizia o contrato; a última é R$ 1.733,34', () => {
    const v = valoresDoPagamento({ forma: 'PARCELADO', metodo: 'PIX', entrada: 2000, parcelas: 3, primeiroVencimento: venc }, 7200)
    expect(br(v['pagamento.forma'])).toContain('R$ 1.733,33 em 05/12/2026, R$ 1.733,33 em 05/01/2027 e R$ 1.733,34 em 05/02/2027')
    expect(br(v['pagamento.valor_parcela'])).toBe('R$ 1.733,33 (a última, R$ 1.733,34)')
  })

  it('parcelas iguais: o valor uma vez e as datas de todas', () => {
    const v = valoresDoPagamento({ forma: 'PARCELADO', metodo: 'PIX', entrada: 0, parcelas: 2, primeiroVencimento: venc }, 3400)
    expect(br(v['pagamento.forma'])).toBe(
      '2 parcelas de R$ 1.700,00 com a clínica: R$ 1.700,00 em 05/12/2026 e R$ 1.700,00 em 05/01/2027')
    expect(br(v['pagamento.valor_parcela'])).toBe('R$ 1.700,00')
  })

  it('uma parcela só não repete a data', () => {
    const v = valoresDoPagamento({ forma: 'PARCELADO', metodo: 'PIX', entrada: 100, parcelas: 1, primeiroVencimento: venc }, 400)
    expect(br(v['pagamento.forma'])).toBe('entrada de R$ 100,00 no Pix + 1 parcela de R$ 300,00 com a clínica, com vencimento em 05/12/2026')
  })

  it('o cartão em N vezes: o valor da parcela é o da divisão em centavos', () => {
    const v = valoresDoPagamento({ forma: 'AVISTA', metodo: 'CREDIT_CARD', vezes: 3 }, 1100)
    expect(br(v['pagamento.valor_parcela'])).toBe('R$ 366,66 (a última, R$ 366,68)')
  })
})
