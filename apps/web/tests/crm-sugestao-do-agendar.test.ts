import { describe, expect, it } from 'vitest'
import { sugestaoDoAgendar } from '@/lib/crm/sugestao-do-agendar'

// A1 da 11ª simulação (2026-11-10): o "Agendar" do lead vinha todo em
// "Selecione…", sem o procedimento de interesse (Bioestimulador) nem a avaliação.
describe('A1 da 11ª: o procedimento que o Agendar da oportunidade traz', () => {
  const procs = [
    { id: 'bio', name: 'Bioestimulador', category: 'Injetáveis' },
    { id: 'aval', name: 'Avaliação facial', category: 'Avaliação' },
    { id: 'tox', name: 'Toxina', category: 'Injetáveis' },
  ]
  it('o de interesse que a unidade oferece', () => {
    expect(sugestaoDoAgendar(procs, ['bio'])).toEqual({ id: 'bio', motivo: 'interesse' })
    expect(sugestaoDoAgendar(procs, ['fora', 'tox'])).toEqual({ id: 'tox', motivo: 'interesse' })
  })
  it('com interesse que a unidade não oferece, nada (não troca por outro)', () => {
    expect(sugestaoDoAgendar(procs, ['fora'])).toBeNull()
  })
  it('sem interesse, a avaliação — só quando há UMA', () => {
    expect(sugestaoDoAgendar(procs, [])).toEqual({ id: 'aval', motivo: 'avaliacao' })
    expect(sugestaoDoAgendar([...procs, { id: 'a2', name: 'Avaliação corporal', category: null }], [])).toBeNull()
    expect(sugestaoDoAgendar([procs[0]!], [])).toBeNull()
  })
})
