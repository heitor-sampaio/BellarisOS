import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O quadro e o modal do lead, ajustes de 2026-10-30:
 * - J-17: as tags sugeridas repetiam as origens (Instagram, WhatsApp…) — a
 *   origem tem o seu campo;
 * - J-18: os sete botões "Novo lead nesta etapa" tinham o mesmo nome; agora
 *   cada um diz a etapa;
 * - J-19: o telefone do lead aparecia cru no modal (5541992000040) — e salvar
 *   sem mexer não pode trocar o número gravado;
 * - J-20: "Origem" e "Etapa" não estavam ligados aos seletores.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let sdr: MembroDeTeste | null = null
let slug = ''
const NOME = `${PREFIXO} Lead fone ${marca}`
const FONE = '5541992000040'

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: sdr!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`cm${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  sdr = await criarMembro(`cms${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'SDR', permissoes: [{ modulo: 'crm', nivel: 'MANAGE' }],
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
  await sdr?.limpar(); await rede?.limpar()
})

test('cada "Novo lead" diz a etapa; o modal não sugere as origens como tag; Origem e Etapa ligados', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slug}/oportunidades`)
    const botoes = p.getByRole('button', { name: /^Novo lead em / })
    await expect(botoes.first()).toBeVisible()
    const nomes = await botoes.evaluateAll(bs => bs.map(b => b.getAttribute('aria-label')))
    expect(nomes.length, 'um botão por etapa').toBeGreaterThan(1)
    expect(new Set(nomes).size, 'nenhum nome repetido').toBe(nomes.length)

    await expect(async () => {
      await botoes.first().click({ timeout: 1000 })
      await expect(p.locator('dialog[open] input[name="name"]')).toBeVisible({ timeout: 1000 })
    }).toPass()
    const modal = p.locator('dialog[open]')
    for (const origem of ['Instagram', 'WhatsApp', 'Meta Ads', 'Telefone']) {
      await expect(modal.getByRole('button', { name: origem, exact: true }), `"${origem}" não é sugestão de tag`).toHaveCount(0)
    }
    await expect(modal.getByRole('combobox', { name: 'Origem' })).toBeVisible()
    await expect(modal.getByRole('combobox', { name: 'Etapa' })).toBeVisible()
  })
})

test('o telefone do lead aparece com a máscara, e salvar sem mexer não troca o número', async ({ browser }) => {
  await como(browser, async p => {
    // Abrir o quadro cria o funil padrão; o lead entra na primeira etapa dele.
    await p.goto(`/${slug}/oportunidades`)
    await expect(p.getByRole('button', { name: /^Novo lead/ }).first()).toBeVisible()
    const { data: etapa } = await db().from('crm_stages').select('id').eq('tenant_id', rede!.tenantId).order('position').limit(1).single<{ id: string }>()
    const { error } = await db().from('leads').insert({
      tenant_id: rede!.tenantId, name: NOME, phone: FONE, source: 'Instagram', crm_stage_id: etapa!.id,
    })
    expect(error, 'o lead com o telefone do WhatsApp').toBeNull()
    await p.reload()
    await p.locator('[data-lead-card]').filter({ hasText: NOME }).click()
    const modal = p.locator('dialog[open]')
    await expect(modal.locator('input[name="phone"]')).toHaveValue('(41) 99200-0040')
    await modal.getByRole('button', { name: 'Salvar' }).click()
    await expect(p.locator('dialog[open]')).toHaveCount(0)
  })
  const { data } = await db().from('leads').select('phone').eq('tenant_id', rede!.tenantId).eq('name', NOME).single<{ phone: string }>()
  expect(data!.phone, 'o número gravado continua o do WhatsApp').toBe(FONE)
})
