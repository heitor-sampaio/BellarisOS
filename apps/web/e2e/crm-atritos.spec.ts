import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Atritos do CRM vistos na simulação de um dia de clínica (2026-10-20):
 * - o card criado pelo "+" da coluna saía sem nome (o React 19 limpa o
 *   formulário depois da action, e o card lia o nome do campo já vazio);
 * - o modal ficava aberto depois de criar o SEGUNDO lead seguido, o que
 *   convidava a duplicar;
 * - os cards mostravam "Instagram Instagram" (a origem e a tag derivada dela);
 * - não havia a origem "Telefone";
 * - o inbox vazio não dizia que falta ligar o WhatsApp.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let sdr: MembroDeTeste | null = null
let admin: MembroDeTeste | null = null
let slug = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: sdr!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`cr${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  sdr = await criarMembro(`crs${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'SDR', permissoes: [{ modulo: 'crm', nivel: 'MANAGE' }],
  })
  admin = await criarMembro(`cra${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Admin',
    permissoes: [{ modulo: 'crm', nivel: 'MANAGE' }, { modulo: 'settings', nivel: 'MANAGE' }],
  })
})
test.afterAll(async () => {
  if (rede) {
    const { data } = await db().from('leads').select('id').eq('tenant_id', rede.tenantId)
    const ids = (data ?? []).map(l => l.id as string)
    if (ids.length) {
      await db().from('lead_events').delete().in('lead_id', ids)
      await db().from('leads').delete().in('id', ids)
    }
    await db().from('contacts').delete().eq('tenant_id', rede.tenantId)
  }
  await sdr?.limpar(); await admin?.limpar(); await rede?.limpar()
})

test.describe.serial('o CRM', () => {
  test('o "+" da coluna cria com o nome, e o modal fecha — duas vezes seguidas', async ({ browser }) => {
    await como(browser, async p => {
      await p.goto(`/${slug}/oportunidades`)
      for (const nome of [`${PREFIXO} Lead A ${marca}`, `${PREFIXO} Lead B ${marca}`]) {
        await expect(async () => {
          await p.getByRole('button', { name: 'Novo lead nesta etapa' }).first().click({ timeout: 1000 })
          await expect(p.locator('dialog[open] input[name="name"]')).toBeVisible({ timeout: 1000 })
        }).toPass()
        const modal = p.locator('dialog[open]')
        await modal.locator('input[name="name"]').fill(nome)
        await modal.locator('input[name="phone"]').fill('489' + String(Date.now()).slice(-8))
        await modal.getByRole('button', { name: 'Criar lead' }).click()
        await expect(p.locator('dialog[open]'), 'o modal fecha').toHaveCount(0)
        await expect(p.locator('[data-lead-card]').filter({ hasText: nome }), 'o card nasce com o nome').toBeVisible()
      }
    })
    const { data: un } = await db().from('branches').select('name').eq('id', rede!.branchId).single<{ name: string }>()
    const { data: leads } = await db().from('leads').select('tags').eq('tenant_id', rede!.tenantId).like('name', `%Lead _ ${marca}`)
    expect(leads, 'os dois leads').toHaveLength(2)
    for (const l of leads!) expect(l.tags, 'nascem com a tag da unidade do portal').toContain(`Unidade: ${un!.name}`)
  })

  test('a origem não aparece duas vezes no card, e "Telefone" é uma origem', async ({ browser }) => {
    const { data: etapa } = await db().from('crm_stages').select('id').eq('tenant_id', rede!.tenantId).order('position').limit(1).single<{ id: string }>()
    const nome = `${PREFIXO} Insta ${marca}`
    const { error } = await db().from('leads').insert({
      tenant_id: rede!.tenantId, name: nome, phone: `55489${String(Date.now()).slice(-8)}`, source: 'Instagram', tags: ['Instagram'], crm_stage_id: etapa!.id,
    })
    expect(error).toBeNull()
    await como(browser, async p => {
      await p.goto(`/${slug}/oportunidades`)
      const card = p.locator('[data-lead-card]').filter({ hasText: nome })
      await expect(card.getByText('Instagram', { exact: true })).toHaveCount(1)
      await p.getByRole('button', { name: 'Novo lead nesta etapa' }).first().click()
      await expect(p.locator('dialog[open] select[name="source"] option', { hasText: 'Telefone' })).toHaveCount(1)
    })
  })

  test('o inbox sem canal ligado diz isso — e não oferece "iniciar conversa"', async ({ browser }) => {
    await como(browser, async p => {
      await p.goto(`/${slug}/inbox`)
      await expect(p.getByText(/Nenhum canal ligado/)).toBeVisible()
      await expect(p.getByRole('button', { name: 'Iniciar primeira conversa' })).toHaveCount(0)
      // A16: o SDR não vê Configurações → Integrações; o aviso manda pedir a quem administra.
      await expect(p.getByText('Peça a quem administra a clínica para conectar o WhatsApp.')).toBeVisible()
      await expect(p.getByRole('link', { name: /Conectar o WhatsApp/ })).toHaveCount(0)
    })
    // Quem pode configurar vê o atalho.
    const ctx = await browser.newContext({ storageState: admin!.estado })
    try {
      const p = await ctx.newPage()
      await p.goto(`/${slug}/inbox`)
      await expect(p.getByRole('link', { name: /Conectar o WhatsApp/ })).toHaveAttribute('href', `/${slug}/settings?tab=integrations`)
      await expect(p.getByText('Peça a quem administra')).toHaveCount(0)
    } finally { await ctx.close() }
  })
})
