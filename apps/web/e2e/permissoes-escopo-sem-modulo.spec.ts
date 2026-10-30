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
 * O recorte não nasce de um módulo que a pessoa não tem. "Quem tem 'só os
 * meus' vê 'só os meus'" continua valendo para o módulo com VIEW/MANAGE.
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

/** O cargo da contadora: o financeiro inteiro, e o "só os meus" esquecido em módulos que ela NÃO tem. */
const contadora: Permissao[] = [
  { modulo: 'financial',       nivel: 'VIEW', escopo: 'ALL' },
  { modulo: 'agenda',          nivel: 'NONE', escopo: 'OWN' },
  { modulo: 'medical_records', nivel: 'NONE', escopo: 'OWN' },
  { modulo: 'crm',             nivel: 'NONE', escopo: 'OWN' },
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

test('sem a agenda, o "só os meus" guardado nela não recorta: o dashboard da unidade mostra o faturamento da unidade', async ({ browser }) => {
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

test('sem a agenda, o dashboard da rede mostra a receita e o custo da rede, sem o recorte "só os meus"', async ({ browser }) => {
  await como(browser, daRede!, async p => {
    await p.goto('/admin/dashboard?period=month')
    await expect(p.getByRole('heading', { name: /^Visão geral/ })).toBeVisible()
    const corpo = p.locator('main')
    await expect.soft(corpo, 'a receita da rede').toContainText('R$ 300,00')
    await expect.soft(p.getByText('Custo do mês'), 'o custo aparece: não há recorte').toBeVisible()
    await expect.soft(corpo, 'a despesa da rede').toContainText('77,00')
  })
})

/**
 * Revisão do Heitor (2026-10-29), decisão (2) do D6: o cargo salvo GUARDA o
 * "só os meus" do módulo desligado, e religar devolve o que estava. Quem lê
 * continua ignorando esse escopo enquanto o módulo está em NONE (os dois
 * testes acima). A frente 1 gravava ALL ali (`escopoParaGravar`).
 */
test('salvar o cargo guarda o "só os meus" do módulo desligado', async ({ browser }) => {
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
      expect(await escopoDaAgenda(), 'desligada, a agenda guarda o "só os meus"').toEqual({ level: 'NONE', scope: 'OWN' })
      await salvar('VIEW')
      expect(await escopoDaAgenda(), 'religada, o "só os meus" está lá').toEqual({ level: 'VIEW', scope: 'OWN' })
    })
  } finally {
    await db().from('role_report_tabs').delete().eq('role_id', cargo!.id)
    await db().from('role_permissions').delete().eq('role_id', cargo!.id)
    await db().from('tenant_roles').delete().eq('id', cargo!.id)
    await db().from('domain_events').delete().eq('tenant_id', rede!.tenantId)
    await dona.limpar()
  }
})
