import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TenantContext, ResolvedPermissions } from '@estetica-os/types'
import { NO_PERMISSIONS } from '@/lib/permissions'
import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'

/**
 * As regras do Copilot do catálogo (docs/catalogo/copilot.md), na revisão de 24/11:
 * - CY-02: o Copilot não vende nem recebe — nem a comanda, nem a parcela do
 *   crediário (a parcela se recebe no PDV, CR-06): manda ao PDV, com o link.
 * - CY-04: a comissão de cada pessoa é de quem tem o Financeiro em Gerenciar
 *   (CM-04); só a configuração das comissões é da Admin da rede (CM-03).
 * - Q03: o Copilot responde pela Minha agenda e pelas Minhas comissões de quem
 *   só tem a vista pessoal — só leitura, só as dela.
 */

const unidades = vi.hoisted(() => [{ id: 'b1', name: 'Centro' }])
vi.mock('@/lib/cached-queries', async orig => ({
  ...(await orig<typeof import('@/lib/cached-queries')>()),
  getCachedNetworkBranches: async () => unidades,
}))
vi.mock('@/lib/unidades/fuso-da-unidade', async orig => ({
  ...(await orig<typeof import('@/lib/unidades/fuso-da-unidade')>()),
  fusoDaUnidade: async () => 'America/Sao_Paulo',
  fusoDaRede: async () => 'America/Sao_Paulo',
}))
const resumo = vi.hoisted(() => vi.fn())
vi.mock('@/lib/comissoes/leitura', async orig => ({
  ...(await orig<typeof import('@/lib/comissoes/leitura')>()),
  configDeComissaoDaRede: async () => ({ periodo: 'MENSAL' }),
  resumoDasComissoes: resumo,
}))
vi.mock('@/lib/unidades/da-tela', async orig => ({
  ...(await orig<typeof import('@/lib/unidades/da-tela')>()),
  unidadesParaLer: async () => [{ id: 'b1', name: 'Centro', ativa: true }, { id: 'b2', name: 'Praia', ativa: true }],
}))

const RAIZ = join(__dirname, '..')
const fonte = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8')
const TODAS = FUNCIONALIDADES.map(f => f.chave)
const UUID_TX = '11111111-1111-4111-8111-111111111111'

function ctx(permissions: Partial<ResolvedPermissions>, over: Partial<TenantContext> = {}): TenantContext {
  return {
    userId: 'auth', internalUserId: 'u1', userName: 'Tânia (via Copilot)', roleLabel: 'Coordenação',
    tenantId: 't1', branchId: null, role: 'RECEPTIONIST', roleId: 'r1', clientId: null,
    permissions: { ...NO_PERMISSIONS, copilot: 'VIEW', ...permissions } as ResolvedPermissions,
    reportTabs: [], providesServices: false, isNetworkAdmin: false, isClient: false,
    plano: { funcionalidades: TODAS, limites: { unidades: null, membros: null, whatsapp: null } },
    ...over,
  } as TenantContext
}
const extras = { rede: 'Camélia', unidade: null, pagina: '/admin/financeiro', slugDoPortal: null, fuso: 'America/Sao_Paulo' }

/** Um cliente de serviço falso: toda consulta devolve o que `porTabela` diz. */
function adminFalso(porTabela: Record<string, unknown>, filtros: [string, string, unknown][] = []) {
  return {
    from(tabela: string) {
      const dados = porTabela[tabela] ?? []
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'in', 'gte', 'lte', 'order', 'limit', 'neq', 'is', 'or']) b[m] = () => b
      b.eq = (col: string, v: unknown) => { filtros.push([tabela, col, v]); return b }
      b.maybeSingle = () => Promise.resolve({ data: dados, error: null })
      b.then = (ok: (r: unknown) => unknown, erro: (e: unknown) => unknown) => Promise.resolve({ data: dados, error: null }).then(ok, erro)
      return b
    },
  }
}

