import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TenantContext } from '@estetica-os/types'
import * as trecho from '@/lib/agenda/trecho-do-agendamento'

// O primeiro import() carrega as actions da agenda e o Supabase.
vi.setConfig({ testTimeout: 30_000 })

/**
 * A tela mostra o que vale (princípio 3): o procedimento não tem duração
 * máxima, e a conferência do choque já vale com qualquer duração
 * (`podemOcuparDesde`). Faltava a TELA:
 *
 * 1. A grade de horários do Agendar (`getSchedulingDaySlots`) lia da véspera
 *    (24 h): o atendimento de mais de 24 h que começou antes de ontem não
 *    chegava, a grade oferecia o horário como livre e o Confirmar recusava.
 * 2. As agendas (unidade, rede, Minha agenda) punham cada agendamento só no
 *    dia em que COMEÇA: o que atravessa a meia-noite, ou dura dias, sumia dos
 *    dias seguintes — o dia parecia livre e o choque recusava. Como o bloqueio
 *    de vários dias (`bloqueioNoDia`), o cartão aparece em cada dia que ocupa,
 *    do topo do dia, dizendo de quando continua.
 *
 * Os testes rodam em TZ=UTC: os horários "de parede" sem fuso são o relógio da grade.
 */

const fonte = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')
const dia = (s: string) => new Date(`${s}T12:00:00`)
const ag = (start: string, durationMin: number, extra: Partial<{ status: string; completedAt: string | null; id: string }> = {}) =>
  ({ id: extra.id ?? start, start: `${start}:00`, durationMin, status: extra.status ?? 'SCHEDULED', completedAt: extra.completedAt ?? null })

describe('o trecho do agendamento em cada dia da grade', () => {
  const noDia = (a: ReturnType<typeof ag>, d: string) => trecho.trechoDoAgendamentoNoDia(a, dia(d))

  it('o atendimento dentro do dia: o desenho de sempre', () => {
    expect(noDia(ag('2026-12-10T10:00', 60), '2026-12-10')).toEqual({ de: 600, ate: 660, continuaDeAntes: false, continuaDepois: false })
    expect(noDia(ag('2026-12-10T10:00', 60), '2026-12-11')).toBeNull()
    expect(noDia(ag('2026-12-10T10:00', 60), '2026-12-09')).toBeNull()
  })

  it('o de 30 h que começou ontem às 08:00 ocupa hoje do topo até as 14:00', () => {
    expect(noDia(ag('2026-12-09T08:00', 30 * 60), '2026-12-09')).toEqual({ de: 480, ate: 1440, continuaDeAntes: false, continuaDepois: true })
    expect(noDia(ag('2026-12-09T08:00', 30 * 60), '2026-12-10')).toEqual({ de: 0, ate: 840, continuaDeAntes: true, continuaDepois: false })
    expect(noDia(ag('2026-12-09T08:00', 30 * 60), '2026-12-11')).toBeNull()
  })

  it('o de três dias ocupa o dia do meio inteiro', () =>
    expect(noDia(ag('2026-12-08T08:00', 72 * 60), '2026-12-10')).toEqual({ de: 0, ate: 1440, continuaDeAntes: true, continuaDepois: true }))

  it('o que atravessa a meia-noite aparece no dia seguinte', () => {
    expect(noDia(ag('2026-12-10T23:00', 120), '2026-12-10')).toEqual({ de: 1380, ate: 1440, continuaDeAntes: false, continuaDepois: true })
    expect(noDia(ag('2026-12-10T23:00', 120), '2026-12-11')).toEqual({ de: 0, ate: 60, continuaDeAntes: true, continuaDepois: false })
  })

  it('o que acaba à meia-noite não continua no dia seguinte', () =>
    expect(noDia(ag('2026-12-10T22:00', 120), '2026-12-11')).toBeNull())

  it('o cancelado e a falta não continuam (não ocupam nada); no dia deles, aparecem como sempre', () => {
    expect(noDia(ag('2026-12-09T08:00', 30 * 60, { status: 'CANCELLED' }), '2026-12-10')).toBeNull()
    expect(noDia(ag('2026-12-09T08:00', 30 * 60, { status: 'NO_SHOW' }), '2026-12-10')).toBeNull()
    expect(noDia(ag('2026-12-09T08:00', 30 * 60, { status: 'CANCELLED' }), '2026-12-09')).not.toBeNull()
  })

  it('o concluído continua só até a conclusão (fimDaOcupacao)', () => {
    expect(noDia(ag('2026-12-09T08:00', 30 * 60, { status: 'COMPLETED', completedAt: '2026-12-09T20:00:00' }), '2026-12-10')).toBeNull()
    expect(noDia(ag('2026-12-09T08:00', 30 * 60, { status: 'COMPLETED', completedAt: '2026-12-10T09:30:00' }), '2026-12-10'))
      .toEqual({ de: 0, ate: 570, continuaDeAntes: true, continuaDepois: false })
  })

  it('os agendamentos do dia: os que começam nele e os que continuam de antes', () => {
    const lista = [ag('2026-12-09T08:00', 30 * 60, { id: 'longo' }), ag('2026-12-10T15:00', 60, { id: 'tarde' }), ag('2026-12-11T09:00', 60, { id: 'amanha' })]
    expect(trecho.agendamentosNoDia(lista, dia('2026-12-10')).map(x => [x.ev.id, x.trecho.continuaDeAntes])).toEqual([['longo', true], ['tarde', false]])
  })

  it('o cartão que continua diz o início real', () =>
    expect(trecho.textoDoQueContinua('2026-12-09T08:00:00')).toBe('Continua de 09/12 às 08:00'))
})

