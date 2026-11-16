import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MODELOS_DE_AUTOMACAO } from '@/lib/automacoes/modelos'
import { LIMITES_PADRAO } from '@estetica-os/types'

/**
 * D2 da 19ª simulação (2026-11-16; princípios 3 e 6). O "Lembrete antes do
 * agendamento" de um horário marcado de madrugada passou pelo "Se ainda está
 * de pé" e parou no silêncio noturno ("Silêncio até 08:00. A mensagem espera o
 * horário"). No banco, a execução ficou `ok` com `no_atual` nulo: a espera do
 * silêncio guardava o passo SEGUINTE ao da mensagem, e a mensagem do último
 * passo nunca saía. Com o conserto, a mensagem retida volta ao PRÓPRIO passo —
 * e, ao sair do silêncio, confere de novo o "Se" do caminho e o horário:
 *
 * - o agendamento concluído, cancelado ou com falta durante o silêncio: não sai;
 * - o horário que já passou durante o silêncio: não sai;
 * - o agendamento ainda de pé e por vir: sai, uma vez.
 */

type Linha = Record<string, unknown>
const banco: Record<string, Linha[]> = {}

function construtor(tabela: string) {
  const filtros: [string, unknown][] = []
  let patch: Linha | null = null
  let inserir: Linha | Linha[] | null = null
  let contarSo = false
  let uma = false
  const b: Record<string, unknown> = {}
  const encadear = (op: string) => (...args: unknown[]) => {
    if (op === 'eq') filtros.push([args[0] as string, args[1]])
    if (op === 'update') patch = args[0] as Linha
    if (op === 'insert') inserir = args[0] as Linha | Linha[]
    if (op === 'select' && (args[1] as { head?: boolean } | undefined)?.head) contarSo = true
    if (op === 'maybeSingle' || op === 'single') uma = true
    return b
  }
  for (const op of ['select', 'eq', 'in', 'contains', 'gte', 'lte', 'neq', 'is', 'order', 'limit', 'maybeSingle', 'single', 'update', 'insert']) {
    b[op] = encadear(op)
  }
  b.then = (ok: (r: unknown) => unknown, falhou?: (e: unknown) => unknown) => {
    const linhas = (banco[tabela] ??= [])
    const casam = linhas.filter(l => filtros.every(([c, v]) => l[c] === v))
    let r: unknown
    if (inserir) {
      const novas = (Array.isArray(inserir) ? inserir : [inserir]).map(l => ({ id: `id-${linhas.length + 1}`, ...l }))
      linhas.push(...novas)
      r = { data: uma ? novas[0] : novas, error: null }
    } else if (patch) {
      for (const l of casam) Object.assign(l, patch)
      r = { data: null, error: null }
    } else if (contarSo) {
      r = { count: casam.length, error: null }
    } else {
      r = { data: uma ? (casam[0] ?? null) : casam, error: null }
    }
    return Promise.resolve(r).then(ok, falhou)
  }
  return b
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: construtor }) }))
vi.mock('@/lib/unidades/fuso-da-unidade', () => ({
  fusoDaUnidade: async () => 'America/Sao_Paulo', fusoDaRede: async () => 'America/Sao_Paulo',
}))
vi.mock('@/lib/redes/bloqueio', () => ({ redeEstaBloqueada: async () => false }))
vi.mock('@estetica-os/nucleo/lib/planos/da-rede', () => ({ redeTemRecurso: async () => true }))
vi.mock('@/lib/automacoes/acoes', () => ({ notificarEquipe: vi.fn(), anotarNaLinhaDoTempo: vi.fn() }))
vi.mock('@/lib/automacoes/acoes-crm', () => ({
  moverDeEtapa: vi.fn(), marcarDesfecho: vi.fn(), adicionarTagAoCliente: vi.fn(), definirResponsavel: vi.fn(),
}))
const mandarMensagem = vi.fn(async () => ({ resumo: { enviada: true } }))
vi.mock('@/lib/automacoes/acoes-mensagem', () => ({ mandarMensagem }))

const modelo = MODELOS_DE_AUTOMACAO.find(m => m.chave === 'lembrete-antes-do-agendamento')!

/** 16/11, 09:00 em Brasília (12:00 UTC) — o Bioestimulador da Isabela. */
const NOVE_DA_MANHA = '2026-11-16T12:00:00.000Z'

