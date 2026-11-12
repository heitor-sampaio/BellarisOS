import { describe, it, expect } from 'vitest'
import { csvDosLancamentos, nomeDoCsvDosLancamentos } from '@/lib/financeiro/csv-dos-lancamentos'

// A44 da 8ª simulação (2026-11-06): a contadora não tinha CSV das
// movimentações do Financeiro, só o de Comissões.
describe('A44: o CSV das movimentações', () => {
  const linhas = [
    { data: '2026-11-06T15:00:00Z', descricao: 'Venda de produto — 1× Hidratante', cliente: 'Karina', categoria: 'Venda de produto',
      tipo: 'INCOME', forma: 'PIX', vezes: null, situacao: 'PAGO' as const, valor: 89 },
    { data: '2026-11-06T16:00:00Z', descricao: 'Estorno: Sérum', cliente: null, categoria: 'Estorno',
      tipo: 'EXPENSE', forma: 'CASH', vezes: null, situacao: 'PAGO' as const, valor: 397, estorno: true },
    { data: '2026-12-16T03:00:00Z', descricao: 'Plano; parcela 2/2', cliente: 'Camille', categoria: 'Procedimento',
      tipo: 'INCOME', forma: null, vezes: null, situacao: 'EM_ABERTO' as const, valor: 1750.5 },
  ]
  it('cabeçalho, ponto e vírgula, BOM e o valor com sinal e vírgula', () => {
    const csv = csvDosLancamentos(linhas)
    expect(csv.startsWith('\uFEFF')).toBe(true)
    const l = csv.slice(1).split('\r\n')
    expect(l[0]).toBe('Data;Descrição;Cliente;Unidade;Profissional;Quem vendeu;Categoria;Tipo;Forma;Bandeira;Situação;Valor;Conta no caixa;Desconto;Taxa da maquininha;Líquido;Vencimento;Pago em;Fornecedor (se informado);Nota fiscal (se informada)')
    expect(l[1]).toBe('06/11/2026;Venda de produto — 1× Hidratante;Karina;;;;Venda de produto;Receita;Pix;;Pago;89,00;Sim;;;;;;;')
    expect(l[2]).toBe('06/11/2026;Estorno: Sérum;;;;;Estorno;Estorno;Dinheiro;;Pago;-397,00;Não;;;;;;;')
    // O campo com ponto e vírgula vai entre aspas; o dia é o de Brasília.
    expect(l[3]).toBe('16/12/2026;"Plano; parcela 2/2";Camille;;;;Procedimento;Receita;;;Em aberto;1750,50;Não;;;;;;;')
  })
  it('com a unidade, a coluna dela', () => {
    const csv = csvDosLancamentos([{ ...linhas[0]!, unidade: 'Batel' }])
    expect(csv.slice(1).split('\r\n')[1]).toContain('Karina;Batel;')
  })
  it('A31 da 10ª: a taxa, o líquido, o vencimento, o pagamento, o fornecedor e a nota', () => {
    const csv = csvDosLancamentos([
      { ...linhas[0]!, valor: 1000, taxa: 20, liquido: 980, pagoEm: '2026-11-10T13:00:00Z' },
      { data: '2026-11-10T13:00:00Z', descricao: 'Aluguel', cliente: null, categoria: 'Aluguel', tipo: 'EXPENSE', forma: 'BOLETO', vezes: null,
        situacao: 'EM_ABERTO' as const, valor: 9000, vencimento: '2026-11-30T15:00:00Z', fornecedor: 'Imobiliária Centro', nota: 'NF-77' },
    ])
    const l = csv.slice(1).split('\r\n')
    expect(l[1]).toBe('06/11/2026;Venda de produto — 1× Hidratante;Karina;;;;Venda de produto;Receita;Pix;;Pago;1000,00;Sim;;20,00;980,00;;10/11/2026;;')
    expect(l[2]).toBe('10/11/2026;Aluguel;;;;;Aluguel;Despesa;Boleto;;Em aberto;-9000,00;Não;;;;30/11/2026;;Imobiliária Centro;NF-77')
  })
  // A45 da 12ª: o CSV trazia o "Estornado", o "Estorno" e a nova linha juntos, e
  // somar a coluna Valor dava errado. "Conta no caixa" (do banco): somar só os
  // "Sim" dá o caixa — o pagamento pelo que entrou, o estorno negativo.
  it('A45: "Conta no caixa" — o valor do caixa nos "Sim"', () => {
    const csv = csvDosLancamentos([
      { ...linhas[0]!, descricao: 'Crédito na clínica', valor: 163.64, noCaixa: 300 },
      { ...linhas[1]!, descricao: 'Estorno parcial: Crédito na clínica', valor: 136.36, noCaixa: -136.36 },
      { ...linhas[0]!, descricao: 'Uso do crédito', forma: 'INTERNAL_CREDIT', valor: 180, noCaixa: null },
    ])
    const l = csv.slice(1).split('\r\n')
    expect(l[1]).toContain(';Pago;300,00;Sim;')
    expect(l[2]).toContain(';Pago;-136,36;Sim;')
    expect(l[3]).toContain(';Pago;180,00;Não;')
  })
  it('o nome do arquivo diz o recorte', () => {
    expect(nomeDoCsvDosLancamentos('2026-11-01', '2026-11-30')).toBe('lancamentos-2026-11-01-a-2026-11-30.csv')
    expect(nomeDoCsvDosLancamentos(null, null)).toBe('lancamentos-em-aberto.csv')
  })
})