const LANCAMENTO = {
  id: UUID_TX, branch_id: 'b1', type: 'INCOME', description: 'Pacote Glow — parcela 2/3', category: 'Pacote', amount: 300,
  due_date: '2026-12-10', is_paid: false, notes: null, client_id: 'c1', payment_method: null, branches: { tenant_id: 't1' },
  appointment_id: null, parcela_total: null, parcela_grupo: null,
  client_package_id: null, procedure_sale_id: null, product_sale_id: null, credito_vendido_id: null, treatment_plan_id: null,
}

describe('CY-02: o Copilot não recebe a parcela do crediário — manda ao PDV, com o link', () => {
  const c = (linha: Record<string, unknown>) => ({
    ctx: ctx({ cashier: 'MANAGE' }), admin: adminFalso({ financial_transactions: linha }) as never,
    pagina: '/admin/financeiro', slugDoPortal: null,
  })

  it('a parcela do crediário de uma venda: o marcar_pago recusa e dá o link do PDV da cliente', async () => {
    const { marcarPago } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    const r = await marcarPago.preparar(c({ ...LANCAMENTO, parcela_total: 3, parcela_grupo: 'g1', client_package_id: 'p1' }), { lancamento: UUID_TX, forma: 'pix' })
    expect(r).toEqual({ erro: expect.stringContaining('PDV') })
    expect((r as { erro: string }).erro).toContain('/admin/pdv?unidade=b1&nova=1&cliente=c1')
  }, 60_000)

  it('o a receber do atendimento também é do PDV', async () => {
    const { marcarPago } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    const r = await marcarPago.preparar(c({ ...LANCAMENTO, appointment_id: 'a1', notes: 'Atendimento — a receber' }), { lancamento: UUID_TX, forma: 'pix' })
    expect((r as { erro?: string }).erro).toMatch(/PDV/)
  })

  it('a receita avulsa lançada no Financeiro segue com a baixa (pede a forma, como a tela)', async () => {
    const { marcarPago } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    const r = await marcarPago.preparar(c(LANCAMENTO), { lancamento: UUID_TX })
    expect((r as { erro: string }).erro).toMatch(/Pergunte como foi pago/)
    expect((r as { erro: string }).erro).not.toMatch(/PDV/)
  })

  it('o prompt manda ao PDV a parcela do crediário, e a baixa do marcar_pago é só do lançamento avulso', async () => {
    const { instrucoesDoCopilot } = await import('@/lib/copilot/prompt')
    const linhas = instrucoesDoCopilot(ctx({ cashier: 'MANAGE' }), extras).split('\n')
    const doMarcarPago = linhas.filter(l => l.includes('marcar_pago'))
    expect(doMarcarPago.length).toBeGreaterThan(0)
    for (const l of doMarcarPago) expect(l).not.toMatch(/parcela do crediário/)
    expect(linhas.some(l => /parcela do crediário/.test(l) && /PDV/.test(l) && /não (vende nem )?recebe/.test(l))).toBe(true)
  })

  it('a descrição do marcar_pago diz que a parcela do crediário e o a receber de venda são do PDV', async () => {
    const { marcarPago } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    expect(marcarPago.descricao).toMatch(/parcela do crediário[^.]*PDV/)
  })
})

describe('CY-04: quem muda a comissão de cada pessoa é o Financeiro em Gerenciar; a configuração, a Admin da rede', () => {
  it('o prompt separa as duas e diz os nomes de cada uma', async () => {
    const { instrucoesDoCopilot } = await import('@/lib/copilot/prompt')
    const p = instrucoesDoCopilot(ctx({ financial: 'VIEW' }), {
      ...extras, quemMudaAsComissoes: ['Ana Lima'], quemMudaAComissaoDasPessoas: ['Carla Reis', 'Ana Lima'],
    })
    expect(p).not.toMatch(/as comissões, por exemplo, pedem Financeiro e comissões em Gerenciar e são só da Admin da rede/)
    // "Financeiro e comissões" é o nome do módulo na tela de Cargos (MODULE_LABELS).
    expect(p).toMatch(/comissão de cada pessoa[^\n]*Financeiro e comissões em Gerenciar/)
    expect(p).toMatch(/configuração das comissões[^\n]*só da Admin da rede/)
    expect(p).toMatch(/comissão de cada pessoa[^\n]*Carla Reis, Ana Lima/)
    expect(p).toMatch(/configuração das comissões[^\n]*Ana Lima/)
  })

  it('a rota lê quem tem o Financeiro em Gerenciar para quem não o tem, e as Admins para quem não é a Admin', () => {
    const rota = fonte('app/api/copilot/route.ts')
    expect(rota).toMatch(/quemMudaAComissaoDasPessoas/)
    expect(rota).toMatch(/can\(ctx, 'financial', 'MANAGE'\) \? undefined/)
    expect(rota).toMatch(/mexeNaConfigDaRede\(ctx\) \? undefined/)
  })
})

