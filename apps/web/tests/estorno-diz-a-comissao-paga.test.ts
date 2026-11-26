import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { textoDaComissaoETaxaDoEstorno } from '@/lib/financeiro/reabertura-do-estorno'

const sp = (s: string | null) => (s ?? '').replace(/ /g, ' ')
const ler = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

/**
 * CF-16 (comissoes.md, "Fechamento não se reabre: estorno depois dele vira
 * lançamento negativo no próximo"): a janela do estorno dizia que a comissão
 * JÁ PAGA "volta a aguardar o pagamento" — o banco a desconta no próximo
 * fechamento (−R$ 90,00), e só a parte ainda não paga volta a aguardar.
 */
describe('o estorno diz o que acontece com a comissão já paga (CF-16)', () => {
  it('a comissão paga é descontada no próximo fechamento', () => {
    expect(sp(textoDaComissaoETaxaDoEstorno({
      cartao: false, comissoes: [], pagas: [{ nome: 'Francine', valor: 90 }], produto: false,
    }))).toBe('A comissão de Francine (R$ 90,00) já foi paga: o estorno a desconta no próximo fechamento (−R$ 90,00), e ela volta a aguardar o pagamento.')
  })
  it('na venda de produto, a paga é descontada e não volta a aguardar', () => {
    expect(sp(textoDaComissaoETaxaDoEstorno({
      cartao: true, comissoes: [], pagas: [{ nome: 'Gilberto', valor: 8 }], produto: true,
    }))).toBe('A comissão de Gilberto (R$ 8,00) já foi paga: o estorno a desconta no próximo fechamento (−R$ 8,00). A taxa da maquininha deste pagamento sai da conta.')
  })
  it('a paga e a ainda não paga, cada uma com o seu destino', () => {
    expect(sp(textoDaComissaoETaxaDoEstorno({
      cartao: false, comissoes: [{ nome: 'Ana', valor: 10 }], pagas: [{ nome: 'Bia', valor: 20 }], produto: false,
    }))).toBe('A comissão de Ana (R$ 10,00) volta a aguardar o pagamento. A comissão de Bia (R$ 20,00) já foi paga: o estorno a desconta no próximo fechamento (−R$ 20,00), e ela volta a aguardar o pagamento.')
  })
  it('sem ver quanto cada um ganha, sem os valores', () => {
    expect(textoDaComissaoETaxaDoEstorno({ cartao: false, comissoes: [], pagas: 'OCULTA', produto: false }))
      .toBe('A comissão que este pagamento liberou já foi paga: o estorno a desconta no próximo fechamento, e ela volta a aguardar o pagamento.')
  })
  it('o servidor separa o pago (status PAID) do que ainda está a pagar', () => {
    const fonte = ler('actions/financial.ts')
    expect(fonte).toContain("select('line_id, amount, status')")
    expect(fonte).toMatch(/textoDaComissaoETaxaDoEstorno\(\{ cartao, comissoes, pagas,/)
  })
})
