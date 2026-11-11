import { describe, expect, it } from 'vitest'
import { textoDaComissaoDaVenda } from '@/lib/comissoes/comissao-da-venda'
import { tituloDoLancamento } from '@/lib/comissoes/extrato-texto'
import type { LancamentoDoExtrato } from '@/lib/comissoes/leitura'

/** Os atritos do comercial da 12ª simulação (2026-11-10/11): A18 e A20. */

describe('A18: o Vender diz a comissão de venda de quem vendeu e de onde vem', () => {
  const rita = { nome: 'Rita', pct: 8 }
  it('o pacote com "De venda" vence a da pessoa; sem, vale a da pessoa', () => {
    expect(textoDaComissaoDaVenda({ tipo: 'PACOTE', itens: [{ regra: { tipo: 'PERCENTAGE', valor: 5 } }], pessoa: rita }))
      .toBe('Comissão de venda de Rita: 5% do vendido — do pacote. Sai quando a venda estiver paga inteira.')
    expect(textoDaComissaoDaVenda({ tipo: 'PACOTE', itens: [{ regra: null }], pessoa: rita }))
      .toBe('Comissão de venda de Rita: 8% do vendido — da Rita. Sai quando a venda estiver paga inteira.')
  })
  it('o pré-pago é a da pessoa; sem ela, diz que não há', () => {
    expect(textoDaComissaoDaVenda({ tipo: 'PRE_PAGO', itens: [{ regra: null }], pessoa: rita })).toContain('8% do vendido — da Rita')
    expect(textoDaComissaoDaVenda({ tipo: 'PRE_PAGO', itens: [{ regra: null }], pessoa: { nome: 'Rita', pct: null } }))
      .toBe('Rita não tem comissão de venda: o pré-pago usa a comissão de venda da pessoa (Equipe → Comissão).')
  })
  it('o produto: a do produto, senão a da pessoa, senão a da clínica — e cada item com a sua', () => {
    expect(textoDaComissaoDaVenda({ tipo: 'PRODUTO', itens: [{ nome: 'Sérum', regra: null }], pessoa: { nome: 'Rita', pct: null }, clinicaPct: 2 }))
      .toContain('2% do vendido — da clínica')
    expect(textoDaComissaoDaVenda({
      tipo: 'PRODUTO', pessoa: rita, clinicaPct: 2,
      itens: [{ nome: 'Sérum', regra: { tipo: 'PERCENTAGE', valor: 10 } }, { nome: 'Protetor', regra: { tipo: 'FIXED_AMOUNT', valor: 3 } }, { nome: 'Gel', regra: null }],
    })?.replace(/\s/g, ' ')).toBe('Comissão de venda de Rita: Sérum, 10% do vendido — do produto; Protetor, R$ 3,00 por unidade — do produto; Gel, 8% do vendido — da Rita. Sai quando a venda estiver paga inteira.')
  })
  it('sem saber a da pessoa (a comissão de outra pessoa, que o cargo não vê), não diz nada que dependa dela', () => {
    expect(textoDaComissaoDaVenda({ tipo: 'PACOTE', itens: [{ regra: null }], pessoa: { nome: 'Paula', pct: undefined } })).toBeNull()
    expect(textoDaComissaoDaVenda({ tipo: 'PACOTE', itens: [{ regra: { tipo: 'PERCENTAGE', valor: 5 } }], pessoa: { nome: 'Paula', pct: undefined } }))
      .toContain('5% do vendido — do pacote')
  })
})

describe('A20: a venda de procedimento avulso se diz assim no extrato', () => {
  it('"Venda de procedimento: Microagulhamento", não "Venda de pré-pago"', () => {
    const l = { origem: 'PRE_PAGO_VENDA', procedimento: 'Microagulhamento' } as unknown as LancamentoDoExtrato
    expect(tituloDoLancamento(l)).toBe('Venda de procedimento: Microagulhamento')
  })
})
