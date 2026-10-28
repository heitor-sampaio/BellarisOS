import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O telefone aparece formatado em toda tela, seja qual for o formato gravado
 * (A25, simulação de 2026-10-27): a cliente convertida do lead guardava o número
 * do WhatsApp ("5548990000011") e aparecia crua ao lado da de balcão, mascarada.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let membro: MembroDeTeste | null = null
let slug = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: membro!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`tf${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  membro = await criarMembro(`tf${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Comercial',
    permissoes: [{ modulo: 'crm', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }],
  })
})
test.afterAll(async () => {
  if (rede) {
    const { data } = await db().from('leads').select('id').eq('tenant_id', rede.tenantId)
    const ids = (data ?? []).map(l => l.id as string)
    if (ids.length) { await db().from('lead_events').delete().in('lead_id', ids); await db().from('leads').delete().in('id', ids) }
    await db().from('contacts').delete().eq('tenant_id', rede.tenantId)
  }
  await membro?.limpar(); await rede?.limpar()
})

test.describe.serial('o telefone formatado', () => {
  test('a ficha mostra formatado o número gravado no formato do WhatsApp', async ({ browser }) => {
    const id = await rede!.criarCliente('Numero cru')
    expect((await db().from('clients').update({ phone: '5548990000011' }).eq('id', id)).error).toBeNull()
    await como(browser, async p => {
      await p.goto(`/${slug}/clients/${id}`)
      await expect(p.getByText('(48) 99000-0011').first()).toBeVisible()
      await expect(p.getByText('5548990000011')).toHaveCount(0)
    })
  })

  test('converter o lead mostra o telefone mascarado e grava a ficha como a de balcão', async ({ browser }) => {
    const { data: funil } = await db().from('crm_funnels').insert({ tenant_id: rede!.tenantId, name: 'F', is_default: true, position: 0 }).select('id').single<{ id: string }>()
    const { data: etapa } = await db().from('crm_stages').insert({ tenant_id: rede!.tenantId, funnel_id: funil!.id, name: 'Novo', color: '#c34d6b', position: 0, outcome: 'OPEN' }).select('id').single<{ id: string }>()
    const nome = `${PREFIXO} Lead convertido ${marca}`
    const { error } = await db().from('leads').insert({ tenant_id: rede!.tenantId, name: nome, phone: '5548990000022', crm_stage_id: etapa!.id })
    expect(error).toBeNull()
    await como(browser, async p => {
      await p.goto(`/${slug}/oportunidades`)
      const card = p.locator('[data-lead-card]').filter({ hasText: nome })
      await expect(card.getByText('(48) 99000-0022')).toBeVisible()
      await card.getByRole('button', { name: 'Converter' }).click()
      await expect(p.getByRole('dialog', { name: 'Converter em cliente' }).locator('input[name="phone"]')).toHaveValue('(48) 99000-0022')
      await p.getByRole('dialog', { name: 'Converter em cliente' }).getByRole('button', { name: 'Cadastrar cliente' }).click()
      await expect.poll(async () => (await db().from('clients').select('phone').eq('tenant_id', rede!.tenantId).eq('name', nome).maybeSingle()).data?.phone).toBe('(48) 99000-0022')
    })
  })
})
