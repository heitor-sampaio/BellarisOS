import { describe, it, expect } from 'vitest'
import { comRetratos } from '@/lib/atendimento/retrato-dos-injetaveis'
import type { AnamnesisRow } from '@/lib/anamnesis'

/**
 * O "Registrar aplicação" marca no planejamento em que atendimento cada ponto
 * foi aplicado (`atendimento`, a aplicação do retoque são só os pontos dele —
 * PT-13, decisão do Claude, 27/11). A marca é controle do planejamento: o
 * retrato da ficha guarda o planejado naquele dia, os pontos como a tela os
 * mostra, e `e2e/atendimento-ficha-planejador-injetaveis.spec.ts` exige o
 * retrato igual aos pontos.
 */
const ID = '11111111-1111-4111-8111-111111111111'
const rows: AnamnesisRow[] = [
  { id: 'r1', fields: [{ id: 'mapa', type: 'injectable_map', label: 'Planejador', options: ['Toxina'] }] },
]
const ponto = { id: 'p1', x: 0.5, y: 0.3, product: 'Toxina', dose: 4, unit: 'UI', applied: null, view: 'rosto_f' }

describe('o retrato da ficha sem a marca do atendimento', () => {
  it('os pontos marcados com o atendimento entram no retrato sem a marca', () => {
    const mapas = new Map([[ID, { id: ID, name: 'Toxina', view: 'rosto_f', points: [{ ...ponto, atendimento: 'a1' }] }]])
    const r = comRetratos(rows, { mapa: { view: 'rosto_f', points: [], planejamento: { id: ID, nome: '' } } }, mapas, '2026-11-27T12:00:00.000Z')
    if ('error' in r) throw new Error(r.error)
    expect((r.answers.mapa as { points: unknown[] }).points).toEqual([ponto])
  })
})
