import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rotuloDaForma, maquininhaDoRotulo } from '@/lib/financeiro/formas'
import { csvDosLancamentos } from '@/lib/financeiro/csv-dos-lancamentos'

// A18 da 14ª simulação (F75): com duas maquininhas, o pagamento de cartão dizia
// só "Débito" — na confirmação, no histórico, na lista e no CSV dos
// lançamentos. Quem estornava não sabia de qual maquininha. Um rótulo só
// (`rotuloDaForma` com `maquininha`), e o nome só com MAIS DE UMA na rede.
describe('o rótulo do pagamento com a maquininha (A18 da 14ª)', () => {
  it('a maquininha vai no fim do rótulo do cartão', () => {
    expect(rotuloDaForma('DEBIT_CARD', 1, { bandeira: 'VISA', maquininha: 'Stone' })).toBe('Débito Visa · Stone')
    expect(rotuloDaForma('CREDIT_CARD', 3, { bandeira: 'MASTERCARD', maquininha: 'Mercado Pago' })).toBe('Crédito Mastercard 3x · Mercado Pago')
  })
  it('fora do cartão, a maquininha não entra', () =>
    expect(rotuloDaForma('PIX', 1, { maquininha: 'Stone' })).toBe('Pix'))
  it('o nome só com mais de uma maquininha na rede', () => {
    expect(maquininhaDoRotulo({ a: 'Stone' }, 'a')).toBeNull()
    expect(maquininhaDoRotulo(null, 'a')).toBeNull()
    expect(maquininhaDoRotulo({ a: 'Stone', b: 'Mercado Pago' }, 'b')).toBe('Mercado Pago')
    expect(maquininhaDoRotulo({ a: 'Stone', b: 'Mercado Pago' }, null)).toBeNull()
  })
  it('o CSV dos lançamentos diz a maquininha na forma', () => {
    const csv = csvDosLancamentos([{
      data: '2026-11-12T15:00:00.000Z', descricao: 'Atendimento', categoria: null, tipo: 'INCOME',
      forma: 'DEBIT_CARD', vezes: 1, valor: 100, situacao: 'PAGO', unidade: null, cliente: null,
      maquininha: 'Stone',
    } as never])
    expect(csv).toContain('Débito · Stone')
  })
})

// A trava: as telas que listam o pagamento passam a maquininha ao rótulo único.
describe('as telas dizem a maquininha (A18 da 14ª)', () => {
  const telas = [
    'components/branch/financial-table.tsx',
    'components/admin/admin-financial-view.tsx',
    'components/branch/appointment-session.tsx',
    'lib/financeiro/csv-dos-lancamentos.ts',
  ]
  for (const arquivo of telas) {
    it(arquivo, () => {
      const fonte = readFileSync(join(__dirname, '..', arquivo), 'utf8')
      expect(fonte).toMatch(/rotuloDaForma\([^)]*maquininha/)
    })
  }
})
