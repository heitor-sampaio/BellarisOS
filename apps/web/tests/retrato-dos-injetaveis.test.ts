import { describe, it, expect } from 'vitest'
import { planejamentosDaFicha, comRetratos } from '@/lib/atendimento/retrato-dos-injetaveis'
import type { AnamnesisRow } from '@/lib/anamnesis'

/**
 * O planejador de injetáveis da ficha do procedimento abre o planejamento DA
 * CLIENTE (2026-10-29, pedido do Heitor). A resposta da ficha guarda o id do
 * planejamento usado e um RETRATO dos pontos de quando a ficha foi salva ou o
 * atendimento finalizado — o prontuário mostra o que foi planejado naquele
 * dia, mesmo que o planejamento mude depois. O retrato sai do planejamento
 * gravado (lido no servidor), nunca dos pontos que o navegador mandou.
 */

const ID = '11111111-1111-4111-8111-111111111111'
const OUTRO = '22222222-2222-4222-8222-222222222222'

const rows: AnamnesisRow[] = [
  { id: 'r1', fields: [{ id: 'regiao', type: 'text', label: 'Região' }] },
  { id: 'r2', fields: [{ id: 'mapa', type: 'injectable_map', label: 'Planejador', options: ['Toxina'] }] },
]

const ponto = { id: 'p1', x: 0.5, y: 0.3, product: 'Toxina', dose: 4, unit: 'UI', applied: null, view: 'rosto_f' }
const AGORA = '2026-10-29T15:00:00.000Z'

describe('planejamentosDaFicha', () => {
  it('acha o id do planejamento usado no campo do planejador', () => {
    expect(planejamentosDaFicha(rows, { regiao: 'Testa', mapa: { view: 'rosto_f', points: [], planejamento: { id: ID, nome: '' } } }))
      .toEqual([ID])
  })

  it('o mapa solto (ficha antiga) e o campo vazio não pedem planejamento', () => {
    expect(planejamentosDaFicha(rows, { mapa: { view: 'rosto_f', points: [ponto] } })).toEqual([])
    expect(planejamentosDaFicha(rows, {})).toEqual([])
  })

  it('só o campo do planejador conta: um "planejamento" noutro campo não', () => {
    expect(planejamentosDaFicha(rows, { regiao: { planejamento: { id: ID } } as unknown as string })).toEqual([])
  })
})

describe('comRetratos', () => {
  const mapas = new Map([[ID, { id: ID, name: 'Toxina terço superior', view: 'rosto_f', points: [ponto] }]])

  it('troca o que veio do navegador pelo retrato do planejamento gravado', () => {
    const r = comRetratos(rows, {
      regiao: 'Testa',
      // Os pontos que o navegador manda não valem: o retrato é o gravado.
      mapa: { view: 'corpo_f', points: [{ ...ponto, id: 'forjado', dose: 999 }], planejamento: { id: ID, nome: 'outro nome' } },
    }, mapas, AGORA)
    expect('error' in r).toBe(false)
    if ('error' in r) return
    expect(r.answers.regiao).toBe('Testa')
    expect(r.answers.mapa).toEqual({
      view: 'rosto_f', points: [ponto], confirmedAt: null,
      planejamento: { id: ID, nome: 'Toxina terço superior' }, retratoEm: AGORA,
    })
  })

  it('a ficha antiga (mapa solto) fica como está', () => {
    const solto = { view: 'rosto_f', points: [ponto], confirmedAt: null }
    const r = comRetratos(rows, { mapa: solto }, mapas, AGORA)
    expect(r).toEqual({ answers: { mapa: solto } })
  })

  it('planejamento que não está entre os que se podem retratar (outra cliente, outra rede) é recusado', () => {
    const r = comRetratos(rows, { mapa: { view: 'rosto_f', points: [], planejamento: { id: OUTRO, nome: '' } } }, mapas, AGORA)
    expect(r).toEqual({ error: 'Planejamento de injetáveis não encontrado para esta cliente.' })
  })

  it('id que não é uuid também é recusado, em vez de gravar um planejamento de mentira', () => {
    const r = comRetratos(rows, { mapa: { view: 'rosto_f', points: [], planejamento: { id: 'x', nome: '' } } }, mapas, AGORA)
    expect(r).toEqual({ error: 'Planejamento de injetáveis não encontrado para esta cliente.' })
  })

  it('planejamento sem nome ganha o nome padrão no retrato', () => {
    const r = comRetratos(rows, { mapa: { view: 'rosto_f', points: [], planejamento: { id: ID, nome: '' } } },
      new Map([[ID, { id: ID, name: null, view: null, points: null }]]), AGORA)
    expect(r).toEqual({ answers: { mapa: {
      view: 'rosto_f', points: [], confirmedAt: null, planejamento: { id: ID, nome: 'Planejamento sem nome' }, retratoEm: AGORA,
    } } })
  })
})
