import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { avisoDoBloqueioDaProfissional, avisoDoBloqueioDaSala, recusaDoHorarioBloqueado } from '@/lib/agenda/bloqueio'

// O primeiro import() carrega o núcleo da agenda e o Supabase.
vi.setConfig({ testTimeout: 30_000 })

/**
 * R07 (o Heitor, 26/11, no chat, sobre a R07: "r07 se ta bloqueado não dá pra
 * marcar"): o horário que cai num BLOQUEIO, da pessoa que atende ou da sala
 * (o do dia inteiro também), deixa de ser encaixe e é RECUSADO — em todo caminho
 * que cria ou move agendamento, com a frase que diz o bloqueio. Era "avisa e
 * deixa" (decisão 3 da 7ª; princípio 2, 18/11).
 * - O que NÃO muda: fora do horário de quem atende ou da unidade, o dia em que a
 *   unidade não abre, o dia em que a pessoa não atende e o que passa da
 *   meia-noite seguem encaixe permitido, com o aviso.
 * - O que já está marcado num bloqueio criado depois continua: a recusa é só
 *   para marcar ou mover PARA dentro dele.
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
        gt: (c: string, v: unknown) => { filtros.push(l => compara(valorEm(l, c), 'gt', String(v))); return q },
        order: () => q,
        limit: (n: number) => { fatia = [0, n - 1]; return q },
        maybeSingle: () => { um = true; return q },
        single: () => { um = true; return q },
        then: (ok: (r: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(resolver()).then(ok, erro),
      }
      return q
    },
  }
}

const BRUNA = '22222222-2222-4222-8222-222222222222'
const SALA = '33333333-3333-4333-8333-333333333333'
const B1 = '11111111-1111-4111-8111-111111111111'
const BRT = (s: string) => new Date(`${s}-03:00`).toISOString()
let n = 0
const bloqueio = (o: Linha): Linha => ({ id: `bl-${++n}`, tenant_id: 't1', branch_id: B1, professional_id: null, room_id: null, criado_por_nome: 'Ana', ...o })
const b = (inicio: string, fim: string, motivo = 'Almoço') => ({ inicio: BRT(inicio), fim: BRT(fim), motivo })

vi.mock('@/lib/unidades/fuso-da-unidade', () => ({
  lerFusoDaUnidade: async () => 'America/Sao_Paulo',
  fusoDaUnidade: async () => 'America/Sao_Paulo',
  fusoDaRede: async () => 'America/Sao_Paulo',
}))

describe('os textos do bloqueio: o que não vai ser agendado, e a recusa', () => {
  it('a pessoa que atende e a sala, sem "o encaixe é permitido"', () => {
    expect(avisoDoBloqueioDaProfissional('Bruna', b('2026-11-10T12:00:00', '2026-11-10T13:00:00')))
      .toBe('Bruna está com o horário bloqueado das 12:00 às 13:00 (Almoço).')
    expect(avisoDoBloqueioDaSala('Sala Rosa', b('2026-11-10T00:00:00', '2026-11-11T00:00:00', 'Manutenção')))
      .toBe('Sala Rosa está bloqueada o dia 10/11 inteiro (Manutenção).')
  })
  it('a recusa pede outro horário; sem bloqueio, nada', () => {
    expect(recusaDoHorarioBloqueado(['Bruna está com o horário bloqueado das 12:00 às 13:00 (Almoço).']))
      .toBe('Bruna está com o horário bloqueado das 12:00 às 13:00 (Almoço). Escolha outro horário.')
    expect(recusaDoHorarioBloqueado([])).toBeNull()
  })
})

describe('recusaDoBloqueioNoHorario: o núcleo recusa o horário bloqueado', () => {
  const tabelas = () => ({
    users: [{ id: BRUNA, name: 'Bruna', tenant_id: 't1' }],
    rooms: [{ id: SALA, name: 'Sala Rosa', branch_id: B1 }],
    agenda_bloqueios: [
      bloqueio({ professional_id: BRUNA, inicio: BRT('2026-12-10T12:00:00'), fim: BRT('2026-12-10T13:00:00'), motivo: 'Almoço' }),
      bloqueio({ room_id: SALA, inicio: BRT('2026-12-11T00:00:00'), fim: BRT('2026-12-12T00:00:00'), motivo: 'Manutenção' }),
    ],
  })
  it('a pessoa que atende bloqueada: recusa, dizendo o bloqueio', async () => {
    const { recusaDoBloqueioNoHorario } = await import('@/lib/appointments/core')
    expect(await recusaDoBloqueioNoHorario(adminFalso(tabelas()) as never, {
      professionalId: BRUNA, inicio: new Date(BRT('2026-12-10T12:30:00')), duracaoMin: 30, branchId: B1,
    })).toBe('Bruna está com o horário bloqueado das 12:00 às 13:00 (Almoço). Escolha outro horário.')
  })
  it('o que só entra no bloqueio pelo fim também é recusado (a duração inteira)', async () => {
    const { recusaDoBloqueioNoHorario } = await import('@/lib/appointments/core')
    expect(await recusaDoBloqueioNoHorario(adminFalso(tabelas()) as never, {
      professionalId: BRUNA, inicio: new Date(BRT('2026-12-10T11:30:00')), duracaoMin: 60, branchId: B1,
    })).toMatch(/^Bruna está com o horário bloqueado/)
  })
  it('a sala bloqueada o dia inteiro: recusa, dizendo "o dia inteiro"', async () => {
    const { recusaDoBloqueioNoHorario } = await import('@/lib/appointments/core')
    expect(await recusaDoBloqueioNoHorario(adminFalso(tabelas()) as never, {
      professionalId: BRUNA, roomId: SALA, inicio: new Date(BRT('2026-12-11T10:00:00')), duracaoMin: 60, branchId: B1,
    })).toBe('Sala Rosa está bloqueada o dia 11/12 inteiro (Manutenção). Escolha outro horário.')
  })
  it('encostar no bloqueio não é cair nele; e sem bloqueio nada se recusa (o fora do horário segue encaixe)', async () => {
    const { recusaDoBloqueioNoHorario } = await import('@/lib/appointments/core')
    const admin = adminFalso(tabelas()) as never
    expect(await recusaDoBloqueioNoHorario(admin, { professionalId: BRUNA, inicio: new Date(BRT('2026-12-10T13:00:00')), duracaoMin: 60, branchId: B1 })).toBeNull()
    expect(await recusaDoBloqueioNoHorario(admin, { professionalId: BRUNA, inicio: new Date(BRT('2026-12-10T11:00:00')), duracaoMin: 60, branchId: B1 })).toBeNull()
    expect(await recusaDoBloqueioNoHorario(admin, { professionalId: BRUNA, inicio: new Date(BRT('2026-12-10T03:00:00')), duracaoMin: 60, branchId: B1 })).toBeNull()
  })
})

describe('todo caminho que cria ou move agendamento confere o bloqueio', () => {
  it('o núcleo do agendar (a equipe, o CRM, o pré-pago, as sessões de pacote e de plano, o app e o Copilot)', () => {
    const core = fonte('lib/appointments/core.ts')
    const criar = core.slice(core.indexOf('export async function createAppointmentCore'), core.indexOf('export async function computeAvailableSlots'))
    expect(criar).toMatch(/recusaDoBloqueioNoHorario\(admin, \{/)
    expect(criar).toMatch(/if \(bloqueado\) return \{ error: bloqueado \}/)
  })
  it('o remarcar (a janela, o arraste, o Copilot) e o mudar de unidade', () => {
    const alt = fonte('lib/appointments/alteracoes.ts')
    const remarcar = alt.slice(alt.indexOf('export async function remarcarCore'), alt.indexOf('export async function mudarUnidadeCore'))
    expect(remarcar).toMatch(/recusaDoBloqueioNoHorario\(admin, \{/)
    expect(alt.slice(alt.indexOf('export async function mudarUnidadeCore'))).toMatch(/recusaDoBloqueioNoHorario\(admin, \{/)
  })
  it('a troca de quem atende pela janela e o repasse ao desativar', () => {
    const acoes = fonte('actions/appointments.ts')
    expect(acoes.slice(acoes.indexOf('async function reassignProfessionalInterno'), acoes.indexOf('export async function cancelAppointmentSession'))).toMatch(/recusaDoBloqueioNoHorario\(admin, \{/)
    expect(fonte('lib/equipe/repasse.ts')).toMatch(/recusaDoBloqueioNoHorario\(admin, \{/)
  })
  it('o checkout do plano confere antes do dinheiro', () => {
    const planos = fonte('actions/treatment-plans.ts')
    expect(planos.slice(planos.indexOf('// Cada horário escolhido é conferido ANTES'), planos.indexOf('// 1. Dinheiro.'))).toMatch(/recusaDoBloqueioNoHorario\(admin, \{/)
  })
  it('a sala que o sistema escolhe sozinho (o checkout, o remarcar do app) não é a bloqueada', () => {
    expect(fonte('lib/appointments/salas.ts')).toMatch(/bloqueiosQueBatem\(admin, \{ roomId: unica\.id/)
    expect(fonte('actions/portal-agendamentos.ts')).toMatch(/salaDeAntesLivre = [\s\S]{0,500}bloqueiosQueBatem\(admin, \{ roomId: a\.room_id/)
  })
  it('o Copilot recusa no cartão, com a frase do núcleo', () => {
    const f = fonte('lib/copilot/ferramentas/agenda-escrita.ts')
    expect(f).not.toContain('O encaixe é permitido')
    expect(f.match(/const bloqueado = [^\n]*await recusaDoBloqueioNoHorario\(c\.admin, \{/g)).toHaveLength(2)
    expect(f.match(/if \(bloqueado\) return \{ erro: bloqueado \}/g)).toHaveLength(2)
  })
  it('o aviso do remarcar confere também a sala do agendamento', () => {
    const acoes = fonte('actions/appointments.ts')
    const avisos = acoes.slice(acoes.indexOf('export async function avisosDoRemarcar'))
    expect(avisos).toMatch(/roomId: a\.room_id/)
  })
})
