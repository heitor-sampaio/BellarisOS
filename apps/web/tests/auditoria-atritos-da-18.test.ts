import { describe, it, expect, vi } from 'vitest'
import type { TenantContext } from '@estetica-os/types'
import type { NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'

vi.setConfig({ testTimeout: 30_000 })

/**
 * A30, A31, A32 e A33 da 18ª simulação (2026-11-16), a Auditoria.
 *
 * A30 [3]: "Editou o membro da equipe Dra. Yasmin Prado (comissao venda pct)"
 * — o campo cru. A trava: toda coluna de users, commissions, commission_payouts
 * e appointments tem nome no `CAMPO` (as colunas abaixo são as do banco em
 * 2026-11-16; a lista das tabelas auditadas inteira não se lê sem o banco — as
 * tabelas de base não nasceram nas migrations).
 * A31 [3]: o cancelamento saía "Editou o agendamento — Sônia Prado (motivo do
 * cancelamento, cancelamento e situação)".
 * A32 [3]: quem tem unidades não via o que ELA MESMA gravou sem unidade (a
 * oportunidade, o contato); "Abriu o prontuário" em Derby saía sem unidade.
 * A33 [3]: no CSV, o pagamento de uma comissão saía em linhas iguais, sem
 * dizer de qual comissão.
 */

// A leitura da auditoria pelo cliente de serviço falso: guarda os filtros da consulta da auditoria.
const filtros: { metodo: string; args: unknown[] }[] = []
function construtor(tabela: string) {
  const q: Record<string, unknown> = {}
  const p: unknown = new Proxy(q, {
    get(_, prop: string) {
      if (prop === 'then') return (ok: (v: unknown) => void) => ok({ data: [], error: null })
      return (...args: unknown[]) => { if (tabela === 'auditoria') filtros.push({ metodo: prop, args }); return p }
    },
  })
  return p
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: construtor, rpc: () => construtor('rpc') }) }))
// D2 da 23ª: a leitura pede o fuso do recorte (cacheado: fora do Next, sem o cache).
vi.mock('@/lib/unidades/fuso-da-unidade', () => ({ fusoDoRecorte: async () => 'America/Sao_Paulo' }))

const sp = (s: string) => s.replace(/ /g, ' ')
let id = 5000
const r = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
  id: id--, criado_em: '2026-11-16T03:14:18.231Z', branch_id: 'bD', client_id: null, tabela: 'users', operacao: 'editou',
  registro_id: null, colunas: [], antes: {}, depois: {}, ator_user_id: 'u1', ator_nome: 'Marina', ator_tipo: 'membro',
  incompleto: false, ...x,
})
const nomes: NomesDaAuditoria = {
  clientes: { cS: 'Sônia Prado' }, membros: { uY: 'Dra. Yasmin Prado' }, unidades: { bD: 'Derby' },
  motivosDoCancelamento: { ap1: 'A profissional foi desativada' },
  comissoes: { co1: 'do atendimento de Sônia Prado (Limpeza de pele)', co2: 'da venda a Beatriz Lima' },
}

const COLUNAS_DO_BANCO: Record<string, string[]> = {
  users: ['branch_id', 'auth_id', 'name', 'email', 'phone', 'avatar_url', 'is_active', 'role_id', 'provides_services', 'horario', 'atende_em', 'comissao_venda_pct', 'registro_conselho', 'outras_unidades'],
  commissions: ['branch_id', 'professional_id', 'appointment_id', 'amount', 'type', 'rule_value', 'status', 'period_ref', 'paid_at', 'paid_by', 'line_id', 'kind', 'motivo', 'released_at', 'transaction_id', 'payout_id'],
  commission_payouts: ['branch_id', 'professional_id', 'inicio', 'fim', 'total', 'transaction_id', 'paid_at', 'paid_by', 'estornado_at', 'estornado_por', 'estorno_motivo', 'estorno_transaction_id'],
  appointments: ['branch_id', 'client_id', 'procedure_id', 'professional_id', 'room_id', 'status', 'source', 'scheduled_at', 'duration_min', 'price', 'notes', 'client_notes', 'cancellation_reason', 'cancelled_at', 'confirmed_at', 'started_at', 'completed_at', 'treatment_plan_id', 'client_rating', 'client_confirmed_at', 'procedure_rating', 'client_feedback', 'created_by_id', 'arrived_at', 'aconteceu_em', 'sem_preferencia'],
}

describe('A30: o campo da Auditoria em português', () => {
  it('"comissao_venda_pct" sai pelo nome', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    const f = fraseDaAuditoria(r({ registro_id: 'uY', colunas: ['comissao_venda_pct'] }), nomes)
    expect(f).toBe('Editou o membro da equipe Dra. Yasmin Prado (percentual da comissão de venda)')
  })
  it('a trava: toda coluna de users, commissions, commission_payouts e appointments tem nome', async () => {
    const { CAMPO_DA_AUDITORIA } = await import('@/lib/auditoria/frase')
    const sem = Object.entries(COLUNAS_DO_BANCO).flatMap(([t, cs]) => cs.filter(c => !CAMPO_DA_AUDITORIA[c]).map(c => `${t}.${c}`))
    expect(sem).toEqual([])
  })
})

