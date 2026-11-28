import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { linhasPagasComFidelidade, textoDoPagoSemDinheiro } from '@/lib/financeiro/pago-sem-dinheiro'

/**
 * PD-03 (fidelidade): o que se paga com pontos ou voucher aparece à parte — "Pago com o voucher “X”:
 * R$ 180,00" ou "Pago com pontos: …" na linha. D10 da 42ª: a linha da aba Financeiro da ficha não dizia
 * nada quando o pagamento tinha dinheiro E pontos/voucher (B05, B10, B11: a comanda dizia "Pontos −R$ 30,00"
 * e a ficha, não). O texto só saía no pagamento de R$ 0, e só na lista do Financeiro.
 */

const WEB = join(__dirname, '..')
const ler = (c: string) => readFileSync(join(WEB, c), 'utf8').replace(/\r/g, '')
const sp = (t: string) => t.replace(/\s/g, ' ')
const linha = (extra: Record<string, unknown>) => ({ id: 'a', type: 'INCOME', is_paid: true, amount: 125, loyalty_discount: 15, notes: null, ...extra })

describe('a linha paga com pontos ou voucher diz isso, com ou sem dinheiro junto', () => {
  it('o pagamento com dinheiro e voucher entra; o de R$ 0, também', () => {
    expect(linhasPagasComFidelidade([linha({}), linha({ id: 'b', amount: 0, loyalty_discount: 180 })]).map(l => l.id)).toEqual(['a', 'b'])
  })
  it('sem pontos nem voucher, a receber, a saída ou o estornado: não', () => {
    expect(linhasPagasComFidelidade([
      linha({ loyalty_discount: 0 }), linha({ loyalty_discount: null }), linha({ is_paid: false }),
      linha({ type: 'EXPENSE' }), linha({ notes: 'Estornada' }),
    ])).toEqual([])
  })
  it('o texto é o de sempre', () => {
    expect(sp(textoDoPagoSemDinheiro(30, null))).toBe('Pago com pontos: R$ 30,00')
    expect(sp(textoDoPagoSemDinheiro(15, 'Desconto R$ 15'))).toBe('Pago com o voucher “Desconto R$ 15”: R$ 15,00')
  })
})

describe('a aba Financeiro da ficha', () => {
  it('lê o loyalty_discount e o texto de cada linha', () => {
    const f = ler('lib/clientes/financeiro-da-ficha.ts')
    expect(f).toMatch(/\.select\(`[^`]*loyalty_discount/)
    expect(f).toContain('pagosComFidelidade(')
    expect(f).toMatch(/pagoComFidelidade:/)
  })
  it('mostra o texto na linha, embaixo da forma', () => {
    const c = ler('components/branch/client-profile.tsx')
    expect(c).toMatch(/data-pago-com-fidelidade[\s\S]{0,300}\{t\.pagoComFidelidade\}/)
  })
})