describe('a janela da grade com o que continua', () => {
  const janela = { inicio: 8, fim: 20 }
  const t = (de: number, ate: number, continuaDeAntes: boolean, continuaDepois: boolean) => ({ de, ate, continuaDeAntes, continuaDepois })
  it('o que continua de antes e cobre a abertura não muda a janela (o cartão começa no topo)', () =>
    expect(trecho.janelaComOsTrechos(janela, [t(0, 840, true, false)])).toEqual(janela))
  it('o que continua de antes e acaba antes da abertura abre a grade na última hora dele', () =>
    expect(trecho.janelaComOsTrechos(janela, [t(0, 180, true, false)])).toEqual({ inicio: 2, fim: 20 }))
  it('o que continua no dia seguinte fecha a grade em 24', () =>
    expect(trecho.janelaComOsTrechos(janela, [t(480, 1440, false, true)])).toEqual({ inicio: 8, fim: 24 }))
  it('o do caso comum não mexe na janela (estenderJanela é quem cuida dele)', () =>
    expect(trecho.janelaComOsTrechos(janela, [t(600, 660, false, false)])).toEqual(janela))
})

describe('as agendas desenham o trecho de cada dia', () => {
  it('a grade do dia, a da semana e o mês da unidade', () => {
    for (const f of ['components/branch/agenda-day-view.tsx', 'components/branch/agenda-week-view.tsx', 'components/branch/agenda-month-view.tsx']) {
      expect(fonte(f), f).toMatch(/agendamentosNoDia\(/)
    }
    expect(fonte('components/branch/agenda-day-view.tsx')).not.toMatch(/events\.filter\(e => isSameDay\(new Date\(e\.start\), currentDate\)\)/)
  })
  it('a Minha agenda', () => expect(fonte('components/branch/professional-agenda.tsx')).toMatch(/agendamentosNoDia\(/))
  it('a agenda da rede', () => expect(fonte('components/admin/admin-agenda-view.tsx')).toMatch(/agendamentosNoDia\(/))
  it('as páginas leem quem se sobrepõe ao período, de qualquer duração', () => {
    const unidade = fonte('app/[slug]/agenda/page.tsx')
    expect(unidade).toMatch(/podemOcuparDesde\(/)
    expect(unidade).not.toMatch(/\.gte\('scheduled_at', from\)/)
    const rede = fonte('app/admin/agenda/page.tsx')
    expect(rede).toMatch(/podemOcuparDesde\(/)
    expect(rede).not.toMatch(/\.gte\('scheduled_at', startDate\.toISOString\(\)\)/)
  })
})

// ─── A grade do Agendar (getSchedulingDaySlots), com um Supabase falso ───
type Linha = Record<string, unknown>
const valorEm = (l: Linha, col: string): unknown => col.split('.').reduce<unknown>((o, k) => (o as Linha | null)?.[k], l)
const comoNumero = (v: unknown): number => {
  if (typeof v === 'number') return v
  const n = Number(v)
  if (v !== '' && v !== null && Number.isFinite(n)) return n
  return new Date(String(v)).getTime()
}
function compara(v: unknown, op: string, alvo: string): boolean {
  if (op === 'is') return alvo === 'null' ? v === null || v === undefined : String(v) === alvo
  if (v === null || v === undefined) return false
  if (op === 'eq') return String(v) === alvo
  if (op === 'in') return alvo.replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/^"|"$/g, '')).includes(String(v))
  const a = comoNumero(v), b = comoNumero(alvo)
  return op === 'gt' ? a > b : op === 'gte' ? a >= b : op === 'lt' ? a < b : op === 'lte' ? a <= b : false
}
function adminFalso(tabelas: Record<string, Linha[]>) {
  return {
    from(tabela: string) {
      const filtros: ((l: Linha) => boolean)[] = []
      let fatia: [number, number] | null = null
      let um = false
      const resolver = () => {
        let linhas = (tabelas[tabela] ?? []).filter(l => filtros.every(f => f(l)))
        if (fatia) linhas = linhas.slice(fatia[0], fatia[1] + 1)
        return { data: um ? (linhas[0] ?? null) : linhas, error: null }
      }
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => { filtros.push(l => compara(valorEm(l, c), 'eq', String(v))); return q },
        lt: (c: string, v: unknown) => { filtros.push(l => compara(valorEm(l, c), 'lt', String(v))); return q },
        lte: (c: string, v: unknown) => { filtros.push(l => compara(valorEm(l, c), 'lte', String(v))); return q },
        gt: (c: string, v: unknown) => { filtros.push(l => compara(valorEm(l, c), 'gt', String(v))); return q },
        gte: (c: string, v: unknown) => { filtros.push(l => compara(valorEm(l, c), 'gte', String(v))); return q },
        not: (c: string, op: string, v: string) => { filtros.push(l => !compara(valorEm(l, c), op, v)); return q },
        or: (s: string) => {
          const partes = s.split(',').map(p => { const [c, op, ...resto] = p.split('.'); return { c: c!, op: op!, v: resto.join('.') } })
          filtros.push(l => partes.some(p => compara(valorEm(l, p.c), p.op, p.v)))
          return q
        },
        order: () => q,
        limit: (n: number) => { fatia = [0, n - 1]; return q },
        range: (de: number, ate: number) => { fatia = [de, ate]; return q },
        maybeSingle: () => { um = true; return q },
        then: (ok: (r: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(resolver()).then(ok, erro),
      }
      return q
    },
  }
}

const B1 = '11111111-1111-4111-8111-111111111111'
const BRUNA = '22222222-2222-4222-8222-222222222222'
const BRT = (s: string) => new Date(`${s}-03:00`).toISOString()
const agendamento = (id: string, inicio: string, duracaoMin: number): Linha => ({
  id, branch_id: B1, professional_id: BRUNA, status: 'SCHEDULED', scheduled_at: BRT(inicio), duration_min: duracaoMin,
  completed_at: null, clients: { name: 'Carla' }, branches: { tenant_id: 't1' },
})
let banco: ReturnType<typeof adminFalso>
const contexto = {
  userId: 'auth', internalUserId: 'u-ana', userName: 'Ana', tenantId: 't1', branchId: B1, unidades: [B1],
  isNetworkAdmin: false, isClient: false, permissions: { agenda: 'MANAGE' },
} as unknown as TenantContext
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => banco }))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock('@/lib/auth', async orig => ({
  ...(await orig<typeof import('@/lib/auth')>()),
  getTenantContext: async () => contexto,
  assertPermission: () => {},
  alcancaUnidade: () => true,
}))

describe('a grade do Agendar recebe o atendimento longo que começou antes de ontem', () => {
  it('o de três dias, das 08:00 de 08/12, ocupa o 10/12 inteiro', async () => {
    banco = adminFalso({
      branches: [{ id: B1, tenant_id: 't1', horario: null, fuso: 'America/Sao_Paulo' }],
      users: [{ id: BRUNA, tenant_id: 't1', horario: null }],
      agenda_bloqueios: [],
      appointments: [agendamento('licenca', '2026-12-08T08:00:00', 72 * 60), agendamento('acabou', '2026-11-01T08:00:00', 48 * 60)],
    })
    const { getSchedulingDaySlots } = await import('@/actions/appointments')
    const r = await getSchedulingDaySlots(B1, BRUNA, '2026-12-10')
    expect(r.slots).toEqual([{ scheduledAt: BRT('2026-12-08T08:00:00'), durationMin: 72 * 60, clientName: 'Carla' }])
  })
})
