import { describe, it, expect } from 'vitest'
import { taxaNaMaquininha, maquininhaDaVenda, maximoDaMaquininha, lerMaquininha, EntradaDaMaquininha } from '@/lib/financeiro/maquininhas'
import { csvDoFechamento } from '@/lib/financeiro/csv-da-contadora'

/**
 * As maquininhas (C75 da F67): a taxa que vale (o espelho de
 * `private.taxa_da_maquininha`), a da venda sem escolha e o Fechamento
 * separado por maquininha.
 */

const stone = lerMaquininha({
  id: '00000000-0000-0000-0000-000000000001', nome: 'Stone', ordem: 1, prazo_dias: 2,
  taxas: { 'DEBIT_CARD:1': 1.2, 'CREDIT_CARD:1': 3, 'CREDIT_CARD:3': 5, 'XPTO:1': 9 },
  cobra_por_bandeira: false, por_bandeira: { ELO: { taxas: { 'CREDIT_CARD:3': 6 } } }, arquivada_em: null,
})

describe('a taxa da maquininha', () => {
  it('a das vezes exatas; sem ela, nula (vale 0%) — nunca a de outra quantidade', () => {
    expect(taxaNaMaquininha(stone, 'CREDIT_CARD', 3)).toEqual({ taxa: 5, daBandeira: false })
    expect(taxaNaMaquininha(stone, 'CREDIT_CARD', 2)).toEqual({ taxa: null, daBandeira: false })
    expect(taxaNaMaquininha(stone, 'DEBIT_CARD', 1)).toEqual({ taxa: 1.2, daBandeira: false })
    expect(Object.keys(stone.taxas), 'chave desconhecida fica de fora').not.toContain('XPTO:1')
  })
  it('a da bandeira só vale com "cobra diferente em alguma bandeira?" marcado', () => {
    expect(taxaNaMaquininha(stone, 'CREDIT_CARD', 3, 'ELO').taxa, 'desmarcado: guardada, sem valer').toBe(5)
    expect(taxaNaMaquininha({ ...stone, cobraPorBandeira: true }, 'CREDIT_CARD', 3, 'ELO')).toEqual({ taxa: 6, daBandeira: true })
    expect(taxaNaMaquininha({ ...stone, cobraPorBandeira: true }, 'CREDIT_CARD', 1, 'ELO')).toEqual({ taxa: 3, daBandeira: false })
  })
  it('parcela até a maior vez com taxa, quando não diz', () => {
    expect(maximoDaMaquininha(stone)).toBe(3)
    expect(maximoDaMaquininha({ ...stone, maxVezes: 6 })).toBe(6)
  })
})

describe('a maquininha da venda', () => {
  const primeira = { id: 'a', arquivada: true }
  const segunda = { id: 'b', arquivada: false }
  it('a escolhida; sem escolha, a primeira ativa', () => {
    expect(maquininhaDaVenda([primeira, segunda], 'a')?.id).toBe('a')
    expect(maquininhaDaVenda([primeira, segunda], null)?.id).toBe('b')
    expect(maquininhaDaVenda([primeira, segunda], 'zzz')?.id).toBe('b')
  })
})

describe('o que o "Salvar taxas" manda', () => {
  const base = { nome: 'Stone', taxas: { 'CREDIT_CARD:12': 120 }, maxVezes: null, prazoDias: 30, cobraPorBandeira: false, porBandeira: {} }
  it('sem teto de taxa (F16-3), mas sem negativa, sem nome vazio e sem prazo fora de 1 a 120', () => {
    expect(EntradaDaMaquininha.safeParse(base).success).toBe(true)
    expect(EntradaDaMaquininha.safeParse({ ...base, taxas: { 'CREDIT_CARD:3': -1 } }).success).toBe(false)
    expect(EntradaDaMaquininha.safeParse({ ...base, nome: '  ' }).success).toBe(false)
    expect(EntradaDaMaquininha.safeParse({ ...base, prazoDias: 0 }).success).toBe(false)
    expect(EntradaDaMaquininha.safeParse({ ...base, taxas: { 'PIX:1': 1 } }).success, 'o Pix é fora das maquininhas').toBe(false)
  })
})

describe('o Fechamento por maquininha', () => {
  const base = {
    dia: '2026-11-12', unidade: 'Acácia',
    formas: [{ forma: 'DEBIT_CARD', entradas: 300, saidas: 0, saldo: 300, lancamentos: 2 }],
    total: { entradas: 300, saidas: 0, saldo: 300, lancamentos: 2 }, esperadoDinheiro: 0, estornos: [],
  }
  it('com uma maquininha no dia, como antes; com duas, a linha diz qual', () => {
    const uma = csvDoFechamento({ ...base, bandeiras: [
      { forma: 'DEBIT_CARD', maquininha: 'Stone', bandeira: 'VISA', entradas: 300, saidas: 0 },
    ] })
    expect(uma).toContain('Cartão por bandeira')
    expect(uma).toContain('Cartão de débito · Visa;300,00')
    const duas = csvDoFechamento({ ...base, bandeiras: [
      { forma: 'DEBIT_CARD', maquininha: 'Stone', bandeira: 'VISA', entradas: 200, saidas: 0 },
      { forma: 'DEBIT_CARD', maquininha: 'Cielo', bandeira: null, entradas: 100, saidas: 0 },
    ] })
    expect(duas).toContain('Cartão por maquininha e bandeira')
    expect(duas).toContain('Cartão de débito · Stone · Visa;200,00')
    expect(duas).toContain('Cartão de débito · Cielo · Bandeira não informada;100,00')
  })
})
