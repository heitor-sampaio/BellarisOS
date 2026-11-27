import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { injectableTotals } from '@/lib/anamnesis'
import {
  pontosDeOutroAtendimento, pontosDaAplicacao, confirmarNoAtendimento, type InjectablePoint,
} from '@/lib/injetaveis/aplicacao-do-atendimento'

/**
 * D2 da 37ª simulação (C04 do Instituto Tumbérgia): toxina de manhã (5 pontos,
 * 50 UI) e o retoque grátis à tarde no MESMO mapa (+1 ponto, 10 UI). O
 * "Registrar aplicação" do retoque copiava o mapa inteiro (60 UI): o histórico
 * somava 110 UI no dia contra 60 de baixa, e o Finalizar avisava um falso
 * "60 × 10". PT-13 (uma aplicação por mapa por atendimento), PT-19 e a Decisão
 * C3 (decisão do Claude, 27/11): a aplicação de um atendimento são só os
 * pontos aplicados nele.
 */

const ponto = (id: string, extra: Partial<InjectablePoint> = {}): InjectablePoint => ({
  id, x: 0.5, y: 0.3, product: 'Toxina', dose: 10, unit: 'UI', applied: null, view: 'rosto_f', ...extra,
})
const MANHA = 'aaaaaaaa-0000-4000-8000-000000000001'
const TARDE = 'aaaaaaaa-0000-4000-8000-000000000002'
const daManha = ['p1', 'p2', 'p3', 'p4', 'p5'].map(id => ponto(id, { applied: 10 }))

describe('a aplicação de um atendimento são só os pontos aplicados nele', () => {
  it('os pontos já registrados em OUTRO atendimento deste mapa', () => {
    const outros = pontosDeOutroAtendimento([
      { appointmentId: MANHA, points: daManha },
      { appointmentId: TARDE, points: [ponto('p6')] },
    ], TARDE)
    expect([...outros].sort()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'])
  })

  it('o retoque registra só o ponto novo: 10 UI, não o mapa inteiro', () => {
    const mapa = [...daManha, ponto('p6')]
    const outros = pontosDeOutroAtendimento([{ appointmentId: MANHA, points: daManha }], TARDE)
    const aplicacao = pontosDaAplicacao(mapa, TARDE, outros)
    expect(aplicacao.map(p => p.id)).toEqual(['p6'])
    expect(aplicacao[0]!.atendimento).toBe(TARDE)
    expect(injectableTotals({ view: 'rosto_f', points: aplicacao })).toEqual([{ product: 'Toxina', unit: 'UI', planned: 10, applied: 0 }])
  })

  it('o ponto marcado com o atendimento vale por ele: o de outro sai, o deste fica', () => {
    const mapa = [ponto('p1', { applied: 10, atendimento: MANHA }), ponto('p2', { applied: 10, atendimento: TARDE })]
    expect(pontosDaAplicacao(mapa, TARDE, new Set()).map(p => p.id)).toEqual(['p2'])
  })

  it('atualizar no mesmo atendimento: os pontos dele continuam', () => {
    const mapa = [ponto('p1', { applied: 10, atendimento: TARDE }), ponto('p2')]
    expect(pontosDaAplicacao(mapa, TARDE, new Set(['p1'])).map(p => p.id)).toEqual(['p1', 'p2'])
  })

  it('nada novo neste atendimento: é o plano inteiro aplicado de novo', () => {
    const outros = new Set(daManha.map(p => p.id))
    const aplicacao = pontosDaAplicacao(daManha, TARDE, outros)
    expect(aplicacao.map(p => p.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'])
    expect(aplicacao.every(p => p.atendimento === TARDE)).toBe(true)
  })

  it('"Confirmar aplicação" no retoque: o ponto novo com a dose; os da manhã com 0 hoje', () => {
    const outros = new Set(daManha.map(p => p.id))
    const confirmados = confirmarNoAtendimento([...daManha, ponto('p6')], TARDE, outros)
    expect(confirmados.find(p => p.id === 'p6')).toMatchObject({ applied: 10, atendimento: TARDE })
    for (const p of confirmados.filter(x => x.id !== 'p6')) expect(p.applied).toBe(0)
    expect(pontosDaAplicacao(confirmados, TARDE, outros).map(p => p.id)).toEqual(['p6'])
  })

  it('"Confirmar aplicação" sem ponto novo: o plano inteiro, com a dose planejada', () => {
    const outros = new Set(daManha.map(p => p.id))
    const confirmados = confirmarNoAtendimento(daManha.map(p => ({ ...p, dose: 12 })), TARDE, outros)
    expect(confirmados.every(p => p.applied === 12 && p.atendimento === TARDE)).toBe(true)
  })

  it('registrarAplicacao grava só os pontos deste atendimento, e os totais deles', () => {
    const f = readFileSync(join(__dirname, '..', 'actions/injectable-map.ts'), 'utf8')
    const c = f.slice(f.indexOf('export async function registrarAplicacao'), f.indexOf('function revalidarPlanejamento'))
    expect(c).toContain('pontosDeOutroAtendimento(')
    expect(c).toContain('pontosDaAplicacao(')
    expect(c).not.toContain('p_points:       mapa.points')
    expect(c).not.toContain('p_totals:       injectableTotals(mapa)')
  })
})