function montar(agendadoPara = NOVE_DA_MANHA) {
  for (const k of Object.keys(banco)) delete banco[k]
  banco.automations = [{
    id: 'auto1', nome: 'Lembrete antes do agendamento', grafo: modelo.grafo(), status: 'ATIVA',
    limites: { ...LIMITES_PADRAO, silencioDe: '21:00', silencioAte: '08:00', tetoPorClienteDia: null },
  }]
  banco.appointments = [{
    id: 'ag1', scheduled_at: agendadoPara, status: 'SCHEDULED', price: 2000, client_id: 'cl1', branch_id: 'b1',
    professional_id: 'u1', procedures: { name: 'Bioestimulador' }, users: { name: 'Dra. Elisa' },
  }]
  banco.clients = [{ id: 'cl1', tenant_id: 't1', name: 'Isabela', phone: '62999990000', email: null, birth_date: null, gender: null, tags: [], is_active: true, branch_id: 'b1' }]
  banco.automation_run_steps = []
  banco.automation_runs = [{
    id: 'run1', tenant_id: 't1', automation_id: 'auto1', evento_id: 'ev1', no_atual: 'n_lem_criado',
    tentativas: 0, profundidade: 0, simulacao: false, status: 'esperando',
    contexto: {
      evento: {
        id: 'ev1', nome: 'agendamento.criado', entidade: 'agendamento', entidadeId: 'ag1',
        dados: { agendamentoId: 'ag1', clienteId: 'cl1', agendadoPara },
        ator: 'Renan', atorTipo: 'membro', origem: 'app', quando: '2026-11-16T09:27:00.000Z',
      },
    },
  }]
}

const run = () => banco.automation_runs![0]!
const ultimoPasso = () => banco.automation_run_steps!.at(-1)!

describe('D2: o lembrete retido pelo silêncio', () => {
  beforeEach(() => { vi.useFakeTimers(); mandarMensagem.mockClear() })
  afterEach(() => { vi.useRealTimers() })

  it('fica esperando NO PRÓPRIO passo da mensagem (não termina sem mandar)', async () => {
    montar()
    vi.setSystemTime(new Date('2026-11-16T09:27:00.000Z')) // 06:27 em Brasília
    const { executarRun } = await import('@/lib/automacoes/executar')
    expect(await executarRun('run1')).toBe('esperando')
    expect(run().no_atual, 'a mensagem retida volta a ela mesma').toBe('n_lem_msg')
    expect(run().status).toBe('esperando')
    expect(mandarMensagem).not.toHaveBeenCalled()
  })

  it('o agendamento ainda de pé e por vir: às 08:00 a mensagem sai, uma vez', async () => {
    montar()
    vi.setSystemTime(new Date('2026-11-16T09:27:00.000Z'))
    const { executarRun } = await import('@/lib/automacoes/executar')
    await executarRun('run1')
    vi.setSystemTime(new Date('2026-11-16T11:00:00.000Z')) // 08:00
    expect(await executarRun('run1')).toBe('ok')
    expect(mandarMensagem).toHaveBeenCalledTimes(1)
  })

  it.each(['COMPLETED', 'CANCELLED', 'NO_SHOW'])('o agendamento que virou %s durante o silêncio: não sai', async (status) => {
    montar()
    vi.setSystemTime(new Date('2026-11-16T09:27:00.000Z'))
    const { executarRun } = await import('@/lib/automacoes/executar')
    await executarRun('run1')
    banco.appointments![0]!.status = status
    vi.setSystemTime(new Date('2026-11-16T11:00:00.000Z'))
    expect(await executarRun('run1')).toBe('ok')
    expect(mandarMensagem).not.toHaveBeenCalled()
    expect(String((ultimoPasso().resumo as Linha).motivo)).toMatch(/Se ainda está de pé/)
  })

  it('o horário que já passou durante o silêncio: não sai', async () => {
    montar('2026-11-16T10:30:00.000Z') // 07:30 em Brasília, ainda no silêncio
    vi.setSystemTime(new Date('2026-11-16T09:27:00.000Z'))
    const { executarRun } = await import('@/lib/automacoes/executar')
    await executarRun('run1')
    vi.setSystemTime(new Date('2026-11-16T11:00:00.000Z'))
    expect(await executarRun('run1')).toBe('ok')
    expect(mandarMensagem).not.toHaveBeenCalled()
    expect(String((ultimoPasso().resumo as Linha).motivo)).toMatch(/já passou/)
  })
})
