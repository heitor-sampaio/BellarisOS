import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TenantContext } from '@estetica-os/types'

// O primeiro import() carrega o núcleo da agenda e o Supabase.
vi.setConfig({ testTimeout: 30_000 })

/**
 * O choque de horário vale com QUALQUER duração (princípio 3: o que a tela
 * mostra é o que vale; cortar em silêncio é defeito). O procedimento não tem
 * duração máxima, e o agendamento soma as durações — mas a conferência só
 * olhava 12 h para trás (`DURACAO_MAXIMA_MS`): o atendimento de 14 h das 08:00
 * deixava de bloquear quem começasse depois das 20:00 dele, e o choque passava
 * calado. O mesmo nos livres (`computeAvailableSlots`: o app da cliente, o
 * Copilot, o CRM, o "próximo livre") e na contagem do "Bloquear horário".
 */

const fonte = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')

// ─── O Supabase falso: as linhas de cada tabela, filtradas como o PostgREST ───
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
  if (op === 'neq') return String(v) !== alvo
  if (op === 'cs') { const quer = alvo.replace(/^\{|\}$/g, '').split(',').filter(Boolean); return quer.every(x => (v as string[]).includes(x)) }
  if (op === 'in') return alvo.replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/^"|"$/g, '')).includes(String(v))
  const a = comoNumero(v), b = comoNumero(alvo)
  return op === 'gt' ? a > b : op === 'gte' ? a >= b : op === 'lt' ? a < b : op === 'lte' ? a <= b : false
}
function adminFalso(tabelas: Record<string, Linha[]>) {
  return {
    from(tabela: string) {
      const filtros: ((l: Linha) => boolean)[] = []
      const ordem: { col: string; asc: boolean }[] = []
      let fatia: [number, number] | null = null
      let um = false, contagem = false
      const resolver = () => {
        let linhas = (tabelas[tabela] ?? []).filter(l => filtros.every(f => f(l)))
        for (const o of [...ordem].reverse()) linhas = [...linhas].sort((x, y) => (comoNumero(valorEm(x, o.col)) - comoNumero(valorEm(y, o.col))) * (o.asc ? 1 : -1))
        if (fatia) linhas = linhas.slice(fatia[0], fatia[1] + 1)
        if (contagem) return { data: null, count: linhas.length, error: null }
        return { data: um ? (linhas[0] ?? null) : linhas, error: null }
      }
      const q: Record<string, unknown> = {
        select: (_c?: string, o?: { count?: string; head?: boolean }) => { if (o?.head) contagem = true; return q },
        eq: (c: string, v: unknown) => { filtros.push(l => compara(valorEm(l, c), 'eq', String(v))); return q },
        neq: (c: string, v: unknown) => { filtros.push(l => compara(valorEm(l, c), 'neq', String(v))); return q },
        lt: (c: string, v: unknown) => { filtros.push(l => compara(valorEm(l, c), 'lt', String(v))); return q },
        lte: (c: string, v: unknown) => { filtros.push(l => compara(valorEm(l, c), 'lte', String(v))); return q },
        gt: (c: string, v: unknown) => { filtros.push(l => compara(valorEm(l, c), 'gt', String(v))); return q },
        gte: (c: string, v: unknown) => { filtros.push(l => compara(valorEm(l, c), 'gte', String(v))); return q },
        in: (c: string, v: unknown[]) => { filtros.push(l => v.map(String).includes(String(valorEm(l, c)))); return q },
        not: (c: string, op: string, v: string) => { filtros.push(l => !compara(valorEm(l, c), op, v)); return q },
        or: (s: string) => {
          const partes = s.split(',').map(p => { const [c, op, ...resto] = p.split('.'); return { c: c!, op: op!, v: resto.join('.') } })
          filtros.push(l => partes.some(p => compara(valorEm(l, p.c), p.op, p.v)))
          return q
        },
        order: (c: string, o?: { ascending?: boolean }) => { ordem.push({ col: c, asc: o?.ascending !== false }); return q },
        limit: (n: number) => { fatia = [0, n - 1]; return q },
        range: (de: number, ate: number) => { fatia = [de, ate]; return q },
        maybeSingle: () => { um = true; return q },
        single: () => { um = true; return q },
        then: (ok: (r: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(resolver()).then(ok, erro),
      }
      return q
    },
  }
}

// ─── O cenário: a Bruna, de 08:00 a 22:00 (Brasília), com um atendimento longo ───
const B1 = '11111111-1111-4111-8111-111111111111'
const BRUNA = '22222222-2222-4222-8222-222222222222'
const BRT = (s: string) => new Date(`${s}-03:00`).toISOString()
const UNIDADE = { id: B1, tenant_id: 't1', name: 'Centro', horario: null, fuso: 'America/Sao_Paulo', is_active: true }
const agendamento = (id: string, inicio: string, duracaoMin: number, extra: Linha = {}): Linha => ({
  id, tenant_id: 't1', branch_id: B1, professional_id: BRUNA, room_id: 'sala-1', status: 'SCHEDULED',
  scheduled_at: BRT(inicio), duration_min: duracaoMin, completed_at: null,
  branches: { tenant_id: 't1', name: 'Centro' }, ...extra,
})

vi.mock('@/lib/unidades/fuso-da-unidade', () => ({
  lerFusoDaUnidade: async () => 'America/Sao_Paulo',
  fusoDaUnidade: async () => 'America/Sao_Paulo',
  fusoDaRede: async () => 'America/Sao_Paulo',
}))

describe('a conferência do choque (conflitosDoHorario) vale com qualquer duração', () => {
  it('o atendimento de 14 h das 08:00 bloqueia quem começa às 21:00 dele', async () => {
    const { conflitosDoHorario } = await import('@/lib/appointments/core')
    const admin = adminFalso({ appointments: [agendamento('longo', '2026-12-10T08:00:00', 14 * 60)] })
    const conflitos = await conflitosDoHorario(admin as never, {
      tenantId: 't1', professionalId: BRUNA, inicio: new Date(BRT('2026-12-10T21:00:00')), duracaoMin: 30,
    })
    expect(conflitos.map(c => c.inicio.toISOString())).toEqual([BRT('2026-12-10T08:00:00')])
  })

  it('o de três dias (36 h × 2) também bloqueia, pelo profissional e pela sala', async () => {
    const { conflitosDoHorario, horarioOcupado } = await import('@/lib/appointments/core')
    const admin = adminFalso({ appointments: [agendamento('licenca', '2026-12-08T08:00:00', 72 * 60)] })
    const inicio = new Date(BRT('2026-12-10T10:00:00'))
    expect(await conflitosDoHorario(admin as never, { tenantId: 't1', professionalId: BRUNA, inicio, duracaoMin: 60 })).toHaveLength(1)
    expect(await horarioOcupado(admin as never, { tenantId: 't1', roomId: 'sala-1', branchId: B1, inicio, duracaoMin: 60 })).toBe(true)
  })

  it('o longo que já acabou não bloqueia, e o cancelado nunca', async () => {
    const { conflitosDoHorario } = await import('@/lib/appointments/core')
    const admin = adminFalso({ appointments: [
      agendamento('acabou', '2026-12-01T08:00:00', 48 * 60),
      agendamento('cancelado', '2026-12-09T08:00:00', 72 * 60, { status: 'CANCELLED' }),
    ] })
    expect(await conflitosDoHorario(admin as never, {
      tenantId: 't1', professionalId: BRUNA, inicio: new Date(BRT('2026-12-10T10:00:00')), duracaoMin: 60,
    })).toEqual([])
  })
})

describe('os livres (computeAvailableSlots) não oferecem o horário de um atendimento longo', () => {
  it('o de 30 h que começou ontem às 08:00 ocupa hoje até as 14:00', async () => {
    const { computeAvailableSlots } = await import('@/lib/appointments/core')
    const admin = adminFalso({
      branches: [UNIDADE], users: [{ id: BRUNA, horario: null }], agenda_bloqueios: [],
      appointments: [agendamento('longo', '2026-12-09T08:00:00', 30 * 60)],
    })
    const livres = await computeAvailableSlots(admin as never, B1, BRUNA, '2026-12-10', 60)
    expect(livres.length).toBeGreaterThan(0)
    expect(livres.every(h => h >= '14:00')).toBe(true)
  })
})

describe('nenhuma janela fixa de 12 h na conferência', () => {
  it('o núcleo não corta mais pela duração máxima', () => {
    const core = fonte('lib/appointments/core.ts')
    expect(core).not.toMatch(/DURACAO_MAXIMA_MS/)
    expect(fonte('actions/agenda-bloqueios.ts')).not.toMatch(/12 \* 3_600_000/)
    // O "ocupada" do repasse ao desativar (a recusa já passa por horarioOcupado).
    expect(fonte('lib/equipe/repasse.ts')).not.toMatch(/12 \* 3_600_000/)
    expect(fonte('lib/equipe/repasse.ts')).toMatch(/podemOcuparDesde\(/)
  })
})

// ─── O "Bloquear horário": quantos atendimentos já marcados continuam ───
const contexto = {
  userId: 'auth', internalUserId: 'u-ana', userName: 'Ana', tenantId: 't1', branchId: B1, unidades: [B1],
  isNetworkAdmin: false, isClient: false,
} as unknown as TenantContext
let banco: ReturnType<typeof adminFalso>
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => banco }))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock('@/lib/auth', async orig => ({
  ...(await orig<typeof import('@/lib/auth')>()),
  getTenantContext: async () => contexto,
  assertPermission: () => {},
  alcancaUnidade: () => true,
}))
vi.mock('@/lib/cached-queries', () => ({ filtroDeQuemAtendeNaUnidade: (id: string) => `atende_em.cs.{${id}}` }))

