import { describe, it, expect } from 'vitest'
import { csvDoFechamento } from '@/lib/financeiro/csv-da-contadora'

// A28 da 14ª simulação (F75): o CSV do Fechamento leva a taxa e o líquido de
// cada maquininha — só quando o servidor os manda (D7: a quem vê o financeiro
// da clínica). Sem eles, a seção não sai.
const base = {
  dia: '2026-11-13', unidade: 'Centro', formas: [], total: { entradas: 0, saidas: 0, saldo: 0, lancamentos: 0 },
  esperadoDinheiro: 0, estornos: [],
}

describe('o CSV do Fechamento e as taxas por maquininha (A28 da 14ª)', () => {
  it('com as taxas, a seção sai com o bruto, a taxa e o líquido', () => {
    const linhas = csvDoFechamento({ ...base, taxasPorMaquininha: [
      { maquininha: 'Stone', bruto: 200, taxa: 6, liquido: 194 },
      { maquininha: 'Pix', bruto: 50, taxa: 0.5, liquido: 49.5 },
    ] }).replace(/^﻿/, '').split('\r\n')
    expect(linhas).toContain('Taxa e líquido por maquininha (estimados)')
    expect(linhas).toContain('Stone;200,00;6,00;194,00')
    expect(linhas).toContain('Pix;50,00;0,50;49,50')
  })
  it('sem elas (quem só recebe), nada da taxa', () => {
    expect(csvDoFechamento({ ...base, taxasPorMaquininha: null })).not.toContain('Taxa e líquido')
    expect(csvDoFechamento(base)).not.toContain('Taxa e líquido')
  })
})
