import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TenantContext, ResolvedPermissions } from '@estetica-os/types'
import { NO_PERMISSIONS } from '@/lib/permissions'
import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'
import * as ocupacao from '@/lib/metrics/ocupacao'
import * as agendaDoDia from '@/lib/metrics/agenda-do-dia'
import * as minhaAgenda from '@/lib/agenda/minha-agenda'

// O primeiro import() de uma ferramenta do Copilot carrega o Supabase e o núcleo.
vi.setConfig({ testTimeout: 30_000 })

/**
 * O que a tela mostra é o que vale (princípio 3). O procedimento não tem
 * duração máxima, e as agendas já desenham o atendimento em cada dia que ele
 * ocupa (`trechoDoAgendamentoNoDia`, 25/11). Os números e as listas do dia
 * ainda olhavam só o dia em que ele COMEÇA:
 *
 * 1. A ocupação do dia (a agenda da unidade, a Minha agenda e o dashboard da
 *    unidade) somava a duração INTEIRA no dia do início: um atendimento de
 *    30 h dava mais de 100% num dia e 0% no seguinte. A ocupação de um dia é o
 *    que o atendimento ocupa DAQUELE dia, pela duração marcada. A definição
 *    da ocupação não muda (os concluídos contam a duração); a contagem dos
 *    atendimentos do dia segue pelo dia de início.
 * 2. O destaque da Minha agenda ("Em atendimento agora", "Atrasado") olhava só
 *    os que começaram hoje: o longo em atendimento desde ontem não aparecia.
 * 3. A "Agenda de hoje" do dashboard e as leituras de agenda do Copilot
 *    listavam pelo início: o atendimento que continua de ontem e ocupa hoje
 *    ficava de fora (e a pessoa parecia livre).
 *
 * Os testes rodam em TZ=UTC: o "de parede" sem fuso é o relógio da grade.
 */

const fonte = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')
const BRT = (s: string) => new Date(`${s}-03:00`)
const diaDe = (d: string) => ({ de: BRT(`${d}T00:00:00`), ate: BRT(`${d}T23:59:59.999`) })
const ev = (inicio: string, durationMin: number, extra: Partial<{ status: string; completedAt: string | null }> = {}) =>
  ({ start: BRT(inicio).toISOString(), durationMin, status: extra.status ?? 'SCHEDULED', completedAt: extra.completedAt ?? null })

// ─── 1. A ocupação do dia ──────────────────────────────────────────────────

describe('os minutos agendados de um período são o trecho de cada atendimento nele', () => {
  const minutos = (eventos: ReturnType<typeof ev>[], de: Date, ate: Date) => ocupacao.minutosAgendadosNoPeriodo(eventos, de, ate)
  const longo = ev('2026-12-09T18:00:00', 16 * 60) // das 18:00 de 09/12 às 10:00 de 10/12

  it('o atendimento dentro do dia: a duração inteira, como sempre', () => {
    const { de, ate } = diaDe('2026-12-10')
    expect(minutos([ev('2026-12-10T10:00:00', 60)], de, ate)).toBe(60)
  })

  it('o que atravessa a meia-noite conta em cada dia o que ocupa nele', () => {
    expect(minutos([longo], diaDe('2026-12-09').de, diaDe('2026-12-09').ate), 'no dia do início, das 18:00 à meia-noite').toBe(360)
    expect(minutos([longo], diaDe('2026-12-10').de, diaDe('2026-12-10').ate), 'no dia seguinte, da meia-noite às 10:00').toBe(600)
    expect(minutos([longo], diaDe('2026-12-11').de, diaDe('2026-12-11').ate)).toBe(0)
  })

  it('o de três dias ocupa o dia do meio inteiro', () => {
    const { de, ate } = diaDe('2026-12-10')
    expect(minutos([ev('2026-12-09T08:00:00', 72 * 60)], de, ate)).toBe(24 * 60)
  })

  it('no período de dois dias, a duração inteira (nada conta duas vezes)', () =>
    expect(minutos([longo], diaDe('2026-12-09').de, diaDe('2026-12-10').ate)).toBe(16 * 60))

  it('o cancelado e a falta não ocupam nada', () => {
    const { de, ate } = diaDe('2026-12-10')
    expect(minutos([ev('2026-12-10T10:00:00', 60, { status: 'CANCELLED' }), ev('2026-12-10T11:00:00', 60, { status: 'NO_SHOW' })], de, ate)).toBe(0)
  })

  it('o concluído adiantado conta a duração marcada, recortada pelo dia (a definição da ocupação não muda)', () => {
    const concluido = ev('2026-12-09T18:00:00', 16 * 60, { status: 'COMPLETED', completedAt: BRT('2026-12-09T22:00:00').toISOString() })
    expect(minutos([concluido], diaDe('2026-12-09').de, diaDe('2026-12-09').ate)).toBe(360)
    expect(minutos([concluido], diaDe('2026-12-10').de, diaDe('2026-12-10').ate)).toBe(600)
  })

  it('o concluído sem a hora da conclusão conta a duração marcada (os concluídos contam)', () => {
    const { de, ate } = diaDe('2026-12-10')
    expect(minutos([ev('2026-12-10T10:00:00', 90, { status: 'COMPLETED' })], de, ate)).toBe(90)
  })
})

