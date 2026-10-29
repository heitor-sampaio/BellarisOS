import { describe, it, expect } from 'vitest'
import { gradeDoCheckout } from '@/lib/checkout/grade-de-horarios'

// D8 da simulação de 2026-10-29: a grade do checkout do plano era FIXA, das
// 08:00 às 20:00, para qualquer unidade e profissional — oferecia 12:00 e 12:30
// na pausa da unidade e nada depois das 20:00, com a unidade aberta até 23:30
// e a Camila atendendo das 18:00 às 23:30.
const todoDia = (...ints: [string, string][]) =>
  ({ dias: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, ints.map(([de, ate]) => ({ de, ate }))])) })
const QUARTA = '2026-10-28'

describe('a grade de horários do checkout do plano', () => {
  const unidade = todoDia(['08:00', '12:00'], ['13:00', '23:30'])
  const camila = todoDia(['18:00', '23:30'])
  const horas = (u: Parameters<typeof gradeDoCheckout>[0], p: Parameters<typeof gradeDoCheckout>[1], d = QUARTA) =>
    gradeDoCheckout(u, p, d).map(h => h.hora)

  it('cobre a janela da unidade naquele dia, sem cortar a noite', () => {
    const h = horas(unidade, camila)
    expect(h[0]).toBe('08:00')
    expect(h).toContain('23:00')
    expect(h.at(-1)).toBe('23:00')
  })
  it('não oferece a pausa da unidade', () => {
    const h = horas(unidade, camila)
    expect(h).toContain('11:30')
    expect(h).not.toContain('12:00')
    expect(h).not.toContain('12:30')
    expect(h).toContain('13:00')
  })
  it('a unidade fechada no dia: a grade vazia (o encaixe é o "Outro horário")', () => {
    const fechadaNaQuarta = { dias: { ...unidade.dias, 3: [] } }
    expect(horas(fechadaNaQuarta, camila)).toEqual([])
  })
  it('sem horário cadastrado, o padrão da unidade (segunda a sábado, 08–20)', () => {
    expect(horas(null, null)[0]).toBe('08:00')
    expect(horas(null, null).at(-1)).toBe('19:30')
    expect(horas(null, null, '2026-11-01')).toEqual([])   // domingo
  })
  it('marca os horários da profissional; os outros são encaixe, mas aparecem', () => {
    const g = gradeDoCheckout(unidade, camila, QUARTA)
    expect(g.find(h => h.hora === '10:00')).toEqual({ hora: '10:00', doProfissional: false })
    expect(g.find(h => h.hora === '18:00')).toEqual({ hora: '18:00', doProfissional: true })
    expect(g.find(h => h.hora === '23:00')).toEqual({ hora: '23:00', doProfissional: true })
    // Sem horário próprio, ela segue a unidade: tudo é dela.
    expect(gradeDoCheckout(unidade, null, QUARTA).every(h => h.doProfissional)).toBe(true)
  })
})
