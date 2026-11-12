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

describe('C37: o pagamento estornado do plano não conta como recebido', () => {
  it('a linha "Estornada" sai do recebido', async () => {
    const { separarOEmAberto } = await import('@/lib/checkout/em-aberto-do-plano')
    const r = separarOEmAberto([
      { id: 'a', amount: 300, is_paid: true, due_date: null, notes: 'Estornada' },
      { id: 'b', amount: 300, is_paid: false, due_date: null, notes: 'Reaberta pelo estorno' },
      { id: 'c', amount: 100, is_paid: true, due_date: null, notes: null },
    ] as never, new Date('2026-11-12T15:00:00Z'))
    expect(r.recebido).toBe(100)
    expect(r.emAberto).toBe(300)
    expect(r.pendentes).toEqual(['b'])
  })
})

describe('A5 da 13ª: o pacote sem "De venda" próprio diz que vale a regra de quem vendeu', () => {
  it('na lista dos pacotes', async () => {
    const { rotuloDaComissaoDoPacote } = await import('@/lib/comissoes/config')
    expect(rotuloDaComissaoDoPacote({ venda: null, execucao: { tipo: 'REGRA', valor: null } }))
      .toBe('Venda: a regra de quem vendeu · Execução: regra de cada profissional')
  })
})

describe('A11 da 13ª: o Top 5 da Visão geral diz o pago com crédito na clínica, como as tabelas', () => {
  it('uma linha por nome do Top 5 que tem crédito; o resto fica calado', async () => {
    const { notasDoTop5 } = await import('@/lib/relatorios/nota-do-top5')
    const zero = { n: 0, valor: 0 }
    expect(notasDoTop5(['Teresa', 'Sílvia', 'Rosa'], {
      Teresa: { semPagamento: zero, comCredito: { n: 1, valor: 140 } },
      Sílvia: { semPagamento: { n: 1, valor: 90 }, comCredito: zero },
      Outra:  { semPagamento: zero, comCredito: { n: 1, valor: 50 } },
    }).map(t => t.replace(/ /g, ' '))).toEqual(['Teresa: R$ 140,00 pagos com crédito na clínica (não é receita)'])
  })
})

describe('A12 da 13ª: o CSV de lançamentos separa quem atendeu de quem vendeu', () => {
  it('"Profissional" é quem atendeu, e "Quem vendeu" leva a vendedora', async () => {
    const { csvDosLancamentos } = await import('@/lib/financeiro/csv-dos-lancamentos')
    const csv = csvDosLancamentos([
      { data: '2026-11-10T15:00:00Z', descricao: 'Pacote — 5 limpezas', cliente: 'Rosa', categoria: 'Serviços', tipo: 'INCOME',
        forma: 'PIX', vezes: null, situacao: 'PAGO', valor: 750, profissional: 'Teresa', vendedor: 'Lia', unidade: 'Batel' },
    ])
    const l = csv.slice(1).split('\r\n')
    expect(l[0]).toContain(';Unidade;Profissional;Quem vendeu;Categoria;')
    expect(l[1]).toContain(';Batel;Teresa;Lia;Serviços;')
  })
})
