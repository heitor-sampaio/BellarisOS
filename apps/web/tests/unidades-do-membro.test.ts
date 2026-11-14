import { describe, it, expect } from 'vitest'
import { rotaNaOutraUnidade } from '@/lib/rotas'
import { unidadesDoMembro, unidadeEmQueEsta, unidadesDoFormulario, unidadesQueGrava } from '@/lib/unidades/do-membro'

// EQ1a/EQ1b (Bloco Equipe, 2026-11-14): o membro de várias unidades.
describe('unidadesDoMembro', () => {
  it('a rede inteira é null; com unidades, a principal primeiro', () => {
    expect(unidadesDoMembro({ branchId: null, outrasUnidades: ['X'] })).toBeNull()
    expect(unidadesDoMembro({ branchId: 'A' })).toEqual(['A'])
    expect(unidadesDoMembro({ branchId: 'A', outrasUnidades: ['B', 'A'] })).toEqual(['A', 'B'])
  })
})

describe('unidadeEmQueEsta', () => {
  it('a do endereço, se é dela; senão a principal; a rede inteira, null', () => {
    expect(unidadeEmQueEsta(['A', 'B'], 'B')).toBe('B')
    expect(unidadeEmQueEsta(['A', 'B'], 'C')).toBe('A')
    expect(unidadeEmQueEsta(['A', 'B'], null)).toBe('A')
    expect(unidadeEmQueEsta(null, 'B')).toBeNull()
  })
})

describe('unidadesDoFormulario', () => {
  const f = (o: Record<string, string>) => { const d = new FormData(); for (const [k, v] of Object.entries(o)) d.set(k, v); return d }
  it('o campo "Unidades", a rede inteira, o formulário de antes e o que não mexe', () => {
    expect(unidadesDoFormulario(f({ scope: 'branch', _unidades: '1', unidades: 'A, B,' }))).toEqual(['A', 'B'])
    expect(unidadesDoFormulario(f({ scope: 'network', _unidades: '1', unidades: 'A' }))).toBe('rede')
    expect(unidadesDoFormulario(f({ scope: 'branch', branchId: 'A' }))).toEqual(['A'])
    expect(unidadesDoFormulario(f({ name: 'x' }))).toBeNull()
  })
})

describe('unidadesQueGrava', () => {
  it('"A rede inteira" só a dá quem a tem', () => {
    expect(unidadesQueGrava({ pedido: 'rede', deQuemEdita: null })).toEqual({ unidades: null })
    expect(unidadesQueGrava({ pedido: 'rede', deQuemEdita: ['A', 'B'] })).toHaveProperty('error')
  })
  it('quem é da rede grava as marcadas; a principal de antes continua a principal', () => {
    expect(unidadesQueGrava({ pedido: ['B', 'A'], deQuemEdita: null })).toEqual({ unidades: ['B', 'A'] })
    expect(unidadesQueGrava({ pedido: ['B', 'A'], antes: ['A'], deQuemEdita: null })).toEqual({ unidades: ['A', 'B'] })
    expect(unidadesQueGrava({ pedido: [], deQuemEdita: null })).toHaveProperty('error')
  })
  it('quem tem unidades dá só as dela; a que o membro tem fora do alcance dela fica', () => {
    expect(unidadesQueGrava({ pedido: ['B', 'C'], deQuemEdita: ['A', 'B'] })).toEqual({ unidades: ['B'] })
    expect(unidadesQueGrava({ pedido: ['A'], antes: ['C', 'B'], deQuemEdita: ['A', 'B'] })).toEqual({ unidades: ['C', 'A'] })
    expect(unidadesQueGrava({ pedido: ['C'], deQuemEdita: ['A', 'B'] })).toHaveProperty('error')
  })
  it('a desativada (que a tela não mostra) fica como estava, e não vira a principal', () => {
    expect(unidadesQueGrava({ pedido: ['B'], antes: ['Z', 'A'], deQuemEdita: null, ativas: ['A', 'B'] })).toEqual({ unidades: ['B', 'Z'] })
  })
})

describe('rotaNaOutraUnidade (PO1)', () => {
  it('a mesma tela na outra unidade, com a busca', () => {
    expect(rotaNaOutraUnidade('/centro/clients', 'norte', '?q=ana')).toBe('/norte/clients?q=ana')
    expect(rotaNaOutraUnidade('/centro/settings', 'norte', '?tab=unidade')).toBe('/norte/settings?tab=unidade')
    expect(rotaNaOutraUnidade('/centro', 'norte')).toBe('/norte/dashboard')
  })
  it('o registro da unidade não vai junto: volta à lista dele', () => {
    expect(rotaNaOutraUnidade('/centro/agenda/0b6f6a52-6a8e-4b8a-9d7c-1b2c3d4e5f60', 'norte', '?x=1')).toBe('/norte/agenda')
  })
})
