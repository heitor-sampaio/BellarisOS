import { test, expect, type Browser } from '@playwright/test'
import { banco, tenantId, filiaisAtivas, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste, type Permissao } from './apoio/sessao'
import { chamarAcao } from './apoio/acao-direta'
import { apagarClientes } from './apoio/limpeza'

/**
 * Cada action barra quem não tem o módulo — CHAMADA DIRETAMENTE, sem a tela.
 *
 * Os testes de portal provam que a TELA não abre. Mas todo export de
 * `'use server'` é endpoint público: quem não vê o botão pode chamar a action
 * pelo id. O que protege de verdade é o `assertPermission` dentro dela, e até
 * 2026-09-27 isso só era exercitado em inbox e CRM.
 *
 * Uma matriz: para cada módulo, uma action que ESCREVE, chamada por dois
 * membros — um sem módulo nenhum e um que só VÊ tudo (as actions pedem
 * MANAGE). O que se confere é o BANCO: o registro alvo tem de continuar como
 * estava. O controle é o admin fazendo uma das chamadas e ela gravando — sem
 * ele, "nada mudou" poderia ser só a chamada direta que não funciona.
 */

const marca = Date.now().toString(36)
const SO_VER: Permissao[] = (['agenda', 'clients', 'medical_records', 'procedures', 'stock', 'financial', 'cashier',
  'crm', 'marketing', 'team', 'forms', 'roles', 'settings', 'automations'] as const).map(modulo => ({ modulo, nivel: 'VIEW' }))

interface Fx {
  unidade: { id: string; slug: string }
  procedimento: string; cliente: string; agendamento: string; lancamento: string
  produto: string; lead: string; contato: string | null; plano: string; cargo: string
  unidadeTeste: string; automacao: string; caixa: string; alvo: MembroDeTeste
}

interface Caso {
  nome: string
  arquivo: string
  funcao: string
  rota: (f: Fx) => string
  args: (f: Fx) => unknown[]
  /** Lê o estado que a action mudaria; tem de ser o mesmo antes e depois. */
  estado: (f: Fx) => Promise<unknown>
  /** Só VIEW já basta para esta action — o membro "só ver" não é recusado. */
  bastaVer?: boolean
  /** Motivo para o admin NÃO repetir a chamada no fim (o controle do caso). */
  semControle?: string
}

const db = () => banco()
const campo = async (tabela: string, coluna: string, id: string) =>
  ((await db().from(tabela).select(coluna).eq('id', id).single()).data as Record<string, unknown> | null)?.[coluna]

