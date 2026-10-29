import { describe, it, expect } from 'vitest'
import { fichaParaConcluir } from '@/lib/atendimento/ficha-do-procedimento'

/**
 * D1 da simulação de 2026-10-29: a ficha própria do procedimento vai ao
 * prontuário pelo "Finalizar", na mesma transação da conclusão. O app monta o
 * retrato (a ficha de agora e as respostas); o banco só grava.
 */

const form = {
  id: 'f1', name: 'Ficha de peeling',
  schema: { rows: [
    { id: 'r0', fields: [{ id: 'sec', type: 'section', label: 'Pele' }] },
    { id: 'r1', fields: [
      { id: 'fototipo', type: 'select', label: 'Fototipo', required: true, options: ['I', 'II', 'III'] },
      { id: 'acido', type: 'text', label: 'Ácido' },
    ] },
    { id: 'r2', fields: [{ id: 'mapa', type: 'injectable_map', label: 'Mapa', options: ['Toxina'] }] },
  ] },
}

describe('fichaParaConcluir', () => {
  it('monta o retrato da ficha com as respostas', () => {
    const r = fichaParaConcluir(form, { fototipo: 'III', acido: 'Mandélico' })
    expect(r).toMatchObject({ formId: 'f1', name: 'Ficha de peeling', answers: { fototipo: 'III', acido: 'Mandélico' } })
    expect(r!.rows.flatMap(x => x.fields.map(f => f.id))).toEqual(['sec', 'fototipo', 'acido', 'mapa'])
  })

  it('só guarda resposta de campo da ficha (nem seção, nem chave de fora)', () => {
    const r = fichaParaConcluir(form, { fototipo: 'II', sec: 'x', intrusa: 'y', __proto__x: 'z' })
    expect(r!.answers).toEqual({ fototipo: 'II' })
  })

  it('aceita o valor estruturado do planejador e a lista das caixas', () => {
    const mapa = { version: 1, view: 'front', points: [] }
    const r = fichaParaConcluir(form, { mapa, acido: ['a', 'b'] })
    expect(r!.answers).toEqual({ mapa, acido: ['a', 'b'] })
  })

  it('sem ficha, ou sem respostas num objeto, não há o que gravar', () => {
    expect(fichaParaConcluir(null, { fototipo: 'I' })).toBeNull()
    expect(fichaParaConcluir(form, null)).toBeNull()
    expect(fichaParaConcluir(form, 'texto')).toBeNull()
    expect(fichaParaConcluir(form, ['fototipo'])).toBeNull()
  })

  it('ficha sem campo nenhum não é ficha', () => {
    expect(fichaParaConcluir({ id: 'f2', name: 'Vazia', schema: { rows: [] } }, { a: '1' })).toBeNull()
  })
})
