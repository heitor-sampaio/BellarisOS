import { describe, it, expect, vi, beforeEach } from 'vitest'
import { avaliarRegra, avaliarGrupo } from '@/lib/automacoes/condicoes'

/**
 * D3 da 16ª simulação (2026-11-15; princípio 3). O lembrete do agendamento
 * chegou à cliente como "Passando para lembrar do seu horário de  em .": a
 * hidratação do agendamento pedia `users(name)`, que é AMBÍGUO (appointments
 * tem `professional_id` e `created_by_id` para `users` — PGRST201), e o catch
 * zerava o agendamento. Pior: o "Se ainda está de pé" (`agendamento.status`
 * "não é nenhum de" Cancelado, Não compareceu, Concluído) dava VERDADEIRO com
 * o status nulo, e o lembrete saía também para o agendamento cancelado.
 *
 * - a hidratação nomeia a chave (`users!appointments_professional_id_fkey`);
 * - a entidade que NÃO CARREGOU faz o passo falhar (o erro fica na execução),
 *   em vez de seguir com ela nula;
 * - a regra sobre uma entidade ausente falha FECHADA: só "está vazio" é
 *   verdade — "não é", "não contém" e "não é nenhum de" não passam.
 */

type Resultado = { data: unknown; error: { message: string; code?: string } | null }
interface Pedido { tabela: string; ops: { op: string; args: unknown[] }[] }

const pedidos: Pedido[] = []
let responder: (p: Pedido) => Resultado = () => ({ data: null, error: null })

function construtor(tabela: string) {
  const p: Pedido = { tabela, ops: [] }
  pedidos.push(p)
  const b: Record<string, unknown> = {}
  for (const op of ['select', 'eq', 'in', 'order', 'limit', 'maybeSingle', 'single']) {
    b[op] = (...args: unknown[]) => { p.ops.push({ op, args }); return b }
  }
  b.then = (ok: (r: Resultado) => unknown, falhou?: (e: unknown) => unknown) => {
    try { return Promise.resolve(responder(p)).then(ok, falhou) } catch (e) { return Promise.reject(e).then(ok, falhou) }
  }
  return b
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: construtor }) }))
vi.mock('@/lib/unidades/fuso-da-unidade', () => ({
  fusoDaUnidade: async () => 'America/Sao_Paulo', fusoDaRede: async () => 'America/Sao_Paulo',
}))

const evento = {
  id: 'ev', nome: 'agendamento.criado', entidade: 'agendamento', entidadeId: 'ag1',
  dados: { agendamentoId: 'ag1', clienteId: 'cl1' }, atorNome: null, atorTipo: 'membro', origem: 'app',
  ocorridoEm: '2026-11-15T12:00:00.000Z', branchId: null,
}

