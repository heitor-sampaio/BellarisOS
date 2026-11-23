import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste, type Permissao } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * D6 da simulação de 2026-10-29 (Clínica Lótus): a contadora — cargo
 * "Contadora", Financeiro VER/todos, SEM agenda — via no dashboard "Meu
 * faturamento", "Faturamento do mês R$ 0" e ticket "—", com R$ 1.759 no
 * Financeiro. O cargo tinha `agenda` NONE com `scope = OWN` (o editor guarda o
 * escopo esmaecido do módulo desligado), e `resolveScopes` o valia sem olhar o
 * nível: quem NÃO tem a agenda era tratada como "só os meus".
 *
 * O recorte não nasce de um módulo que a pessoa não tem. Sem o "só os meus"
 * (SM1/SM2, o Heitor, 2026-11-23), o único recorte pessoal é a vista pessoal
 * de quem ATENDE sem o módulo — a contadora não atende, e vê a unidade. E o
 * cargo não guarda mais escopo nenhum.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let daUnidade: MembroDeTeste | null = null
let daRede: MembroDeTeste | null = null
let slug = ''
const agora = new Date().toISOString()
// Várias conferências moles por tela: com a regressão, cada uma espera o seu tempo.
test.describe.configure({ timeout: 120_000 })

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** O cargo da contadora: o financeiro inteiro, e os módulos que ela NÃO tem. Ela não atende. */
const contadora: Permissao[] = [
  { modulo: 'financial',       nivel: 'VIEW' },
  { modulo: 'agenda',          nivel: 'NONE' },
  { modulo: 'medical_records', nivel: 'NONE' },
  { modulo: 'crm',             nivel: 'NONE' },
]

test.beforeAll(async () => {
  test.setTimeout(240_000)
  rede = await criarOutraRede(`esm${marca}`)
  // Um atendimento de R$ 300 de OUTRA profissional, pago: o faturamento da unidade.
  const c = await rede.criarCliente('Atendida')
  const { data: ag, error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: c, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 300, scheduled_at: agora, completed_at: agora,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const { error: eT } = await db().from('financial_transactions').insert([
    {
      branch_id: rede.branchId, client_id: c, appointment_id: ag!.id, type: 'INCOME', category: 'Serviços',
      description: `[e2e] pago ${marca}`, amount: 300, payment_method: 'PIX', is_paid: true, paid_at: agora, created_by: 'e2e',
    },
    {
      branch_id: rede.branchId, type: 'EXPENSE', category: 'Aluguel', description: `[e2e] aluguel ${marca}`,
      amount: 77, payment_method: 'PIX', is_paid: true, paid_at: agora, created_by: 'e2e',
    },
  ])
  expect(eT).toBeNull()

  daUnidade = await criarMembro(`esmu${marca}`, { tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Contadora', permissoes: contadora })
  daRede    = await criarMembro(`esmr${marca}`, { tenant: rede.tenantId, rotulo: 'Contadora', permissoes: contadora })
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
})

test.afterAll(async () => {
  if (rede) {
    await db().from('financial_transactions').delete().eq('branch_id', rede.branchId)
    await db().from('appointments').delete().eq('branch_id', rede.branchId)
  }
  await daUnidade?.limpar(); await daRede?.limpar(); await rede?.limpar()
})

test('sem a agenda e sem atender, nada recorta: o dashboard da unidade mostra o faturamento da unidade', async ({ browser }) => {
  await como(browser, daUnidade!, async p => {
    await p.goto(`/${slug}/dashboard`)
    const main = p.locator('main')
    await expect(main.getByText('Faturamento do mês')).toBeVisible()
    await expect.soft(main, 'o faturamento da unidade, não o "dela"').toContainText(/Faturamento do mês\s*R\$\s*300(?!\d)/)
    await expect.soft(main.getByText('Meu faturamento', { exact: true }), 'o gráfico é o da unidade').toHaveCount(0)
    await expect.soft(main.getByRole('heading', { name: 'Faturamento', exact: true })).toBeVisible()
    await expect.soft(main, 'o ticket da unidade').toContainText(/Ticket médio\s*R\$\s*300(?!\d)/)
  })
})

test('sem a agenda e sem atender, o dashboard da rede mostra a receita e o custo da rede, sem recorte', async ({ browser }) => {
  await como(browser, daRede!, async p => {
    await p.goto('/admin/dashboard?period=month')
    await expect(p.getByRole('heading', { name: /^Visão geral/ })).toBeVisible()
    const corpo = p.locator('main')
    await expect.soft(corpo, 'a receita da rede').toContainText('R$ 300,00')
    await expect.soft(p.getByText('Despesas pagas do mês'), 'o custo aparece: não há recorte').toBeVisible()
    await expect.soft(corpo, 'a despesa da rede').toContainText('77,00')
  })
})

/**
 * Era a decisão (2) do D6 (o Heitor, 2026-10-29): o cargo salvo guardava o
 * "só os meus" do módulo desligado. Sem o "só os meus" (SM1, o Heitor,
 * 2026-11-23), o cargo é módulo × nível: o escopo que o formulário mandar
 * não fica, e a coluna guarda "todos".
 */
test('salvar o cargo não guarda escopo: o "só os meus" mandado vira "todos", ligado ou desligado', async ({ browser }) => {
  const dona = await criarMembro(`esmd${marca}`, { tenant: rede!.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  expect((await db().from('tenants').update({ onboarding_completed_at: agora }).eq('id', rede!.tenantId)).error).toBeNull()
  const { data: cargo, error } = await db().from('tenant_roles')
    .insert({ tenant_id: rede!.tenantId, key: `ESM_${marca}`.toUpperCase(), label: `Cargo esm ${marca}`, is_system: false })
    .select('id').single<{ id: string }>()
  expect(error, 'cargo do teste').toBeNull()
  const escopoDaAgenda = async () => (await db().from('role_permissions').select('level, scope')
    .eq('role_id', cargo!.id).eq('module', 'agenda').single<{ level: string; scope: string }>()).data
  try {
    await como(browser, dona, async p => {
      const salvar = (nivel: string) => chamarAcaoComFormulario(p, 'actions/permissions.ts', 'saveRolePermissions',
        '/admin/settings?tab=permissions', [undefined], {
          roleId: cargo!.id, 'level:agenda': nivel, 'scope:agenda': 'OWN',
          'level:financial': 'VIEW', 'scope:financial': 'ALL',
        })
      const r = await salvar('NONE')
      expect(r.texto, 'chegou à action').not.toContain('Server action not found')
      expect(await escopoDaAgenda(), 'desligada, sem o "só os meus"').toEqual({ level: 'NONE', scope: 'ALL' })
      await salvar('VIEW')
      expect(await escopoDaAgenda(), 'religada, sem o "só os meus"').toEqual({ level: 'VIEW', scope: 'ALL' })
    })
  } finally {
    await db().from('role_report_tabs').delete().eq('role_id', cargo!.id)
    await db().from('role_permissions').delete().eq('role_id', cargo!.id)
    await db().from('tenant_roles').delete().eq('id', cargo!.id)
    await db().from('domain_events').delete().eq('tenant_id', rede!.tenantId)
    await dona.limpar()
  }
})
