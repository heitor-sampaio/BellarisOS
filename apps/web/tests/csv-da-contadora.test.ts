import { describe, it, expect } from 'vitest'
import { csvDoDre, csvDoFechamento } from '@/lib/financeiro/csv-da-contadora'

// A31 da 10ª simulação (2026-11-10): o DRE e o Fechamento do dia se exportam,
// com o que fica fora do resultado (a compra no estoque, com fornecedor e nota,
// e a perda). Os números chegam prontos; o CSV só escreve.
describe('A31: o CSV da contadora', () => {
  it('o DRE com os custos negativos e o que fica fora do resultado', () => {
    const csv = csvDoDre({
      periodo: 'Novembro de 2026', receita: 5538, despesaOperacional: 15200, insumos: 79.98, taxas: 265.92, comissoes: 735.36, lucro: -10743.26,
      compras: { total: 1689, linhas: [{ dia: '2026-11-10T13:00:00Z', unidade: 'Tulipa Centro', produto: 'Ácido; hialurônico', embalagens: 3, embalagem: 'frasco', custo: 1689, fornecedor: 'Distribuidora Sul', notaFiscal: '004630' }] },
      perdas: 640,
    })
    expect(csv.startsWith('﻿')).toBe(true)
    const l = csv.slice(1).split('\r\n')
    expect(l).toContain('Receita paga;5538,00')
    expect(l).toContain('Despesas operacionais;-15200,00')
    expect(l).toContain('Lucro;-10743,26')
    expect(l).toContain('Compras no estoque (entradas, ao custo);1689,00')
    expect(l).toContain('Perdas no período (métrica);640,00')
    expect(l).toContain('10/11/2026;Tulipa Centro;"Ácido; hialurônico";3;frasco;1689,00;Distribuidora Sul;004630')
  })
  it('o Fechamento: as formas, o total, o esperado e os estornos', () => {
    const csv = csvDoFechamento({
      dia: '2026-11-10', unidade: 'Tulipa Centro',
      formas: [{ forma: 'PIX', entradas: 1000, saidas: 14000, saldo: -13000, lancamentos: 2 }],
      total: { entradas: 1000, saidas: 14000, saldo: -13000, lancamentos: 2 }, esperadoDinheiro: 0,
      estornos: [{ descricao: 'Estorno: Sérum', forma: 'CASH', vezes: null, valor: 397, motivo: 'devolveu', pagoEm: '2026-11-09T15:00:00Z', mesmoDia: false }],
    })
    const l = csv.slice(1).split('\r\n')
    expect(l[1]).toBe('Forma;Entradas;Saídas;Saldo;Lançamentos')
    expect(l[2]).toBe('Pix;1000,00;14000,00;-13000,00;2')
    expect(l[3]).toBe('Total do dia;1000,00;14000,00;-13000,00;2')
    // D2 da 12ª: o dia do pagamento estornado, e se o estorno está nas saídas do dia.
    expect(l).toContain('Descrição;Forma;Valor;Motivo;Pagamento de;Nas saídas do dia')
    expect(l).toContain('Estorno: Sérum;Dinheiro;-397,00;devolveu;09/11/2026;Sim')
  })
})

// A40 e A44 da 11ª simulação (2026-11-10): o CSV do Fechamento só trazia as
// formas — com duas recepcionistas, cada uma precisa saber o que entrega.
describe('A40/A44: o CSV do Fechamento por quem recebeu', () => {
  it('cada pessoa, por forma, e o total dela; o sem registro diz isso', () => {
    const csv = csvDoFechamento({
      dia: '2026-11-10', unidade: 'Azaleia Pituba',
      formas: [{ forma: 'PIX', entradas: 130, saidas: 0, saldo: 130, lancamentos: 2 }],
      total: { entradas: 130, saidas: 0, saldo: 130, lancamentos: 2 }, esperadoDinheiro: 50, estornos: [],
      porQuemRecebeu: [
        { pessoa: 'e', nome: 'Elaine', formas: [{ forma: 'PIX', entradas: 100, lancamentos: 1 }], total: { entradas: 100, lancamentos: 1 } },
        { pessoa: null, nome: null, formas: [{ forma: 'CASH', entradas: 30, lancamentos: 1 }], total: { entradas: 30, lancamentos: 1 } },
      ],
    })
    const l = csv.slice(1).split('\r\n')
    expect(l).toContain('Por quem recebeu')
    expect(l).toContain('Elaine;Pix;100,00;1')
    expect(l).toContain('Elaine;Total;100,00;1')
    expect(l).toContain('Não registrado;Dinheiro;30,00;1')
  })
})