describe('a ocupação do dia (a Minha agenda) recorta o atendimento pelo dia', () => {
  // A unidade e ela das 08:00 às 20:00 todos os dias: 720 min de capacidade.
  const todoDia = { dias: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, [{ de: '08:00', ate: '20:00' }]])) }
  const horarios = { unidade: todoDia, profissional: null }
  const longo = ev('2026-12-09T18:00:00', 16 * 60)

  it('no dia do início, só o que ele ocupa nele (360 de 720 = 50%), não a duração inteira', () =>
    expect(ocupacao.ocupacaoDoDia([longo], horarios, BRT('2026-12-09T12:00:00'))).toBe(50))

  it('no dia seguinte, o que ele ocupa até as 10:00 (600 de 720 = 83%), não 0%', () =>
    expect(ocupacao.ocupacaoDoDia([longo], horarios, BRT('2026-12-10T12:00:00'))).toBe(83))
})

// ─── 2. O destaque da Minha agenda ─────────────────────────────────────────

describe('o destaque da Minha agenda olha quem ocupa o dia, não só quem começou nele', () => {
  // A Minha agenda trabalha "na parede": o texto sem fuso é o relógio da grade.
  const naGrade = (id: string, start: string, durationMin: number, status: string) =>
    ({ id, start, durationMin, status, completedAt: null as string | null })
  const agora = new Date('2026-12-10T08:00:00')

  it('o longo em atendimento desde ontem: "Em atendimento agora"', () => {
    const d = minhaAgenda.destaqueDaMinhaAgenda([naGrade('longo', '2026-12-09T18:00:00', 16 * 60, 'IN_PROGRESS')], agora)
    expect(d?.ev.id).toBe('longo')
    expect(d?.label).toBe('Em atendimento agora')
    expect(d?.continuaDeAntes).toBe(true)
  })

  it('o longo que começou ontem e ninguém iniciou: "Atrasado"', () => {
    const d = minhaAgenda.destaqueDaMinhaAgenda([naGrade('longo', '2026-12-09T22:00:00', 16 * 60, 'CONFIRMED')], agora)
    expect(d?.ev.id).toBe('longo')
    expect(d?.label).toBe('Atrasado: 600 min')
  })

  it('o de hoje segue como sempre: o próximo', () => {
    const d = minhaAgenda.destaqueDaMinhaAgenda([naGrade('cedo', '2026-12-10T10:00:00', 60, 'SCHEDULED')], agora)
    expect(d).toMatchObject({ ev: { id: 'cedo' }, label: 'Próximo atendimento', continuaDeAntes: false })
  })

  it('o de ontem que já acabou não é destaque', () =>
    expect(minhaAgenda.destaqueDaMinhaAgenda([naGrade('ontem', '2026-12-09T18:00:00', 60, 'IN_PROGRESS')], agora)).toBeNull())
})

