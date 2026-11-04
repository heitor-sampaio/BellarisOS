import { describe, it, expect } from 'vitest'
import { textoDoHorarioMarcado } from '@/lib/appointments/texto-do-aviso'

// A28 da 6ª simulação: o "Horário marcado" não dizia a unidade, e a cliente tem duas.
describe('o aviso "Horário marcado"', () => {
  it('com a unidade (a clínica de mais de uma), diz onde; sem, como antes', () => {
    expect(textoDoHorarioMarcado('Botox', '05/11 às 10:00', 'Boa Viagem')).toBe('Botox em 05/11 às 10:00, na unidade Boa Viagem.')
    expect(textoDoHorarioMarcado('Botox', '05/11 às 10:00', null)).toBe('Botox em 05/11 às 10:00.')
  })
})