describe('o aviso do "Bloquear horário" conta o atendimento longo que continua', () => {
  beforeEach(() => {
    const tabelas: Record<string, Linha[]> = {
      branches: [UNIDADE],
      users: [{ id: BRUNA, tenant_id: 't1', is_active: true, atende_em: [B1] }],
      agenda_bloqueios: [],
      appointments: [agendamento('longo', '2026-12-09T08:00:00', 30 * 60)],
    }
    const base = adminFalso(tabelas)
    banco = {
      from(t: string) {
        if (t !== 'agenda_bloqueios') return base.from(t)
        return { insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'bl-1' }, error: null }) }) }) } as never
      },
    } as never
  })

  it('o bloqueio de hoje às 10:00 diz que o atendimento de 30 h de ontem continua', async () => {
    vi.useFakeTimers({ now: new Date(BRT('2026-12-10T06:00:00')), toFake: ['Date'] })
    try {
      const { bloquearHorario } = await import('@/actions/agenda-bloqueios')
      const r = await bloquearHorario({
        branchId: B1, professionalId: BRUNA, roomId: null,
        inicio: BRT('2026-12-10T10:00:00'), fim: BRT('2026-12-10T11:00:00'), motivo: 'Reunião',
      })
      expect(r.error).toBeUndefined()
      expect(r.aviso).toBe('Já há 1 atendimento marcado perto desse período: ele continua na agenda. Remarque se precisar.')
    } finally {
      vi.useRealTimers()
    }
  })
})
