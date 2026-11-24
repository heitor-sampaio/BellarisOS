import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { minutosDesenhados, liberouOHorario, ladoALado } from '@/lib/agenda/desenho'
import { fimDaOcupacao, bateNaOcupacao } from '@/lib/appointments/ocupacao'

// A17 da 14ª simulação (F75): a Cliente 02 das 19:00 foi concluída às 18:10
// (adiantada), e a Bianca das 18:45 coube no horário pela regra (fimDaOcupacao,
// A31 da 5ª). A grade desenhava a Cliente 02 até as 20:00, por cima da Bianca:
// no celular, o toque caía no outro cartão. Toda grade desenha até a OCUPAÇÃO.
const em = (hhmm: string) => new Date(`2026-11-12T${hhmm}:00-04:00`).toISOString()

describe('minutosDesenhados (A17 da 14ª)', () => {
  it('o marcado ocupa a duração inteira', () =>
    expect(minutosDesenhados({ start: em('19:00'), durationMin: 60, status: 'SCHEDULED' })).toBe(60))
  it('o concluído adiantado é desenhado até a conclusão', () => {
    const c = { start: em('19:00'), durationMin: 60, status: 'COMPLETED', completedAt: em('19:20') }
    expect(minutosDesenhados(c)).toBe(20)
    expect(liberouOHorario(c)).toBe(true)
  })
  it('o concluído antes de começar não ocupa nada', () =>
    expect(minutosDesenhados({ start: em('19:00'), durationMin: 60, status: 'COMPLETED', completedAt: em('18:10') })).toBe(0))
  it('o concluído depois do fim marcado ocupa a duração marcada', () => {
    const c = { start: em('19:00'), durationMin: 60, status: 'COMPLETED', completedAt: em('20:30') }
    expect(minutosDesenhados(c)).toBe(60)
    expect(liberouOHorario(c)).toBe(false)
  })
})

describe('ladoALado (A17 da 14ª)', () => {
  const px = (x: { t: number; h: number }) => x
  it('quem se cruza na tela divide a largura; quem não se cruza fica inteiro', () => {
    const itens = [
      { id: 'cliente02', ...px({ t: 100, h: 32 }) },   // o concluído antes de começar, com a altura mínima
      { id: 'bianca', ...px({ t: 80, h: 80 }) },       // 18:45–19:45
      { id: 'depois', ...px({ t: 300, h: 40 }) },
    ]
    const l = ladoALado(itens, x => x.t, x => x.h)
    expect(l.get('bianca')).toEqual({ col: 0, total: 2 })
    expect(l.get('cliente02')).toEqual({ col: 1, total: 2 })
    expect(l.get('depois')).toEqual({ col: 0, total: 1 })
  })
  it('o que encosta (o fim de um é o início do outro) não divide', () => {
    const l = ladoALado([{ id: 'a', t: 0, h: 50 }, { id: 'b', t: 50, h: 50 }], x => x.t, x => x.h)
    expect(l.get('a')).toEqual({ col: 0, total: 1 })
    expect(l.get('b')).toEqual({ col: 0, total: 1 })
  })
})

// A trava: as três grades (unidade, rede e "Minha agenda" — o celular é a
// mesma grade da unidade) desenham pela régua da ocupação, não pela duração
// marcada. Refazer a altura por `durationMin / 60` traz o A17 de volta.
describe('as grades desenham até a ocupação (A17 da 14ª)', () => {
  const grades = [
    'components/branch/agenda-day-view.tsx',
    'components/admin/admin-agenda-view.tsx',
    'components/branch/professional-agenda.tsx',
  ]
  for (const arquivo of grades) {
    it(arquivo, () => {
      const fonte = readFileSync(join(__dirname, '..', arquivo), 'utf8')
      expect(fonte).toContain('minutosDesenhados')
      expect(fonte).not.toMatch(/durationMin \/ 60\) \* HOUR_PX|ev\.durationMin \/ 60 \* PX_PER_HOUR|apptDuration\(a\) \/ 60\) \* HOUR_H/)
    })
  }
})