// ─── 3. As listas do dia ───────────────────────────────────────────────────

describe('a agenda do dia lista o que acontece no dia, com o início real', () => {
  const linha = (id: string, inicio: string, duration_min: number, status = 'SCHEDULED', completed_at: string | null = null) =>
    ({ id, scheduled_at: BRT(inicio).toISOString(), duration_min, status, completed_at })
  const { de, ate } = diaDe('2026-12-10')

  it('o que continua de ontem entra (primeiro, com o início real); o que acabou ontem não', () => {
    const lista = agendaDoDia.agendaDoPeriodo([
      linha('tarde', '2026-12-10T15:00:00', 60),
      linha('longo', '2026-12-09T18:00:00', 16 * 60),
      linha('acabou', '2026-12-09T18:00:00', 60),
      linha('amanha', '2026-12-11T09:00:00', 60),
    ], de, ate)
    expect(lista.map(l => [l.id, l.comecouAntes])).toEqual([['longo', true], ['tarde', false]])
    expect(lista[0]!.scheduled_at).toBe(BRT('2026-12-09T18:00:00').toISOString())
  })

  it('o cancelado de ontem não continua; o concluído continua só até a conclusão', () => {
    const lista = agendaDoDia.agendaDoPeriodo([
      linha('cancelado', '2026-12-09T18:00:00', 16 * 60, 'CANCELLED'),
      linha('concluido', '2026-12-09T18:00:00', 16 * 60, 'COMPLETED', BRT('2026-12-09T23:00:00').toISOString()),
      linha('ainda', '2026-12-09T18:00:00', 16 * 60, 'COMPLETED', BRT('2026-12-10T01:00:00').toISOString()),
    ], de, ate)
    expect(lista.map(l => l.id)).toEqual(['ainda'])
  })
})

