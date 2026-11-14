import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Bloco CRM (CR1, CR2) e RL2 do bloco Relatórios — a revisão do Heitor de
 * 2026-11-13: "leads e oportunidades sao entidades diferentes, pq lead é a
 * pessoa". A PESSOA é o contato, o CARD é a oportunidade; "lead" sai de todo
 * texto que se lê (o nome da tabela fica).
 * - CR1: o quadro diz "Nova oportunidade", "1 oportunidade no funil",
 *   "Editar oportunidade" — nenhum "lead" na tela;
 * - CR2: o card do quadro diz "Cadastrar cliente" e a janela "Cadastrar como
 *   cliente", como o inbox (era "Converter" / "Converter em cliente");
 * - RL2: a aba "Funil comercial" dos Relatórios se chama "Oportunidades" — na
 *   tela e nos relatórios liberados do cargo. A chave (`comercial`) fica.
 * A varredura do texto do código é `tests/oportunidade-no-texto.test.ts`.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let slug = ''
const NOME = `${PREFIXO} Contato quadro ${marca}`
const SEM_LEAD = /\bleads?\b/i

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: dona!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`cr${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  dona = await criarMembro(`crd${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
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
  await dona?.limpar(); await rede?.limpar()
})

test('CR1 e CR2: o quadro fala em oportunidade, e o card cadastra como cliente', async ({ browser }) => {
  await como(browser, async p => {
    // Abrir o quadro cria o funil padrão; a oportunidade entra na primeira etapa dele.
    await p.goto(`/${slug}/oportunidades`)
    await expect(p.getByRole('button', { name: /^Nova oportunidade em / }).first()).toBeVisible()
    const { data: etapa } = await db().from('crm_stages').select('id').eq('tenant_id', rede!.tenantId).order('position').limit(1).single<{ id: string }>()
    const { error } = await db().from('leads').insert({ tenant_id: rede!.tenantId, name: NOME, phone: '5541992000077', crm_stage_id: etapa!.id })
    expect(error, 'a oportunidade do teste').toBeNull()
    await p.reload()

    const card = p.locator('[data-lead-card]').filter({ hasText: NOME })
    await expect(card).toBeVisible()
    await expect(p.getByText('1 oportunidade no funil')).toBeVisible()
    await expect(p.getByRole('button', { name: 'Nova oportunidade', exact: true })).toBeVisible()
    expect(await p.locator('body').innerText(), 'o quadro não diz "lead"').not.toMatch(SEM_LEAD)

    // O card aberto: "Editar oportunidade".
    await card.click()
    const modal = p.locator('dialog[open]')
    await expect(modal).toContainText('Editar oportunidade')
    expect(await modal.innerText(), 'o card aberto não diz "lead"').not.toMatch(SEM_LEAD)
    await p.keyboard.press('Escape')
    await expect(p.locator('dialog[open]')).toHaveCount(0)

    // CR2: o mesmo nome do inbox.
    await expect(card.getByRole('button', { name: 'Converter' })).toHaveCount(0)
    await card.getByRole('button', { name: 'Cadastrar cliente' }).click()
    const janela = p.getByRole('dialog', { name: 'Cadastrar como cliente' })
    await expect(janela).toBeVisible()
    await expect(janela.getByRole('heading', { name: 'Cadastrar como cliente' })).toBeVisible()
  })
})

test('RL2: a aba do funil se chama "Oportunidades", no relatório e no cargo', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto('/admin/reports?tab=comercial')
    await expect(p.getByRole('button', { name: 'Oportunidades', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(p.getByText('Funil comercial')).toHaveCount(0)
    await expect(p.getByText('Funil de oportunidades')).toBeVisible()
    expect(await p.locator('body').innerText(), 'o relatório não diz "lead"').not.toMatch(SEM_LEAD)

    // Os relatórios liberados do cargo: o mesmo nome, e a dica sem "leads".
    await p.goto('/admin/settings?tab=permissions')
    await p.getByRole('button', { name: 'Novo' }).click()
    await p.getByPlaceholder('Ex.: Recepção').fill(`${PREFIXO} Comercial ${marca}`)
    await p.getByRole('button', { name: 'Criar' }).click()
    const relatorios = p.locator('[data-modulo="reports"]')
    await relatorios.getByRole('button', { name: 'Ver', exact: true }).click()
    const aba = relatorios.getByRole('button', { name: 'Oportunidades', exact: true })
    await expect(aba).toBeVisible()
    await expect(aba).toHaveAttribute('title', /oportunidades/i)
    await expect(aba).not.toHaveAttribute('title', SEM_LEAD)
    await expect(relatorios.getByRole('button', { name: 'Funil comercial' })).toHaveCount(0)
    const crm = p.locator('[data-modulo="crm"]')
    expect(await crm.innerText(), 'a linha do CRM não diz "lead"').not.toMatch(SEM_LEAD)
  })
})
