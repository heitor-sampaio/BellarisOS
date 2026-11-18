import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * O Copilot pergunta das automações ao mover o cartão (A35 da 22ª; o Heitor:
 * "se mover os cards manualmente dispararia automacoes, perguntar se deseja
 * disparar ou nao", e "Também ao arrastar um"). O Copilot move a pedido da
 * pessoa: o cartão de confirmação diz quais automações o movimento dispara e
 * dá "Disparar" ou "Não disparar". A régua é a da tela
 * (`automacoesQueOMovimentoDispara`, `gatilhoCasa`).
 */

let automacoes: string[] = []
const movidos: { leadId: string; stageId: string; opcoes: unknown }[] = []

vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/auth', () => ({ can: () => true, isOwnScope: () => false, ownerFilter: () => null, temRecurso: () => true }))
vi.mock('@/lib/crm/alcance', () => ({ leadAoAlcance: async () => true }))
vi.mock('@/lib/crm/automacoes-do-movimento', () => ({
  COLUNAS_DO_CARD_PARA_PREVER: 'id, crm_stage_id',
  automacoesQueOMovimentoDispara: vi.fn(async () => automacoes),
}))
vi.mock('@/lib/crm/oportunidade', () => ({
  criarOportunidadeCore: vi.fn(),
  moverEtapaCore: vi.fn(async (_a: unknown, _c: unknown, leadId: string, stageId: string, opcoes: unknown) => {
    movidos.push({ leadId, stageId, opcoes }); return { ok: true }
  }),
}))

function admin() {
  const from = (tabela: string) => {
    const b: Record<string, unknown> = {}
    let unico = false
    for (const op of ['select', 'eq', 'order', 'in']) b[op] = () => b
    b.single = () => { unico = true; return b }
    b.maybeSingle = () => { unico = true; return b }
    b.then = (ok: (r: unknown) => unknown) => {
      let data: unknown = null
      if (tabela === 'leads') data = { id: 'l1', name: 'Ana', crm_stage_id: 'e1' }
      if (tabela === 'crm_stages') data = unico ? { id: 'e1', name: 'Em contato', funnel_id: 'f1' } : [{ id: 'e1', name: 'Em contato' }, { id: 'e2', name: 'Proposta' }]
      return Promise.resolve({ data, error: null }).then(ok)
    }
    return b
  }
  return { from }
}

const c = () => ({
  ctx: { tenantId: 't1', internalUserId: 'u1', userName: 'Bia (via Copilot)', permissions: { crm: 'MANAGE' } },
  admin: admin(), pagina: '/admin/oportunidades', slugDoPortal: null,
}) as never

const LEAD = '11111111-1111-4111-8111-111111111111'

beforeEach(() => { automacoes = []; movidos.length = 0 })

describe('mover_etapa do Copilot e as automações', () => {
  it('sem automação que dispare, o cartão é o de sempre', async () => {
    const { moverEtapa } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    const p = await moverEtapa.preparar(c(), { oportunidade: LEAD, etapa: 'Proposta' })
    expect('resumo' in p && p.resumo.escolhas).toBeFalsy()
  })

  it('com automação, o cartão diz qual e pergunta: Disparar ou Não disparar', async () => {
    automacoes = ['Boas-vindas da proposta']
    const { moverEtapa } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    const p = await moverEtapa.preparar(c(), { oportunidade: LEAD, etapa: 'Proposta' })
    if (!('resumo' in p)) throw new Error('não preparou')
    expect(p.resumo.aviso).toBe('Mover dispara a automação “Boas-vindas da proposta”. Disparar?')
    expect(p.resumo.escolhas?.map(e => e.rotulo)).toEqual(['Disparar', 'Não disparar'])
  })

  it('"Não disparar" move sem mandar o fato ao motor; "Disparar" manda', async () => {
    automacoes = ['Boas-vindas da proposta']
    const { moverEtapa } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    const p = await moverEtapa.preparar(c(), { oportunidade: LEAD, etapa: 'Proposta' })
    if (!('payload' in p)) throw new Error('não preparou')
    await moverEtapa.efetivar(c(), p.payload, 'nao-disparar')
    await moverEtapa.efetivar(c(), p.payload, 'disparar')
    expect(movidos.map(m => (m.opcoes as { semDespachar?: boolean })?.semDespachar)).toEqual([true, false])
  })

  it('sem a escolha, não move', async () => {
    automacoes = ['Boas-vindas da proposta']
    const { moverEtapa } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    const p = await moverEtapa.preparar(c(), { oportunidade: LEAD, etapa: 'Proposta' })
    if (!('payload' in p)) throw new Error('não preparou')
    const r = await moverEtapa.efetivar(c(), p.payload)
    expect('erro' in r).toBe(true)
    expect(movidos).toEqual([])
  })
})