describe('as telas usam as contas do dia (fonte única, lib/metrics)', () => {
  it('a agenda da unidade: os minutos da ocupação pelo trecho do período, a contagem pelo início', () => {
    const f = fonte('components/branch/agenda-calendar.tsx')
    expect(f).toMatch(/minutosAgendadosNoPeriodo\(/)
    expect(f).not.toMatch(/\.reduce\(\(s, e\) => s \+ e\.durationMin, 0\)/)
  })
  it('a Minha agenda: o destaque e as horas de hoje', () => {
    const f = fonte('components/branch/professional-agenda.tsx')
    expect(f).toMatch(/destaqueDaMinhaAgenda\(/)
    expect(f).toMatch(/minutosAgendadosNoPeriodo\(/)
    expect(f).not.toMatch(/\.reduce\(\(s, e\) => s \+ e\.durationMin, 0\)/)
  })
  it('o dashboard da unidade lê quem se sobrepõe ao dia, de qualquer duração, e recorta pelo dia', () => {
    const f = fonte('app/[slug]/dashboard/page.tsx')
    expect(f).toMatch(/podemOcuparDesde\(/)
    expect(f).toMatch(/agendaDoPeriodo\(/)
    expect(f).toMatch(/minutosAgendadosNoPeriodo\(/)
    expect(f).not.toMatch(/validToday\.reduce\(/)
  })
})

// ─── O Copilot, com um Supabase falso que FILTRA ───────────────────────────

const UNIDADES = [{ id: 'b-1', name: 'Centro', slug: 'centro' }]
vi.mock('@/lib/cached-queries', () => ({
  getCachedNetworkBranches: async () => UNIDADES,
  filtroDeQuemAtendeNaUnidade: (id: string) => `atende_em.cs.{${id}}`,
}))
vi.mock('@/lib/unidades/fuso-da-unidade', () => ({
  fusoDaUnidade: async () => 'America/Sao_Paulo',
  fusoDaRede: async () => 'America/Sao_Paulo',
}))

const TODAS = FUNCIONALIDADES.map(f => f.chave)
function ctxDoCopilot(over: Partial<TenantContext> = {}): TenantContext {
  return {
    userId: 'auth', internalUserId: 'u-ana', userName: 'Ana', roleLabel: 'Dona',
    tenantId: 't1', branchId: null, unidades: null, role: 'NETWORK_ADMIN', roleId: 'r1', clientId: null,
    permissions: { ...NO_PERMISSIONS, copilot: 'MANAGE', agenda: 'MANAGE', clients: 'MANAGE' } as ResolvedPermissions,
    reportTabs: [], providesServices: false, isNetworkAdmin: true, isClient: false,
    plano: { funcionalidades: TODAS, limites: { unidades: null, membros: null, whatsapp: null } },
    ...over,
  } as TenantContext
}

type Linha = Record<string, unknown>
const comoNumero = (v: unknown): number => {
  if (typeof v === 'number') return v
  const n = Number(v)
  if (v !== '' && v !== null && Number.isFinite(n)) return n
  return new Date(String(v)).getTime()
}
function compara(v: unknown, op: string, alvo: unknown): boolean {
  if (op === 'in') {
    const lista = Array.isArray(alvo) ? alvo.map(String) : String(alvo).replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/^"|"$/g, ''))
    return lista.includes(String(v))
  }
  if (v === null || v === undefined) return op === 'is' && String(alvo) === 'null'
  if (op === 'eq') return String(v) === String(alvo)
  if (op === 'neq') return String(v) !== String(alvo)
  const a = comoNumero(v), b = comoNumero(alvo)
  return op === 'gt' ? a > b : op === 'gte' ? a >= b : op === 'lt' ? a < b : op === 'lte' ? a <= b : false
}
/** O PostgREST falso: aplica os filtros, a ordem por scheduled_at e as fatias. */
function adminQueFiltra(tabelas: Record<string, Linha[]>) {
  return {
    from(tabela: string) {
      const filtros: ((l: Linha) => boolean)[] = []
      let fatia: [number, number] | null = null
      let um = false
      const q: Record<string, unknown> = {
        select: () => q,
        order: () => q,
        eq: (c: string, v: unknown) => { filtros.push(l => compara(l[c], 'eq', v)); return q },
        neq: (c: string, v: unknown) => { filtros.push(l => compara(l[c], 'neq', v)); return q },
        in: (c: string, v: unknown[]) => { filtros.push(l => compara(l[c], 'in', v)); return q },
        lt: (c: string, v: unknown) => { filtros.push(l => compara(l[c], 'lt', v)); return q },
        lte: (c: string, v: unknown) => { filtros.push(l => compara(l[c], 'lte', v)); return q },
        gt: (c: string, v: unknown) => { filtros.push(l => compara(l[c], 'gt', v)); return q },
        gte: (c: string, v: unknown) => { filtros.push(l => compara(l[c], 'gte', v)); return q },
        not: (c: string, op: string, v: string) => { filtros.push(l => !compara(l[c], op, v)); return q },
        or: (s: string) => {
          const partes = s.split(',').map(p => { const [c, op, ...resto] = p.split('.'); return { c: c!, op: op!, v: resto.join('.') } })
          filtros.push(l => partes.some(p => compara(l[p.c], p.op, p.v)))
          return q
        },
        limit: (n: number) => { fatia = [0, n - 1]; return q },
        range: (de: number, ate: number) => { fatia = [de, ate]; return q },
        maybeSingle: () => { um = true; return q },
        single: () => { um = true; return q },
        then: (ok: (r: unknown) => unknown, erro?: (e: unknown) => unknown) => {
          let linhas = (tabelas[tabela] ?? []).filter(l => filtros.every(f => f(l)))
            .sort((a, b) => String(a.scheduled_at ?? '').localeCompare(String(b.scheduled_at ?? '')))
          if (fatia) linhas = linhas.slice(fatia[0], fatia[1] + 1)
          return Promise.resolve({ data: um ? (linhas[0] ?? null) : linhas, error: null }).then(ok, erro)
        },
      }
      return q
    },
    rpc: async () => ({ data: [], error: null }),
  }
}

const AGENDA = [
  // A licença de 30 h da Bruna, das 08:00 de 09/12 às 14:00 de 10/12.
  { id: 'longo', scheduled_at: BRT('2026-12-09T08:00:00').toISOString(), duration_min: 30 * 60, status: 'CONFIRMED', completed_at: null, branch_id: 'b-1', client_id: 'c-1', procedure_id: 'p-1', professional_id: 'u-bruna' },
  { id: 'acabou', scheduled_at: BRT('2026-12-09T09:00:00').toISOString(), duration_min: 60, status: 'SCHEDULED', completed_at: null, branch_id: 'b-1', client_id: 'c-1', procedure_id: 'p-1', professional_id: 'u-bruna' },
  { id: 'tarde', scheduled_at: BRT('2026-12-10T15:00:00').toISOString(), duration_min: 60, status: 'SCHEDULED', completed_at: null, branch_id: 'b-1', client_id: 'c-1', procedure_id: 'p-1', professional_id: 'u-bruna' },
]
const TABELAS = {
  appointments: AGENDA,
  clients: [{ id: 'c-1', name: 'Carla' }], procedures: [{ id: 'p-1', name: 'Protocolo longo' }],
  users: [{ id: 'u-bruna', name: 'Bruna', is_active: true, provides_services: true, tenant_id: 't1' }],
  branches: [{ id: 'b-1', name: 'Centro' }],
}

afterEach(() => { vi.useRealTimers() })

describe('o Copilot, ao ler a agenda de um dia, não omite o atendimento que continua de ontem', () => {
  it('agendamentos de 10/12: o longo de ontem entra, com o início real; o que acabou ontem, não', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(BRT('2026-12-10T09:00:00'))
    const { agendamentos } = await import('@/lib/copilot/ferramentas/agenda')
    const c = { ctx: ctxDoCopilot(), admin: adminQueFiltra(TABELAS) as never, pagina: '/admin/dashboard', slugDoPortal: null }
    const r = await agendamentos.executar(c, { de: '2026-12-10' })
    const d = r.dados as { agendamentos: { id: string; quando: string; continuaDeAntes?: boolean }[] }
    expect(d.agendamentos.map(a => a.id)).toEqual(['longo', 'tarde'])
    expect(d.agendamentos[0]!.quando).toMatch(/09\/12/)
    expect(d.agendamentos[0]!.continuaDeAntes).toBe(true)
  })

  it('minha_agenda de 10/12: o dela que continua de ontem entra', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(BRT('2026-12-10T09:00:00'))
    const { minhaAgenda: ferramenta } = await import('@/lib/copilot/ferramentas/agenda')
    const quemAtende = ctxDoCopilot({
      internalUserId: 'u-bruna', isNetworkAdmin: false, providesServices: true,
      permissions: { ...NO_PERMISSIONS, copilot: 'MANAGE' } as ResolvedPermissions,
      atendeEm: ['b-1'],
    } as Partial<TenantContext>)
    const c = { ctx: quemAtende, admin: adminQueFiltra(TABELAS) as never, pagina: '/admin/dashboard', slugDoPortal: null }
    const r = await ferramenta.executar(c, { de: '2026-12-10' })
    const d = r.dados as { erro?: string; agendamentos: { id: string }[] }
    expect(d.erro).toBeUndefined()
    expect(d.agendamentos.map(a => a.id)).toEqual(['longo', 'tarde'])
  })
})
