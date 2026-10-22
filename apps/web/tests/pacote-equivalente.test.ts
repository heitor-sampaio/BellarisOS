import { describe, it, expect } from 'vitest'
import { pacoteEquivalente } from '@/lib/checkout/pacote-equivalente'

/**
 * O checkout sugere o pacote equivalente (2026-10-21, decisão do Heitor):
 * quando as sessões do plano CABEM num pacote ativo — os mesmos procedimentos,
 * nas mesmas quantidades — e ele sai mais barato, "Fechar como pacote X".
 */

const limpeza = 'p-limpeza', drenagem = 'p-drenagem'
const sessoes = (...ids: string[][]) => ids.map(procs => ({ procedures: procs.map(procedureId => ({ procedureId })) }))
const pacote = (id: string, preco: number, itens: [string, number][]) =>
  ({ id, name: `Pacote ${id}`, price: preco, itens: itens.map(([procedureId, quantidade]) => ({ procedureId, quantidade })) })

describe('pacoteEquivalente', () => {
  it('acha o pacote com os mesmos procedimentos e quantidades, e diz a economia', () => {
    const plano = sessoes([limpeza], [limpeza], [limpeza], [drenagem])
    const r = pacoteEquivalente(plano, 800, [pacote('a', 650, [[limpeza, 3], [drenagem, 1]])])
    expect(r).toEqual({ id: 'a', nome: 'Pacote a', preco: 650, economia: 150 })
  })

  it('não sugere quando a composição é outra', () => {
    const plano = sessoes([limpeza], [limpeza])
    expect(pacoteEquivalente(plano, 400, [pacote('a', 300, [[limpeza, 3]])])).toBeNull()
    expect(pacoteEquivalente(plano, 400, [pacote('b', 300, [[limpeza, 2], [drenagem, 1]])])).toBeNull()
  })

  it('não sugere pacote que não sai mais barato', () => {
    const plano = sessoes([limpeza], [limpeza])
    expect(pacoteEquivalente(plano, 400, [pacote('a', 400, [[limpeza, 2]])])).toBeNull()
    expect(pacoteEquivalente(plano, 400, [pacote('a', 450, [[limpeza, 2]])])).toBeNull()
  })

  it('com dois que cabem, o mais barato; procedimentos na mesma sessão contam cada um', () => {
    const plano = sessoes([limpeza, drenagem], [limpeza])
    const r = pacoteEquivalente(plano, 500.5, [
      pacote('caro', 480, [[limpeza, 2], [drenagem, 1]]),
      pacote('barato', 420.25, [[drenagem, 1], [limpeza, 2]]),
    ])
    expect(r).toEqual({ id: 'barato', nome: 'Pacote barato', preco: 420.25, economia: 80.25 })
  })

  it('plano vazio não sugere nada', () => {
    expect(pacoteEquivalente([], 0, [pacote('a', 0, [])])).toBeNull()
  })
})