describe('Q03: a Minha agenda e as Minhas comissões pelo Copilot — só leitura, só as dela', () => {
  beforeEach(() => resumo.mockReset())
  const quemAtende = ctx({}, { providesServices: true, atendeEm: ['b1'], branchId: null })

  it('minha_agenda lê só os agendamentos dela (professional_id = ela), sem filtro de outra pessoa', async () => {
    const { minhaAgenda } = await import('@/lib/copilot/ferramentas/agenda')
    expect(Object.keys((minhaAgenda.parametros as unknown as { shape: object }).shape)).not.toContain('profissional')
    const filtros: [string, string, unknown][] = []
    const admin = adminFalso({
      appointments: [{ id: 'a1', scheduled_at: '2026-11-25T13:00:00Z', duration_min: 60, status: 'SCHEDULED', branch_id: 'b1', client_id: 'c1', procedure_id: 'p1', professional_id: 'u1' }],
      clients: [{ id: 'c1', name: 'Bia' }], procedures: [{ id: 'p1', name: 'Limpeza' }], branches: [{ id: 'b1', name: 'Centro' }],
    }, filtros)
    const r = await minhaAgenda.executar({ ctx: quemAtende, admin: admin as never, pagina: '/admin/dashboard', slugDoPortal: null }, {})
    expect(filtros).toContainEqual(['appointments', 'professional_id', 'u1'])
    expect((r.dados as { agendamentos: { cliente: string }[] }).agendamentos[0]).toMatchObject({ cliente: 'Bia', procedimento: 'Limpeza' })
  }, 60_000)

  it('minhas_comissoes lê o resumo só dela, nas unidades dela, e devolve os totais', async () => {
    resumo.mockResolvedValue([
      { professionalId: 'u1', professionalName: 'Tânia', branchId: 'b1', branchName: 'Centro', liberado: 100, aPagar: 80, pago: 20, aguardando: 10 },
    ])
    const { minhasComissoes } = await import('@/lib/copilot/ferramentas/comissoes')
    const r = await minhasComissoes.executar({ ctx: quemAtende, admin: adminFalso({}) as never, pagina: '/admin/dashboard', slugDoPortal: null }, {})
    expect(resumo).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't1', profissionalId: 'u1', branchIds: ['b1', 'b2'] }))
    // O formato do dinheiro separa "R$" com o espaço fixo (toLocaleString).
    const d = JSON.parse(JSON.stringify(r.dados).replace(/ /g, ' '))
    expect(d).toMatchObject({ liberado: 'R$ 100,00', aPagar: 'R$ 80,00', pago: 'R$ 20,00', aguardando: 'R$ 10,00' })
    expect(JSON.stringify(r.dados)).toContain('/admin/financeiro/comissoes?periodo=')
  }, 60_000)

  it('o prompt diz a quem só tem a vista que a agenda e a comissão DELA vêm dessas ferramentas', async () => {
    const { instrucoesDoCopilot } = await import('@/lib/copilot/prompt')
    const p = instrucoesDoCopilot(quemAtende, extras)
    expect(p).toMatch(/Minha agenda[^\n]*minha_agenda/)
    expect(p).toMatch(/Minhas comissões[^\n]*minhas_comissoes/)
  })
})
