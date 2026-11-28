import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  aplicadoEscrito, aplicadoAoRegistrar, type InjectablePoint,
} from '@/lib/injetaveis/aplicacao-do-atendimento'

/**
 * R44 (o Heitor, 28/11: "Vazio, com a dose do plano como sugestão (a
 * proposta)"): no atendimento, o campo "Aplicado" de cada ponto mostra só o
 * que alguém escreveu; o ponto ainda não aplicado fica vazio, com a dose que o
 * "Registrar aplicação" vai gravar como sugestão apagada (a mesma conta de
 * `aplicadoAoRegistrar`, que não muda).
 */
const ponto = (id: string, extra: Partial<InjectablePoint> = {}): InjectablePoint => ({
  id, x: 0.5, y: 0.3, product: 'Toxina', dose: 20, unit: 'UI', applied: null, view: 'rosto_f', ...extra,
})
const AQUI = 'aaaaaaaa-0000-4000-8000-000000000001'
const OUTRO = 'aaaaaaaa-0000-4000-8000-000000000002'

describe('o "Aplicado" fica vazio até alguém escrever', () => {
  it('o ponto planejado, sem dose escrita: vazio (a sugestão é a do plano)', () => {
    const p = ponto('p1')
    expect(aplicadoEscrito(p, AQUI, new Set())).toBeNull()
    expect(aplicadoAoRegistrar([p], AQUI, new Set())[0]!.applied).toBe(20)
  })
  it('a dose escrita neste atendimento aparece', () => {
    expect(aplicadoEscrito(ponto('p1', { applied: 15, atendimento: AQUI }), AQUI, new Set())).toBe(15)
  })
  it('o ponto aplicado em OUTRO atendimento não aparece como aplicado neste', () => {
    expect(aplicadoEscrito(ponto('p1', { applied: 20, atendimento: OUTRO }), AQUI, new Set())).toBeNull()
    expect(aplicadoEscrito(ponto('p2', { applied: 20 }), AQUI, new Set(['p2']))).toBeNull()
  })
  it('a tela usa a dose escrita no campo e a do registrar como sugestão', () => {
    const tela = readFileSync(join(__dirname, '..', 'components', 'branch', 'injectable-map-field.tsx'), 'utf8')
    expect(tela).toMatch(/aplicadoEscrito\(/)
    expect(tela).toMatch(/placeholder=/)
  })
})
