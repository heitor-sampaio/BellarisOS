import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { recebidoDaComandaEmTexto } from '@/lib/pdv/situacoes'

/**
 * CI-03 ("a linha do pagamento feito com crédito interno diz que não é
 * receita"): a comanda paga inteira com crédito interno dizia "R$ 165,00
 * recebidos", como o dinheiro que entrou. O rótulo diz com o que foi pago.
 */
const forma = (f: string, valor: number) => ({ forma: f, vezes: 1, valor })

describe('o recebido da comanda paga', () => {
  it('em dinheiro, "recebidos" (como sempre)', () => {
    expect(recebidoDaComandaEmTexto({ recebido: 300, formas: [forma('PIX', 300)] })).toMatch(/^R\$\s300,00 recebidos$/)
  })
  it('toda com crédito interno, "pagos com crédito interno"', () => {
    expect(recebidoDaComandaEmTexto({ recebido: 165, formas: [forma('INTERNAL_CREDIT', 165)] }))
      .toMatch(/^R\$\s165,00 pagos com crédito interno$/)
  })
  it('parte em dinheiro e parte com crédito, as duas', () => {
    expect(recebidoDaComandaEmTexto({ recebido: 165, formas: [forma('CASH', 50), forma('INTERNAL_CREDIT', 115)] }))
      .toMatch(/^R\$\s50,00 recebidos \+ R\$\s115,00 pagos com crédito interno$/)
  })
  it('a tela usa a regra', () => {
    const fonte = readFileSync(join(__dirname, '..', 'components/shared/pdv/pdv-tela.tsx'), 'utf8')
    expect(fonte).toContain('partesDoRecebidoDaComanda(c)')
  })
})
