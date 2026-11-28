import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pontosDaDevolucao, textoDosPontosDaDevolucao, type PagamentoQueVolta } from '@/lib/fidelidade/pontos-da-devolucao'

/**
 * ES-02 (fidelidade): a janela do estorno diz ANTES quantos pontos saem e o saldo de antes e de depois. O
 * estorno inteiro já dizia ("Saem 180 pontos de Carla…: o saldo dela vai de 380 a 200 pontos."); o "Devolver
 * parte da venda" dizia só "e os pontos dele saem do saldo" (D7 da 42ª, a Wilma no Protetor da B07).
 *
 * A conta é a que `produto_devolver_itens` faz ao devolver por estorno: os pagamentos vivos da venda, do mais
 * novo ao mais velho; o que cabe inteiro no que volta é estornado inteiro (`estornar_transacao`: saem os
 * pontos que ele deu e voltam os usados nele); o que passa do que volta vai em parte — no estorno parcial
 * saem os pontos na proporção (round(pontos × volta ÷ valor)); no "estornar inteiro e lançar o usado de novo"
 * saem os dele, voltam os usados, e o que fica, lançado de novo, pontua pelo real pago (a venda de produto).
 */

const WEB = join(__dirname, '..')
const ler = (c: string) => readFileSync(join(WEB, c), 'utf8').replace(/\r/g, '')

const pix = (extra: Partial<PagamentoQueVolta> = {}): PagamentoQueVolta => ({
  id: 'p1', valor: 190, pagoEm: '2026-11-28T10:00:00Z', criadoEm: '2026-11-28T10:00:00Z', ganhos: 190, usados: 0, ...extra,
})

describe('os pontos que saem na devolução de parte da venda', () => {
  it('um pagamento só, em parte: o estorno parcial tira na proporção; o inteiro tira tudo e o que fica pontua de novo', () => {
    const c = pontosDaDevolucao([pix()], 100, 1)
    expect(c.PARCIAL).toEqual({ saem: 100, voltam: 0, entram: 0, inteiros: [] })
    expect(c.INTEIRO).toEqual({ saem: 190, voltam: 0, entram: 90, inteiros: ['p1'] })
  })

  it('do mais novo ao mais velho: o que cabe no que volta sai inteiro, com os pontos usados', () => {
    const velho = pix({ id: 'velho', valor: 140, ganhos: 140, pagoEm: '2026-11-27T10:00:00Z', criadoEm: '2026-11-27T10:00:00Z' })
    const novo = pix({ id: 'novo', valor: 50, ganhos: 30, usados: 20 })
    const c = pontosDaDevolucao([velho, novo], 100, 1)
    expect(c.PARCIAL).toEqual({ saem: 30 + 50, voltam: 20, entram: 0, inteiros: ['novo'] })
    expect(c.INTEIRO).toEqual({ saem: 30 + 140, voltam: 20, entram: 90, inteiros: ['novo', 'velho'] })
  })

  it('o que volta cobre tudo: os dois modos são o mesmo', () => {
    const c = pontosDaDevolucao([pix()], 190, 1)
    expect(c.PARCIAL).toEqual(c.INTEIRO)
    expect(c.PARCIAL.saem).toBe(190)
  })

  it('o que fica, lançado de novo, só pontua se a venda de produto pontua', () => {
    expect(pontosDaDevolucao([pix()], 100, null).INTEIRO.entram).toBe(0)
  })

  it('o texto diz os pontos e o saldo de antes e de depois', () => {
    expect(textoDosPontosDaDevolucao({ ligada: true, cliente: 'Glória', saldo: 170, conta: { saem: 100, voltam: 0, entram: 0, inteiros: [] } }))
      .toBe('Saem 100 pontos de Glória: o saldo dela vai de 170 a 70 pontos.')
    expect(textoDosPontosDaDevolucao({ ligada: true, cliente: 'Glória', saldo: 170, conta: { saem: 80, voltam: 20, entram: 0, inteiros: ['x'] } }))
      .toBe('Saem 80 pontos de Glória e voltam os 20 pontos usados: o saldo dela vai de 170 a 110 pontos.')
    expect(textoDosPontosDaDevolucao({ ligada: true, cliente: 'Glória', saldo: 170, conta: { saem: 190, voltam: 0, entram: 90, inteiros: ['x'] } }))
      .toBe('Saem 190 pontos de Glória, e o que fica, lançado de novo, dá 90 pontos: o saldo dela vai de 170 a 70 pontos.')
    expect(textoDosPontosDaDevolucao({ ligada: true, cliente: 'Glória', saldo: 50, conta: { saem: 100, voltam: 0, entram: 0, inteiros: [] } }))
      .toBe('Saem 100 pontos de Glória: o saldo dela vai de 50 a −50 pontos (fica negativo).')
  })

  it('com a fidelidade desligada, ou sem ponto nenhum a mexer, nada', () => {
    const conta = { saem: 100, voltam: 0, entram: 0, inteiros: [] }
    expect(textoDosPontosDaDevolucao({ ligada: false, cliente: 'Glória', saldo: 170, conta })).toBeNull()
    expect(textoDosPontosDaDevolucao({ ligada: true, cliente: 'Glória', saldo: 170, conta: { ...conta, saem: 0 } })).toBeNull()
  })
})

describe('a janela "Devolver parte da venda" mostra o número', () => {
  it('a prévia da action traz os pontos de cada jeito de estornar, pela conta do estorno inteiro', () => {
    const a = ler('actions/devolucao-de-produto.ts')
    const corpo = a.slice(a.indexOf('export async function previaDaDevolucao'), a.indexOf('const EntradaDaDevolucao'))
    expect(corpo).toContain("'fidelidade_pontos_do_estorno'")
    expect(corpo).toContain('pontosDaDevolucao(')
    expect(corpo).toContain('textoDosPontosDaDevolucao(')
  })
  it('a escolha mostra o texto do jeito escolhido, no lugar do "e os pontos dele saem do saldo"', () => {
    const e = ler('components/shared/escolha-da-devolucao.tsx')
    expect(e).toContain('data-pontos-da-devolucao')
    const d = ler('components/shared/devolver-parte-da-venda.tsx')
    expect(d).toMatch(/<EscolhaDaDevolucao[^>]*pontosDaDevolucao=\{previa\.pontos/)
  })
})