const CASOS: Caso[] = [
  { nome: 'procedimentos: desativar', arquivo: 'actions/procedures.ts', funcao: 'toggleProcedureStatus',
    rota: () => '/admin/procedures', args: f => [f.procedimento, false], estado: f => campo('procedures', 'is_active', f.procedimento) },
  { nome: 'equipe: desativar membro', arquivo: 'actions/team.ts', funcao: 'deactivateTeamMember',
    rota: () => '/admin/team', args: f => [f.alvo.userId, '/admin/team'], estado: f => campo('users', 'is_active', f.alvo.userId) },
  { nome: 'automações: mudar status', arquivo: 'actions/automacoes.ts', funcao: 'mudarStatusDaAutomacao',
    rota: f => `/admin/automacoes/${f.automacao}`, args: f => [f.automacao, 'PAUSADA'], estado: f => campo('automations', 'status', f.automacao) },
  { nome: 'marketing: criar campanha', arquivo: 'actions/notification-campaigns.ts', funcao: 'createCampaign',
    rota: () => '/admin/notificacoes/nova',
    args: () => [{ name: `${PREFIXO} campanha invasora ${marca}`, type: 'manual', title: 'x', body: 'x', notification_type: 'promo', audience_rules: {} }],
    estado: async () => (await db().from('notification_campaigns').select('id').eq('name', `${PREFIXO} campanha invasora ${marca}`)).data?.length },
  { nome: 'fichas: criar ficha', arquivo: 'actions/fichas.ts', funcao: 'criarFicha',
    rota: () => '/admin/settings?tab=fichas', args: () => [{ name: `${PREFIXO} ficha invasora ${marca}`, schema: { fields: [{ id: 'q', type: 'text', label: 'Pergunta' }] } }],
    estado: async () => (await db().from('forms').select('id').eq('name', `${PREFIXO} ficha invasora ${marca}`)).data?.length },
  { nome: 'documentos: criar modelo de termo', arquivo: 'actions/modelos-de-documento.ts', funcao: 'salvarModeloDoEditor',
    rota: () => '/admin/settings?tab=documentos',
    // O JSON do editor rico (a action não aceita mais a marcação em `texto`).
    args: () => [{ nome: `${PREFIXO} modelo invasor ${marca}`, tipo: 'TERMO', momento: 'AGENDAMENTO', exigencia: 'AVISA',
      documento: { corpo: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Termo de ' }, { type: 'variavel', attrs: { nome: 'cliente.nome' } }] }] } } }],
    estado: async () => (await db().from('document_templates').select('id').eq('name', `${PREFIXO} modelo invasor ${marca}`)).data?.length },
  { nome: 'clientes: desativar cliente', arquivo: 'actions/clients.ts', funcao: 'toggleClientStatus',
    rota: f => `/admin/clients/${f.cliente}`, args: f => [f.cliente, false, f.unidade.slug], estado: f => campo('clients', 'is_active', f.cliente) },
  { nome: 'configurações: número padrão', arquivo: 'actions/integrations.ts', funcao: 'definirNumeroPadrao',
    rota: () => '/admin/settings?tab=integrations', args: f => [f.caixa],
    semControle: 'tornar a caixa de teste padrão tiraria o padrão da caixa real da clínica', estado: f => campo('whatsapp_numbers', 'is_default', f.caixa) },
  { nome: 'configurações: desativar unidade', arquivo: 'actions/branches.ts', funcao: 'toggleBranchStatus',
    rota: f => `/admin/branches/${f.unidadeTeste}`, args: f => [f.unidadeTeste, false], estado: f => campo('branches', 'is_active', f.unidadeTeste) },
  { nome: 'agenda: cancelar agendamento', arquivo: 'actions/appointments.ts', funcao: 'updateAppointmentStatus', bastaVer: true,
    rota: () => '/admin/agenda', args: f => [f.agendamento, 'CANCELLED', f.unidade.slug, `${PREFIXO} invasão`],
    estado: f => campo('appointments', 'status', f.agendamento) },
  { nome: 'caixa: dar baixa num lançamento', arquivo: 'actions/financial.ts', funcao: 'markTransactionPaid',
    rota: () => '/admin/financeiro', args: f => [f.lancamento, f.unidade.slug], estado: f => campo('financial_transactions', 'is_paid', f.lancamento) },
  { nome: 'estoque: estoque mínimo', arquivo: 'actions/stock.ts', funcao: 'adminUpdateMinStock',
    rota: () => '/admin/estoque', args: f => [f.produto, f.unidade.id, 99],
    estado: async f => (await db().from('branch_product_stock').select('min_stock').eq('product_id', f.produto).eq('branch_id', f.unidade.id).single()).data?.min_stock },
  { nome: 'CRM: marcar oportunidade como ganha', arquivo: 'actions/inbox.ts', funcao: 'definirSituacaoOportunidade',
    rota: () => '/admin/inbox', args: f => [f.lead, 'WON'], estado: f => campo('leads', 'crm_stage_id', f.lead) },
  { nome: 'prontuário: editar o plano do cliente', arquivo: 'actions/treatment-plans.ts', funcao: 'salvarPlanoDoCliente',
    rota: f => `/admin/planejamentos/${f.plano}`, args: f => [f.plano, [], `${PREFIXO} invadido`], estado: f => campo('treatment_plans', 'professional_notes', f.plano) },
  { nome: 'cargos: apagar cargo', arquivo: 'actions/roles.ts', funcao: 'deleteRole',
    rota: () => '/admin/settings?tab=permissions', args: f => [f.cargo],
    estado: async f => (await db().from('tenant_roles').select('id').eq('id', f.cargo)).data?.length },
]

async function comoMembro(browser: Browser, m: MembroDeTeste) {
  const ctx = await browser.newContext({ storageState: m.estado })
  return { ctx, page: await ctx.newPage() }
}

test.describe.serial('permissões nas actions, chamadas direto', () => {
  let f: Fx | null = null
  let nada: MembroDeTeste | null = null
  let soVer: MembroDeTeste | null = null

  test.beforeAll(async () => {
    const b = db()
    const tenant = await tenantId()
    const unidade = (await filiaisAtivas())[0]!
    const ins = async (tabela: string, linha: Record<string, unknown>) => {
      const { data, error } = await b.from(tabela).insert(linha).select('id').single<{ id: string }>()
      expect(error, `criar ${tabela}`).toBeNull()
      return data!.id
    }
    const { data: prof } = await b.from('users').select('id').eq('tenant_id', tenant).eq('is_active', true).limit(1).single<{ id: string }>()
    const procedimento = await ins('procedures', { tenant_id: tenant, name: `${PREFIXO} Proc perm ${marca}`, category: 'e2e', duration_min: 10, price: 0, is_active: true })
    const cliente = await ins('clients', { tenant_id: tenant, branch_id: unidade.id, name: `${PREFIXO} Cliente perm ${marca}`, phone: '5548' + String(Date.now()).slice(-9), is_active: true })
    await b.from('loyalty_accounts').upsert({ client_id: cliente }, { onConflict: 'client_id' })
    const agendamento = await ins('appointments', { branch_id: unidade.id, client_id: cliente, procedure_id: procedimento, professional_id: prof!.id, scheduled_at: new Date(Date.now() + 86_400_000 * 40).toISOString(), duration_min: 10, price: 0, status: 'SCHEDULED' })
    const lancamento = await ins('financial_transactions', { branch_id: unidade.id, client_id: cliente, type: 'INCOME', category: 'Serviços', description: `${PREFIXO} perm pendente ${marca}`, amount: 10, is_paid: false, created_by: 'e2e' })
    const produto = await ins('products', { tenant_id: tenant, name: `${PREFIXO} Produto perm ${marca}`, unit: 'un' })
    await b.from('branch_product_stock').insert({ product_id: produto, branch_id: unidade.id, current_stock: 5, min_stock: 1 })
    const { data: etapa } = await b.from('crm_stages').select('id').eq('tenant_id', tenant).eq('outcome', 'OPEN').limit(1).single<{ id: string }>()
    const lead = await ins('leads', { tenant_id: tenant, name: `${PREFIXO} Lead perm ${marca}`, phone: '5548922220001', crm_stage_id: etapa!.id })
    const { data: l } = await b.from('leads').select('contato_id').eq('id', lead).single<{ contato_id: string | null }>()
    const plano = await ins('treatment_plans', { branch_id: unidade.id, professional_id: prof!.id, client_id: cliente, status: 'DRAFT', name: `${PREFIXO} Plano perm ${marca}`, professional_notes: 'original' })
    const cargo = await ins('tenant_roles', { tenant_id: tenant, key: `E2E_ALVO_${marca}`.toUpperCase(), label: `${PREFIXO} Cargo alvo ${marca}` })
    const unidadeTeste = await ins('branches', { tenant_id: tenant, name: `${PREFIXO} Unidade perm ${marca}`, slug: `e2e-perm-${marca}`, is_active: true })
    const automacao = await ins('automations', { tenant_id: tenant, nome: `${PREFIXO} Automação perm ${marca}` })
    const caixa = await ins('whatsapp_numbers', { tenant_id: tenant, provider: 'uazapi', label: `${PREFIXO} Caixa perm ${marca}`, is_active: true, config: { token: `e2e-perm-${marca}` } })
    const alvo = await criarMembro(`alvo${marca}`, { rotulo: 'Alvo', permissoes: [] })

    f = { unidade: { id: unidade.id, slug: unidade.slug }, procedimento, cliente, agendamento, lancamento, produto, lead,
      contato: l?.contato_id ?? null, plano, cargo, unidadeTeste, automacao, caixa, alvo }
    nada = await criarMembro(`nada${marca}`, { rotulo: 'Sem nada', permissoes: [] })
    soVer = await criarMembro(`ver${marca}`, { rotulo: 'Só ver', permissoes: SO_VER })
  })

  test.afterAll(async () => {
    const b = db()
    await nada?.limpar()
    await soVer?.limpar()
    if (!f) return
    await f.alvo.limpar()
    await b.from('lead_events').delete().eq('lead_id', f.lead)
    await b.from('leads').delete().eq('id', f.lead)
    if (f.contato) await b.from('contacts').delete().eq('id', f.contato)
    const falhas = await apagarClientes([f.cliente])
    await b.from('branch_product_stock').delete().eq('product_id', f.produto)
    await b.from('domain_events').delete().in('entidade_id', [f.produto, f.procedimento, f.automacao, f.caixa, f.cargo])
    await b.from('products').delete().eq('id', f.produto)
    await b.from('procedures').delete().eq('id', f.procedimento)
    await b.from('tenant_roles').delete().eq('id', f.cargo)
    await b.from('branches').delete().eq('id', f.unidadeTeste)
    await b.from('automations').delete().eq('id', f.automacao)
    await b.from('whatsapp_numbers').delete().eq('id', f.caixa)
    await b.from('notification_campaigns').delete().like('name', `${PREFIXO}%${marca}`)
    await b.from('forms').delete().like('name', `${PREFIXO}%${marca}`)
    const modelos = ((await b.from('document_templates').select('id').like('name', `${PREFIXO}%${marca}`)).data ?? []).map(m => m.id as string)
    if (modelos.length) {
      await b.from('document_template_versions').delete().in('template_id', modelos)
      await b.from('document_templates').delete().in('id', modelos)
    }
    expect(falhas).toEqual([])
  })

  test('o controle: o admin chamando direto grava', async ({ page }) => {
    const antes = await campo('procedures', 'is_active', f!.procedimento)
    await chamarAcao(page, 'actions/procedures.ts', 'toggleProcedureStatus', '/admin/procedures', [f!.procedimento, false])
    await expect.poll(() => campo('procedures', 'is_active', f!.procedimento), { message: 'a chamada direta funciona' }).toBe(false)
    // Devolve, para os casos seguintes partirem do estado original.
    await db().from('procedures').update({ is_active: antes }).eq('id', f!.procedimento)
  })

  for (const caso of CASOS) {
    test(`recusada sem permissão — ${caso.nome}`, async ({ browser, page }) => {
      // O admin abre a página antes: é o que compila a rota e põe o id da
      // action no manifesto do `next dev`.
      await page.goto(caso.rota(f!))

      const membros = caso.bastaVer ? [nada!] : [nada!, soVer!]
      for (const m of membros) {
        const antes = await caso.estado(f!)
        const { ctx, page: pm } = await comoMembro(browser, m)
        try {
          await chamarAcao(pm, caso.arquivo, caso.funcao, caso.rota(f!), caso.args(f!))
        } finally {
          await ctx.close()
        }
        expect.soft(await caso.estado(f!), `${caso.nome}: ${m === nada ? 'sem módulo' : 'só ver'} não pode mudar nada`).toEqual(antes)
      }

      // O controle: a MESMA chamada, pelo admin, grava. Sem isto, um
      // argumento no formato errado também "não mudaria nada" e o caso
      // passaria sem provar coisa alguma.
      if (caso.semControle) return
      const antes = await caso.estado(f!)
      await chamarAcao(page, caso.arquivo, caso.funcao, caso.rota(f!), caso.args(f!))
      await expect.poll(() => caso.estado(f!), { message: `${caso.nome}: o admin grava` }).not.toEqual(antes)
    })
  }
})
