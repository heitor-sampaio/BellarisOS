import { describe, it, expect } from 'vitest'
import { resumoDoHorario, type Horario } from '@/lib/agenda/horario'

// J-60 da simulação: ao agendar pelo app, nada avisava que a profissional só
// atende à noite — a cliente escolhia a manhã e não achava horário. O app
// mostra o horário dela: a unidade ∩ o dela, dia a dia, em texto curto.
describe('o horário da profissional em texto', () => {
  const noite = [{ de: '18:00', ate: '22:00' }]
  const unidade: Horario = { dias: { 0: [], 1: [{ de: '08:00', ate: '22:00' }], 2: [{ de: '08:00', ate: '22:00' }], 3: [{ de: '08:00', ate: '22:00' }], 4: [{ de: '08:00', ate: '22:00' }], 5: [{ de: '08:00', ate: '22:00' }], 6: [{ de: '09:00', ate: '13:00' }] } }

  it('junta os dias seguidos com o mesmo horário, a partir de segunda', () => {
    const dela: Horario = { dias: { 1: noite, 2: noite, 3: noite, 4: noite, 5: noite, 6: [] } }
    expect(resumoDoHorario(unidade, dela)).toEqual(['Seg a sex, 18:00–22:00'])
  })

  it('sem cadastro dela, é o da unidade (o padrão: seg a sáb, 8 às 20)', () => {
    expect(resumoDoHorario(null, null)).toEqual(['Seg a sáb, 08:00–20:00'])
  })

  it('a pausa aparece; dias diferentes ficam separados', () => {
    const dela: Horario = { dias: { 1: [{ de: '08:00', ate: '12:00' }, { de: '14:00', ate: '18:00' }], 3: [{ de: '08:00', ate: '12:00' }, { de: '14:00', ate: '18:00' }], 2: [], 4: [], 5: [], 6: [] } }
    expect(resumoDoHorario(unidade, dela)).toEqual(['Seg, 08:00–12:00 e 14:00–18:00', 'Qua, 08:00–12:00 e 14:00–18:00'])
  })

  it('o dia sem cadastro dela segue a unidade', () => {
    const dela: Horario = { dias: { 1: noite, 2: noite, 3: noite, 4: noite, 5: noite } }
    expect(resumoDoHorario(unidade, dela)).toEqual(['Seg a sex, 18:00–22:00', 'Sáb, 09:00–13:00'])
  })
})
