import { describe, it, expect } from 'vitest'
import { statusDosAgendamentos } from '@/lib/metrics/resultado'

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
