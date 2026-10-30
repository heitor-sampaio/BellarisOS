import { describe, it, expect } from 'vitest'
import { statusDosAgendamentos, maisRealizado } from '@/lib/metrics/resultado'

/**
 * J-57 (2026-10-30): o "Status dos agendamentos" deixava de fora os que ainda
 * estão em aberto. As fatias saem do núcleo (total, concluídos, cancelados,
 * faltas) — o "em aberto" é o resto, contado aqui, não na tela.
 */
describe('statusDosAgendamentos', () => {
  it('7 no mês: 4 concluídos, 1 cancelado e 2 em aberto', () => {
    expect(statusDosAgendamentos({ total: 7, concluidos: 4, cancelados: 1, faltas: 0 })).toEqual([
      { status: 'COMPLETED', n: 4 },
      { status: 'CANCELLED', n: 1 },
      { status: 'NO_SHOW',   n: 0 },
      { status: 'ABERTO',    n: 2 },
    ])
  })

  it('o em aberto nunca é negativo', () => {
    expect(statusDosAgendamentos({ total: 1, concluidos: 2, cancelados: 0, faltas: 0 }).at(-1)).toEqual({ status: 'ABERTO', n: 0 })
  })
})

/**
 * J-58 (2026-10-30): o "Mais realizado" escolhia pela ORDEM ALFABÉTICA no
 * empate — com 3 execuções de Limpeza e 3 de Peeling, dizia "Limpeza" sem
 * avisar. O empate em execuções se desfaz pela RECEITA; empatando também
 * nela, a tela diz que houve empate e mostra os empatados.
 */
describe('maisRealizado', () => {
  it('o de mais execuções, sem empate', () => {
    expect(maisRealizado([
      { nome: 'Limpeza', execucoes: 2, receita: 400 },
      { nome: 'Peeling', execucoes: 5, receita: 100 },
    ])).toEqual({ nomes: ['Peeling'], execucoes: 5, desempatePelaReceita: false })
  })

  it('empate em execuções: vence a maior receita, e diz que foi pela receita', () => {
    expect(maisRealizado([
      { nome: 'Árvore', execucoes: 3, receita: 300 },
      { nome: 'Peeling', execucoes: 3, receita: 540 },
    ])).toEqual({ nomes: ['Peeling'], execucoes: 3, desempatePelaReceita: true })
  })

  it('empate em execuções e em receita: os dois, sem escolher pelo alfabeto', () => {
    expect(maisRealizado([
      { nome: 'Peeling', execucoes: 3, receita: 300 },
      { nome: 'Limpeza', execucoes: 3, receita: 300 },
      { nome: 'Toxina', execucoes: 1, receita: 900 },
    ])).toEqual({ nomes: ['Limpeza', 'Peeling'], execucoes: 3, desempatePelaReceita: false })
  })

  it('sem nada no período, nulo', () => {
    expect(maisRealizado([])).toBeNull()
  })
})
