import { describe, it, expect } from 'vitest'
import { gradeDoCheckout, aPartirDeAgora } from '@/lib/checkout/grade-de-horarios'

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

describe('hoje, a grade não oferece o que já passou (A24 da 6ª simulação)', () => {
  const vinteEQuatro = todoDia(['00:00', '24:00'])
  it('o limite é a hora de agora em Brasília, só no dia de hoje', () => {
    // 04:10 em Brasília = 07:10 UTC.
    const agora = new Date('2026-11-04T07:10:00Z')
    expect(aPartirDeAgora('2026-11-04', agora)).toBe('04:10')
    expect(aPartirDeAgora('2026-11-05', agora), 'outro dia, sem limite').toBeNull()
    // 22:30 do dia 3 em Brasília é 01:30 UTC do dia 4: o "hoje" é o de Brasília.
    expect(aPartirDeAgora('2026-11-03', new Date('2026-11-04T01:30:00Z'))).toBe('22:30')
  })
  it('a grade começa no primeiro horário depois de agora', () => {
    const h = gradeDoCheckout(vinteEQuatro, null, '2026-11-04', '04:10').map(x => x.hora)
    expect(h[0]).toBe('04:30')
    expect(h).not.toContain('00:00')
    expect(gradeDoCheckout(vinteEQuatro, null, '2026-11-04', '04:00')[0]?.hora, 'a hora cheia ainda vale').toBe('04:00')
  })
})

// D1 da 39ª (AG-07 e AG-10, princípio 3): os chips da equipe — o Agendar, o
// Reagendar, as sessões do pacote e do plano, o checkout — ofereciam o início
// cujo FIM atravessa o almoço, a pausa própria de quem atende ou o fechamento
// (Drenagem de 50 min às 11:30 com o almoço às 12:00). A conta é a do app da
// cliente (`computeAvailableSlots`: `slotsDoDia(intervalos, duração)`): o último
// início é o fim da janela menos a duração.
describe('a grade só oferece o início em que a duração inteira cabe', () => {
  const unidade = todoDia(['08:00', '12:00'], ['13:00', '22:00'])
  const dela = (u: Parameters<typeof gradeDoCheckout>[0], p: Parameters<typeof gradeDoCheckout>[1], duracao: number) =>
    gradeDoCheckout(u, p, QUARTA, null, duracao).filter(h => h.doProfissional).map(h => h.hora)

  it('50 min não começa às 11:30 com o almoço às 12:00, nem às 21:30 com o fechamento às 22:00', () => {
    const h = dela(unidade, null, 50)
    expect(h).toContain('11:00')
    expect(h).not.toContain('11:30')
    expect(h).toContain('21:00')
    expect(h).not.toContain('21:30')
  })
  it('a pausa própria de quem atende também corta o fim', () => {
    const lucivania = todoDia(['08:00', '14:30'], ['15:30', '19:00'])
    const h = dela(unidade, lucivania, 50)
    expect(h).toContain('13:30')
    expect(h).not.toContain('14:00')
    expect(h).not.toContain('14:30')
    expect(h).toContain('15:30')
    expect(h.at(-1)).toBe('18:00')
  })
  it('120 min: o último início é o fim menos a duração', () => {
    const h = dela(unidade, null, 120)
    expect(h).toEqual(['08:00', '08:30', '09:00', '09:30', '10:00', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00'])
  })
  it('é a mesma conta do app da cliente (slotsDoDia com a duração)', async () => {
    const { slotsDoDia, intervalosDoDia, diaDaSemana } = await import('@/lib/agenda/horario')
    const lucivania = todoDia(['09:00', '12:00'], ['13:00', '16:00'])
    expect(dela(unidade, lucivania, 80)).toEqual(slotsDoDia(intervalosDoDia(unidade, lucivania, diaDaSemana(QUARTA)), 80))
  })
  it('a tela passa a duração do procedimento à grade, nos três lugares que pedem os horários', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const fonte = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8')
    expect(fonte('components/shared/grade-de-horarios.tsx')).toMatch(/gradeDoCheckout\(horarioDaUnidade, horarioDoProfissional, data, limite, duracaoMin\)/)
    for (const f of ['components/branch/appointment-modal.tsx', 'components/branch/checkout-wizard.tsx', 'components/branch/treatment-sessions-modal.tsx']) {
      expect(fonte(f), f).toMatch(/<GradeDeHorarios[\s\S]*?duracaoMin=\{/)
    }
  })
})