/** O PostgREST de verdade: `users(name)` em appointments é ambíguo. */
function postgrestDeAgendamentos(p: Pedido): Resultado {
  const select = String(p.ops.find(o => o.op === 'select')?.args[0] ?? '')
  if (p.tabela === 'appointments' && /(^|[ ,])users\(/.test(select)) {
    return { data: null, error: { code: 'PGRST201', message: "Could not embed because more than one relationship was found for 'appointments' and 'users'" } }
  }
  return {
    data: {
      id: 'ag1', scheduled_at: '2026-11-16T13:00:00.000Z', status: 'SCHEDULED', price: 320, client_id: 'cl1', branch_id: 'b1',
      professional_id: 'u1', procedures: { name: 'Peeling' }, users: { name: 'Dra. Lara' },
    },
    error: null,
  }
}

const SE_AINDA_ESTA_DE_PE = { campo: 'agendamento.status', operador: 'nao_em' as const, valor: 'CANCELLED,NO_SHOW,COMPLETED' }

describe('D3: a hidratação do agendamento', () => {
  beforeEach(() => { pedidos.length = 0; responder = postgrestDeAgendamentos })

  it('traz o procedimento, a data e a profissional (a chave da profissional nomeada, sem PGRST201)', async () => {
    const { hidratar } = await import('@/lib/automacoes/contexto')
    const ctx: Record<string, unknown> = {}
    await hidratar(ctx, evento, 't1', 'agendamento')
    expect(ctx.agendamento).toMatchObject({ procedimento: 'Peeling', data: '2026-11-16T13:00:00.000Z', profissional: 'Dra. Lara', status: 'SCHEDULED' })
  })

  it('a entidade que não carrega faz o passo FALHAR (o erro vai à execução), em vez de seguir nula', async () => {
    responder = () => ({ data: null, error: { message: 'canceling statement due to statement timeout' } })
    const { hidratar } = await import('@/lib/automacoes/contexto')
    const ctx: Record<string, unknown> = {}
    await expect(hidratar(ctx, evento, 't1', 'agendamento')).rejects.toThrow(/agendamento/i)
    expect('agendamento' in ctx, 'nada fica gravado: a próxima tentativa busca de novo').toBe(false)
  })

  it('o agendamento do fato que sumiu também falha (não segue com o status nulo)', async () => {
    responder = () => ({ data: null, error: null })
    const { hidratar } = await import('@/lib/automacoes/contexto')
    await expect(hidratar({}, evento, 't1', 'agendamento')).rejects.toThrow(/agendamento/i)
  })

  it('o fato sem agendamento continua sem ele (nulo, sem erro)', async () => {
    const { hidratar } = await import('@/lib/automacoes/contexto')
    const ctx: Record<string, unknown> = {}
    await hidratar(ctx, { ...evento, entidade: 'cliente', entidadeId: 'cl1', dados: { clienteId: 'cl1' } }, 't1', 'agendamento')
    expect(ctx.agendamento).toBeNull()
  })
})

describe('D3: a regra sobre uma entidade ausente falha fechada', () => {
  it('"Se ainda está de pé" com o agendamento nulo NÃO passa', () => {
    expect(avaliarRegra({ agendamento: null }, SE_AINDA_ESTA_DE_PE)).toBe(false)
    expect(avaliarRegra({}, SE_AINDA_ESTA_DE_PE)).toBe(false)
    expect(avaliarGrupo({ agendamento: null }, { juncao: 'e', regras: [SE_AINDA_ESTA_DE_PE] })).toBe(false)
  })

  it('com o agendamento carregado, decide pela situação', () => {
    expect(avaliarRegra({ agendamento: { status: 'SCHEDULED' } }, SE_AINDA_ESTA_DE_PE)).toBe(true)
    expect(avaliarRegra({ agendamento: { status: 'CANCELLED' } }, SE_AINDA_ESTA_DE_PE)).toBe(false)
  })

  it('"não é" e "não contém" sobre a entidade ausente também não passam; "está vazio" é verdade', () => {
    expect(avaliarRegra({ cliente: null }, { campo: 'cliente.email', operador: 'diferente', valor: 'a@b.c' })).toBe(false)
    expect(avaliarRegra({ cliente: null }, { campo: 'cliente.nome', operador: 'nao_contem', valor: 'Ana' })).toBe(false)
    expect(avaliarRegra({ cliente: null }, { campo: 'cliente.email', operador: 'vazio' })).toBe(true)
    expect(avaliarRegra({ cliente: null }, { campo: 'cliente.email', operador: 'preenchido' })).toBe(false)
  })

  it('o campo vazio de uma entidade CARREGADA segue como antes ("não é" passa)', () => {
    expect(avaliarRegra({ cliente: { email: null } }, { campo: 'cliente.email', operador: 'diferente', valor: 'a@b.c' })).toBe(true)
    expect(avaliarRegra({ evento: { nome: 'x' } }, { campo: 'evento.dados.status', operador: 'nao_em', valor: 'A' })).toBe(true)
  })
})