describe('A31: o cancelamento diz que cancelou, e o motivo', () => {
  it('"Cancelou o agendamento de Sônia Prado (motivo: …)"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const cancelou = r({ tabela: 'appointments', registro_id: 'ap1', client_id: 'cS', colunas: ['cancellation_reason', 'cancelled_at', 'status'], antes: { status: 'SCHEDULED' }, depois: { status: 'CANCELLED' } })
    expect(sp(fraseDoGrupo([cancelou], nomes))).toBe('Cancelou o agendamento de Sônia Prado (motivo: A profissional foi desativada)')
  })
  it('sem o motivo lido, só o fato', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const cancelou = r({ tabela: 'appointments', registro_id: 'ap2', client_id: 'cS', colunas: ['cancelled_at', 'status'], antes: { status: 'CONFIRMED' }, depois: { status: 'CANCELLED' } })
    expect(sp(fraseDoGrupo([cancelou], nomes))).toBe('Cancelou o agendamento de Sônia Prado')
  })
})

describe('A33: a linha do pagamento da comissão diz de qual comissão', () => {
  it('cada linha do CSV diz o atendimento ou a venda', async () => {
    const { linhasDoCsvDaAuditoria } = await import('@/lib/auditoria/frase')
    const paga = { colunas: ['paid_at', 'paid_by', 'payout_id', 'status'], antes: { status: 'OPEN' }, depois: { status: 'PAID' } }
    const linhas = linhasDoCsvDaAuditoria([
      r({ tabela: 'commissions', registro_id: 'co1', ...paga }),
      r({ tabela: 'commissions', registro_id: 'co2', ...paga }),
      r({ tabela: 'commission_payouts', operacao: 'criou', registro_id: 'po1' }),
    ], nomes)
    const ditas = linhas.filter(l => l.oQue.includes('comissão ')).map(l => sp(l.oQue))
    expect(ditas).toContain('Marcou como paga a comissão do atendimento de Sônia Prado (Limpeza de pele)')
    expect(ditas).toContain('Marcou como paga a comissão da venda a Beatriz Lima')
  })
})

// A Auditoria é só da Admin da rede (2026-11-16): o contexto que lê a tem. O
// recorte por unidade segue como segunda parede (a Admin da rede tem a rede inteira).
const daAdmin = { isNetworkAdmin: true, permissions: { audit: 'MANAGE' } }
function ctxDeUnidades(): TenantContext {
  return { ...daAdmin, tenantId: 't1', branchId: 'bD', unidades: ['bD', 'bC'], internalUserId: 'u1' } as unknown as TenantContext
}

describe('A32: quem tem unidades vê o que ela mesma gravou sem unidade; o prontuário aberto leva a unidade', () => {
  // A regra mudou em 2026-11-16: a abertura do prontuário não sai mais do recorte (quem lê é a Admin da rede).
  it('a leitura de quem tem unidades: as linhas das unidades dela OU as sem unidade gravadas por ela', async () => {
    filtros.length = 0
    const { lerAuditoria } = await import('@/lib/auditoria/leitura')
    await lerAuditoria(ctxDeUnidades(), { period: 'month' }, { porGravacao: true })
    const or = filtros.find(f => f.metodo === 'or')
    expect(or?.args[0]).toBe('branch_id.in.(bD,bC),and(branch_id.is.null,ator_user_id.eq.u1)')
    expect(filtros.some(f => f.metodo === 'in' && f.args[0] === 'branch_id')).toBe(false)
    expect(filtros.some(f => f.metodo === 'neq' && f.args[1] === 'abriu')).toBe(false)
  })

  it('quem é da rede lê tudo, sem o recorte', async () => {
    filtros.length = 0
    const { lerAuditoria } = await import('@/lib/auditoria/leitura')
    await lerAuditoria({ ...daAdmin, tenantId: 't1', branchId: null, unidades: null, internalUserId: 'u9' } as unknown as TenantContext, { period: 'month' }, { porGravacao: true })
    expect(filtros.some(f => f.metodo === 'or' || f.metodo === 'neq')).toBe(false)
  })

  it('a unidade do acesso ao prontuário é a do endereço (dentro do alcance); sem ela, a do contexto', async () => {
    const { unidadeDoAcessoAoProntuario } = await import('@/lib/prontuario/unidade-do-acesso')
    const unidades = [{ id: 'bD', slug: 'derby' }, { id: 'bC', slug: 'casa-forte' }, { id: 'bB', slug: 'boa-viagem' }]
    const daRede = { branchId: null, unidades: null } as unknown as TenantContext
    expect(unidadeDoAcessoAoProntuario(daRede, 'GET /derby/clients/x', unidades)).toBe('bD')
    expect(unidadeDoAcessoAoProntuario(daRede, 'GET /admin/clients/x', unidades)).toBeNull()
    expect(unidadeDoAcessoAoProntuario(ctxDeUnidades(), 'POST /casa-forte/agenda/y', unidades)).toBe('bC')
    // Fora do alcance (não chega a abrir), fica a do contexto.
    expect(unidadeDoAcessoAoProntuario(ctxDeUnidades(), 'GET /boa-viagem/clients/x', unidades)).toBe('bD')
    expect(unidadeDoAcessoAoProntuario(ctxDeUnidades(), '', unidades)).toBe('bD')
  })
})
