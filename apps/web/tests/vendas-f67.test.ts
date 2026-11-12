import { describe, expect, it } from 'vitest'
import { textoDaComissaoDaVenda } from '@/lib/comissoes/comissao-da-venda'

/** F67 (2026-11-12): vendas, financeiro e comissões — o que o levantamento das regras pediu. */

describe('C42: o checkout do plano diz a comissão de venda antes de vender', () => {
  it('a da pessoa vence a "Venda de plano" da clínica; sem ela, vale a da clínica', () => {
    expect(textoDaComissaoDaVenda({ tipo: 'PLANO', itens: [{ regra: null }], pessoa: { nome: 'Rita', pct: 8 }, clinicaPct: 5 }))
      .toBe('Comissão de venda de Rita: 8% do vendido — da Rita. Sai quando a venda estiver paga inteira.')
    expect(textoDaComissaoDaVenda({ tipo: 'PLANO', itens: [{ regra: null }], pessoa: { nome: 'Rita', pct: null }, clinicaPct: 5 }))
      .toBe('Comissão de venda de Rita: 5% do vendido — da clínica. Sai quando a venda estiver paga inteira.')
  })
  it('sem as duas, diz que não há', () => {
    expect(textoDaComissaoDaVenda({ tipo: 'PLANO', itens: [{ regra: null }], pessoa: { nome: 'Rita', pct: null }, clinicaPct: null }))
      .toBe('Rita não tem comissão de venda neste plano: nem ela nem a clínica ("Venda de plano") têm regra de venda.')
  })
})

describe('C40 (D13): a regra do item vence mesmo com 0%', () => {
  it('o pacote com "De venda" 0% não cai na da pessoa', () => {
    expect(textoDaComissaoDaVenda({ tipo: 'PACOTE', itens: [{ regra: { tipo: 'PERCENTAGE', valor: 0 } }], pessoa: { nome: 'Rita', pct: 8 } }))
      .toBe('Comissão de venda de Rita: 0% do vendido — do pacote. Sai quando a venda estiver paga inteira.')
  })
  it('o produto com 0% não cai na da pessoa nem na da clínica', () => {
    expect(textoDaComissaoDaVenda({ tipo: 'PRODUTO', itens: [{ nome: 'Sérum', regra: { tipo: 'PERCENTAGE', valor: 0 } }], pessoa: { nome: 'Rita', pct: 8 }, clinicaPct: 2 }))
      .toContain('0% do vendido — do produto')
  })
})
