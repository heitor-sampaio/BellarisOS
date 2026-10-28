import { describe, it, expect } from 'vitest'
import { motivosComOutroPorUltimo } from '@/lib/crm/motivos-ordem'

/**
 * "Outro" é o motivo de quem não achou o seu: vem SEMPRE por último na escolha,
 * mesmo quando a clínica cria um motivo novo depois dele (A15, simulação de
 * 2026-10-27: "Mudou de cidade" aparecia depois de "Outro").
 */
const m = (...nomes: string[]) => nomes.map(nome => ({ nome }))

describe('motivosComOutroPorUltimo', () => {
  it('põe "Outro" no fim, sem mexer na ordem dos demais', () => {
    expect(motivosComOutroPorUltimo(m('Preço', 'Outro', 'Mudou de cidade', 'Desistiu')).map(x => x.nome))
      .toEqual(['Preço', 'Mudou de cidade', 'Desistiu', 'Outro'])
  })
  it('não liga para caixa nem espaços', () => {
    expect(motivosComOutroPorUltimo(m(' outro ', 'Preço')).map(x => x.nome)).toEqual(['Preço', ' outro '])
  })
  it('sem "Outro", a ordem é a de entrada', () => {
    expect(motivosComOutroPorUltimo(m('B', 'A')).map(x => x.nome)).toEqual(['B', 'A'])
  })
})
