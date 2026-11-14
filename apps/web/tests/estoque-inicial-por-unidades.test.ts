import { describe, it, expect } from 'vitest'
import { linhasDoEstoqueInicial, unidadesDoCadastro, RECUSA_SEM_UNIDADE, RECUSA_UNIDADE_REPETIDA } from '@/lib/estoque/estoque-inicial'

/** E11 + E13/EQ1d (Bloco Estoque e Bloco Equipe, 2026-11-15). */
function formulario(campos: [string, string][]): FormData {
  const f = new FormData()
  for (const [k, v] of campos) f.append(k, v)
  return f
}

describe('linhasDoEstoqueInicial (E11)', () => {
  it('lê uma linha por unidade, na ordem do formulário', () => {
    const r = linhasDoEstoqueInicial(formulario([['_branchId', 'a'], ['initial_qty', '3'], ['_branchId', 'b'], ['initial_qty', '2,5']]), null)
    expect(r).toEqual({ linhas: [{ unidade: 'a', quantidade: 3 }, { unidade: 'b', quantidade: 2.5 }] })
  })
  it('a linha sem quantidade não conta; sem nenhuma, não há estoque inicial', () => {
    expect(linhasDoEstoqueInicial(formulario([['_branchId', 'a'], ['initial_qty', ''], ['_branchId', 'b'], ['initial_qty', '0']]), null)).toEqual({ linhas: [] })
    expect(linhasDoEstoqueInicial(formulario([]), 'a')).toEqual({ linhas: [] })
  })
  it('sem unidade no formulário (o chamador de antes), vale a unidade em que a pessoa está', () => {
    expect(linhasDoEstoqueInicial(formulario([['initial_qty', '4']]), 'x')).toEqual({ linhas: [{ unidade: 'x', quantidade: 4 }] })
    expect(linhasDoEstoqueInicial(formulario([['initial_qty', '4']]), null)).toEqual({ error: RECUSA_SEM_UNIDADE })
  })
  it('a linha com quantidade e sem unidade é recusada; a unidade repetida também', () => {
    expect(linhasDoEstoqueInicial(formulario([['_branchId', ''], ['initial_qty', '1']]), 'x')).toEqual({ error: RECUSA_SEM_UNIDADE })
    expect(linhasDoEstoqueInicial(formulario([['_branchId', 'a'], ['initial_qty', '1'], ['_branchId', 'a'], ['initial_qty', '2']]), null)).toEqual({ error: RECUSA_UNIDADE_REPETIDA })
  })
})

describe('unidadesDoCadastro (E13 + EQ1d)', () => {
  const ativas = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  it('a rede inteira: todas', () => expect(unidadesDoCadastro(ativas, null).map(u => u.id)).toEqual(['a', 'b', 'c']))
  it('quem tem A e B: só A e B', () => expect(unidadesDoCadastro(ativas, ['b', 'a']).map(u => u.id)).toEqual(['a', 'b']))
  it('quem tem uma unidade só: ela', () => expect(unidadesDoCadastro(ativas, ['c']).map(u => u.id)).toEqual(['c']))
  it('a unidade desativada não entra (não está nas ativas)', () => expect(unidadesDoCadastro(ativas, ['z'])).toEqual([]))
})
