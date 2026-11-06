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
    expect(l[0]).toBe('Data;Descrição;Cliente;Categoria;Tipo;Forma;Situação;Valor')
    expect(l[1]).toBe('06/11/2026;Venda de produto — 1× Hidratante;Karina;Venda de produto;Receita;Pix;Pago;89,00')
    expect(l[2]).toBe('06/11/2026;Estorno: Sérum;;Estorno;Estorno;Dinheiro;Pago;-397,00')
    // O campo com ponto e vírgula vai entre aspas; o dia é o de Brasília.
    expect(l[3]).toBe('16/12/2026;"Plano; parcela 2/2";Camille;Procedimento;Receita;;Em aberto;1750,50')
  })
  it('com a unidade, a coluna dela', () => {
    const csv = csvDosLancamentos([{ ...linhas[0]!, unidade: 'Batel' }], { comUnidade: true })
    expect(csv.slice(1).split('\r\n')[0]).toBe('Data;Descrição;Cliente;Unidade;Categoria;Tipo;Forma;Situação;Valor')
  })
  it('o nome do arquivo diz o recorte', () => {
    expect(nomeDoCsvDosLancamentos('2026-11-01', '2026-11-30')).toBe('lancamentos-2026-11-01-a-2026-11-30.csv')
    expect(nomeDoCsvDosLancamentos(null, null)).toBe('lancamentos-em-aberto.csv')
  })
})
