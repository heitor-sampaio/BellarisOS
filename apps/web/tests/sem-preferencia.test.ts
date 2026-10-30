import { describe, it, expect } from 'vitest'
import { juntarHorarios, escolherQuemAtende } from '@/lib/appointments/sem-preferencia'

// D-16 (decisão do Heitor, 2026-10-30): no app, "Sem preferência" junta os
// horários de todas as profissionais e, ao confirmar, o sistema escolhe quem
// está livre naquele horário, com menos atendimentos no dia.
describe('"Sem preferência" de profissional no app', () => {
  const ana   = { id: 'ana',   nome: 'Ana',   livres: ['08:00', '09:00', '14:00'], atendimentosNoDia: 3 }
  const bia   = { id: 'bia',   nome: 'Bia',   livres: ['09:00', '10:00'],          atendimentosNoDia: 1 }
  const carla = { id: 'carla', nome: 'Carla', livres: ['09:00', '10:00'],          atendimentosNoDia: 1 }

  it('junta os horários de todas, sem repetir, em ordem', () => {
    expect(juntarHorarios([ana.livres, bia.livres, carla.livres])).toEqual(['08:00', '09:00', '10:00', '14:00'])
  })

  it('escolhe quem está livre naquele horário', () => {
    expect(escolherQuemAtende([ana, bia, carla], '14:00')).toBe('ana')
  })

  it('entre as livres, a que tem menos atendimentos no dia', () => {
    expect(escolherQuemAtende([ana, bia], '09:00')).toBe('bia')
  })

  it('empatou: a primeira pelo nome (a escolha não depende da ordem da lista)', () => {
    expect(escolherQuemAtende([carla, bia, ana], '10:00')).toBe('bia')
  })

  it('ninguém livre no horário: nenhuma', () => {
    expect(escolherQuemAtende([ana, bia], '11:00')).toBeNull()
  })
})
