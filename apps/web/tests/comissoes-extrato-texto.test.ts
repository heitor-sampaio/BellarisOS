import { describe, it, expect } from 'vitest'
import { tituloDoLancamento, regraDoLancamento, csvDoExtrato } from '@/lib/comissoes/extrato-texto'
import type { LancamentoDoExtrato } from '@/lib/comissoes/leitura'

const base: LancamentoDoExtrato = {
  id: 'l1', professionalId: 'p1', branchId: 'b1', releasedAt: '2026-11-10T13:00:00Z', kind: 'LIBERACAO', motivo: null, amount: 420,
  status: 'OPEN', payoutId: null, appointmentId: null, scheduledAt: '2026-11-10T13:00:00Z', cliente: 'Beatriz Nogueira', procedimento: null,
  origem: 'PLANO_VENDA', preco: 8400, regraTipo: 'PERCENTAGE', regraValor: 5, pacote: null, descontaTaxa: false, descontaInsumos: false,
  previsto: null, baseComPontos: 'PRECO', plano: null, base: 8400, baseDesconto: 0, baseTaxa: 0, baseInsumos: 0, baseFator: 1, pagoEm: null,
  regraDe: 'CLINICA',
}

// A43 da 11ª: "Procedimento · Beatriz Nogueira" na venda do plano.
describe('A43: o título do lançamento de venda diz que é venda', () => {
  it('a venda do plano sem nome', () => {
    expect(tituloDoLancamento(base)).toBe('Venda de plano')
  })
  it('a venda do plano com nome, do pacote e do pré-pago', () => {
    expect(tituloDoLancamento({ ...base, plano: 'Harmonização', procedimento: 'Harmonização' })).toBe('Venda do plano Harmonização')
    expect(tituloDoLancamento({ ...base, origem: 'PACOTE_VENDA', pacote: '10 drenagens', procedimento: '10 drenagens' })).toBe('Venda do pacote 10 drenagens')
    expect(tituloDoLancamento({ ...base, origem: 'PRE_PAGO_VENDA', procedimento: 'Drenagem' })).toBe('Venda de procedimento: Drenagem')
  })
  it('o atendimento segue com o procedimento', () => {
    expect(tituloDoLancamento({ ...base, origem: 'AVULSO', procedimento: 'Toxina' })).toBe('Toxina')
  })
})

// A17 da 11ª: de onde veio o percentual.
describe('A17: a regra diz de onde veio', () => {
  it('da pessoa, do item, da clínica', () => {
    expect(regraDoLancamento({ ...base, regraValor: 3, regraDe: 'PESSOA' }, 'Tatiane')).toBe('3% — da Tatiane')
    expect(regraDoLancamento({ ...base, origem: 'PACOTE_VENDA', regraValor: 10, regraDe: 'ITEM' }, 'Tatiane')).toBe('10% — do pacote')
    expect(regraDoLancamento({ ...base, origem: 'PRODUTO', regraValor: 10, regraDe: 'ITEM' }, 'Tatiane')).toBe('10% — do produto')
    expect(regraDoLancamento({ ...base, regraDe: 'CLINICA' }, 'Tatiane')).toBe('5% — da clínica')
    expect(regraDoLancamento({ ...base, regraDe: null }, 'Tatiane')).toBe('5%')
  })
})

// A44 da 11ª: "Taxa da maquininha" e "Insumos" saíam 0,00 com a base cheia.
describe('A44: o CSV não diz 0,00 do que não sai da base', () => {
  it('a taxa e os insumos vazios quando não são descontados; com o desconto, o valor', () => {
    const csv = csvDoExtrato([base, { ...base, id: 'l2', descontaTaxa: true, baseTaxa: 6.3 }], new Map([['p1', 'Tatiane']]), new Map([['b1', 'Azaleia']]))
    // Os campos com ";" vêm entre aspas: o CSV lido como o Excel lê.
    const campos = (linha: string) => [...linha.matchAll(/("([^"]|"")*"|[^;]*)(;|$)/g)].map(m => m[1]!.replace(/^"|"$/g, '').replace(/""/g, '"')).slice(0, -1)
    const l = csv.slice(1).split('\r\n')
    const cab = campos(l[0]!)
    const iTaxa = cab.indexOf('Taxa da maquininha'), iIns = cab.indexOf('Insumos'), iRegra = cab.indexOf('Regra')
    const sem = campos(l[1]!), com = campos(l[2]!)
    expect([sem[iTaxa], sem[iIns]]).toEqual(['', ''])
    expect(com[iTaxa]).toBe('6,30')
    expect(sem[iRegra]).toBe('5% — da clínica')
  })
})
