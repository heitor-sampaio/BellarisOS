import { describe, it, expect } from 'vitest'
import { lerRascunho, gravarRascunho, limparRascunho, chaveDoRascunho } from '@/lib/atendimento/rascunho'

/**
 * A31 da simulação de 2026-10-27: as anotações escritas antes de finalizar se
 * perdiam ao recarregar. O rascunho vai para o sessionStorage, por
 * agendamento — sobrevive ao recarregar e morre com a aba (não deixa texto
 * clínico guardado na máquina da recepção). Todo acesso é protegido: o
 * armazenamento pode faltar ou lançar (aba anônima, dados bloqueados).
 */

function armazem(): Storage {
  const m = new Map<string, string>()
  return {
    get length() { return m.size },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => { m.delete(k) },
    setItem: (k: string, v: string) => { m.set(k, String(v)) },
  }
}
const quebrado = new Proxy({} as Storage, { get() { throw new Error('SecurityError') } })

describe('rascunho do atendimento', () => {
  it('grava e lê por agendamento', () => {
    const s = armazem()
    gravarRascunho('ag-1', { notes: 'Pele mista', intercurrences: 'Eritema' }, s)
    gravarRascunho('ag-2', { notes: 'Outra' }, s)
    expect(lerRascunho('ag-1', s)).toEqual({ notes: 'Pele mista', intercurrences: 'Eritema' })
    expect(lerRascunho('ag-2', s)).toEqual({ notes: 'Outra' })
    expect(lerRascunho('ag-3', s)).toBeNull()
  })

  it('tudo em branco não guarda nada (e apaga o que havia)', () => {
    const s = armazem()
    gravarRascunho('ag-1', { notes: 'x' }, s)
    gravarRascunho('ag-1', { notes: '  ', intercurrences: '' }, s)
    expect(s.getItem(chaveDoRascunho('ag-1'))).toBeNull()
  })

  it('limpar apaga o rascunho do agendamento', () => {
    const s = armazem()
    gravarRascunho('ag-1', { notes: 'x' }, s)
    limparRascunho('ag-1', s)
    expect(lerRascunho('ag-1', s)).toBeNull()
  })

  it('ignora o que não é rascunho (JSON quebrado, campo que não é texto)', () => {
    const s = armazem()
    s.setItem(chaveDoRascunho('ag-1'), '{quebrado')
    expect(lerRascunho('ag-1', s)).toBeNull()
    s.setItem(chaveDoRascunho('ag-2'), JSON.stringify({ notes: 3, evalNotes: 'ok', outro: 'x' }))
    expect(lerRascunho('ag-2', s)).toEqual({ evalNotes: 'ok' })
  })

  it('armazenamento que lança ou falta não derruba a tela', () => {
    expect(() => gravarRascunho('ag-1', { notes: 'x' }, quebrado)).not.toThrow()
    expect(lerRascunho('ag-1', quebrado)).toBeNull()
    expect(() => limparRascunho('ag-1', quebrado)).not.toThrow()
    // Sem window (o servidor, o Vitest): nada acontece.
    expect(lerRascunho('ag-1')).toBeNull()
    expect(() => gravarRascunho('ag-1', { notes: 'x' })).not.toThrow()
  })
})