// O concluído libera o resto do horário (atendimento.md §9.1): para o conflito
// e para os horários livres, ele ocupa só até a conclusão; concluído DEPOIS da
// hora, até o fim marcado (princípio 3: a grade e a conta são a mesma
// `fimDaOcupacao`). O cancelado e a falta não ocupam nada.
describe('o concluído libera o resto do horário (fimDaOcupacao)', () => {
  const emSp = (hhmm: string) => new Date(`2026-11-18T${hhmm}:00-03:00`).getTime()
  const isoSp = (hhmm: string) => new Date(emSp(hhmm)).toISOString()
  const sessao = (status: string, concluidoAs: string | null) =>
    ({ scheduled_at: isoSp('10:00'), duration_min: 60, status, completed_at: concluidoAs ? isoSp(concluidoAs) : null })

  it('a sessão das 10h concluída às 10:20 ocupa até as 10:20: o das 10:20 às 11:00 está livre', () => {
    const fim = fimDaOcupacao(sessao('COMPLETED', '10:20'))
    expect(fim).toBe(emSp('10:20'))
    expect(bateNaOcupacao(emSp('10:20'), emSp('11:00'), emSp('10:00'), fim)).toBe(false)
    expect(bateNaOcupacao(emSp('10:30'), emSp('11:00'), emSp('10:00'), fim)).toBe(false)
    // O que já passou continua ocupado.
    expect(bateNaOcupacao(emSp('10:10'), emSp('10:40'), emSp('10:00'), fim)).toBe(true)
  })
  it('a grade desenha o bloco até a conclusão (a mesma régua da conta)', () => {
    expect(minutosDesenhados({ start: isoSp('10:00'), durationMin: 60, status: 'COMPLETED', completedAt: isoSp('10:20') })).toBe(20)
  })
  it('concluído DEPOIS da hora (às 11:20 a das 10h às 11h) ocupa até o fim marcado — não até o clique', () => {
    const fim = fimDaOcupacao(sessao('COMPLETED', '11:20'))
    expect(fim).toBe(emSp('11:00'))
    expect(bateNaOcupacao(emSp('11:00'), emSp('11:30'), emSp('10:00'), fim)).toBe(false)
    expect(minutosDesenhados({ start: isoSp('10:00'), durationMin: 60, status: 'COMPLETED', completedAt: isoSp('11:20') })).toBe(60)
  })
  it('o não concluído ocupa a duração inteira', () => {
    for (const status of ['SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS']) {
      expect(fimDaOcupacao(sessao(status, null))).toBe(emSp('11:00'))
    }
  })
})

describe('o cancelado e a falta não ocupam', () => {
  const fonte = (arq: string) => readFileSync(join(__dirname, '..', arq), 'utf8')
  it('o conflito e os livres do núcleo deixam de fora CANCELLED e NO_SHOW', () => {
    const core = fonte('lib/appointments/core.ts')
    expect(core).toMatch(/const IGNORED_STATUS = '\("CANCELLED","NO_SHOW"\)'/)
    // conflitosDoHorario e computeAvailableSlots leem com o filtro e medem pela fimDaOcupacao.
    expect(core.match(/\.not\('status', 'in', IGNORED_STATUS\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(core.match(/fimDaOcupacao\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })
  it('a grade do agendar (o dia da profissional) também, pela mesma régua', () => {
    const acoes = fonte('actions/appointments.ts')
    const dia = acoes.slice(acoes.indexOf('export async function getSchedulingDaySlots'))
    expect(dia).toMatch(/\.not\('status', 'in', '\("CANCELLED","NO_SHOW"\)'\)/)
    expect(dia).toMatch(/fimDaOcupacao\(d\)/)
  })
})

// O repasse ao desativar um membro (H6) oferece quem está livre e quem está
// ocupado no horário de cada agendamento, pela MESMA régua da agenda: a
// profissional que concluiu às 10:20 o das 10:00 (60 min) está livre para o
// repasse das 10:30 (a gravação, `horarioOcupado`, já usava a régua).
describe('o repasse mede a ocupação pela régua da agenda', () => {
  const repasse = () => readFileSync(join(__dirname, '..', 'lib/equipe/repasse.ts'), 'utf8')
  it('lê o status e a conclusão da agenda de quem pode receber', () => {
    expect(repasse()).toMatch(/\.select\('id, professional_id, scheduled_at, duration_min, status, completed_at, branches!inner\(tenant_id\)'\)/)
  })
  it('o fim da ocupação é o fimDaOcupacao, e a batida é o bateNaOcupacao', () => {
    const fonte = repasse()
    expect(fonte).toMatch(/import \{[^}]*fimDaOcupacao[^}]*\} from '@\/lib\/appointments\/ocupacao'/)
    expect(fonte).toMatch(/lista\.push\(\{ ini, fim: fimDaOcupacao\(a\) \}\)/)
    expect(fonte).toMatch(/bateNaOcupacao\(ini, fim, o\.ini, o\.fim\)/)
    expect(fonte).not.toMatch(/lista\.push\(\{ ini, fim: ini \+ \(a\.duration_min \|\| 60\) \* 60_000 \}\)/)
  })
  it('a régua: o concluído às 10:20 o das 10:00 não bate no das 10:30', () => {
    const concluido = { scheduled_at: '2026-11-20T13:00:00Z', duration_min: 60, status: 'COMPLETED', completed_at: '2026-11-20T13:20:00Z' }
    const oIni = new Date(concluido.scheduled_at).getTime()
    const ini = new Date('2026-11-20T13:30:00Z').getTime()
    expect(bateNaOcupacao(ini, ini + 30 * 60_000, oIni, fimDaOcupacao(concluido))).toBe(false)
    // Controle: o mesmo agendamento ainda em aberto ocupa a hora inteira.
    expect(bateNaOcupacao(ini, ini + 30 * 60_000, oIni, fimDaOcupacao({ ...concluido, status: 'CONFIRMED' }))).toBe(true)
  })
})
