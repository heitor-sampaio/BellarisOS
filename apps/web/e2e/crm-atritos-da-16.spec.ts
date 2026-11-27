import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Os atritos do quadro de oportunidades na 16ª simulação (2026-11-15), numa
 * rede [e2e] própria com dois funis:
 *
 * - A15 (design.md: o menu abre dentro da tela): o "···" do card da coluna da
 *   esquerda abria cortado ("ER PARA A ETAPA"), e "Mover para outro funil"
 *   ficava escondido.
 * - A16 (princípio 3): o campo "Etapa" do modal listava as etapas dos dois
 *   funis, com "Perdido" duas vezes. Só as do funil do card; mudar de funil é
 *   o "Mover para outro funil" do menu.
 * - A17 (princípio 3): com um filtro, o topo seguia com os números do funil
 *   inteiro sem dizer. A barra diz quantas o filtro mostra e que o topo é do
 *   funil inteiro.
 * - A19 (princípio 7): criar o funil não o selecionava; o painel seguia nas
 *   etapas do funil padrão.
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
const nome = (r: string) => `${PREFIXO} ${r} ${marca}`
let rede: OutraRede
let joana: MembroDeTeste
let dona: MembroDeTeste
const vendas: Record<'novo' | 'avaliacao' | 'ganho' | 'perdido', string> = { novo: '', avaliacao: '', ganho: '', perdido: '' }
const NOMES_DE_VENDAS = ['Novo contato', 'Avaliação agendada com a cliente', 'Fechado', 'Perdido']

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function lead(rotulo: string, campos: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await db().from('leads').insert({
    tenant_id: rede.tenantId, name: nome(rotulo), phone: `5548${String(Date.now()).slice(-4)}${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`,
    crm_stage_id: vendas.novo, ...campos,
  }).select('id').single<{ id: string }>()
  expect(error, `criar a oportunidade ${rotulo}`).toBeNull()
  return data!.id
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`cr16a${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  const funil = async (n: string, padrao: boolean, posicao: number) =>
    (await db().from('crm_funnels').insert({ tenant_id: rede.tenantId, name: n, is_default: padrao, position: posicao }).select('id').single<{ id: string }>()).data!.id
  const fVendas = await funil('Vendas', true, 0)
  const fRetorno = await funil('Retorno', false, 1)
  const etapas = [['novo', 'OPEN'], ['avaliacao', 'OPEN'], ['ganho', 'WON'], ['perdido', 'LOST']] as const
  for (const [i, [k, o]] of etapas.entries()) {
    const { data } = await db().from('crm_stages').insert({ tenant_id: rede.tenantId, funnel_id: fVendas, name: NOMES_DE_VENDAS[i], color: '#c34d6b', position: i, outcome: o }).select('id').single<{ id: string }>()
    vendas[k] = data!.id
  }
  for (const [i, [n, o]] of [['Retornar', 'OPEN'], ['Voltou', 'WON'], ['Perdido', 'LOST']].entries()) {
    expect((await db().from('crm_stages').insert({ tenant_id: rede.tenantId, funnel_id: fRetorno, name: n, color: '#c34d6b', position: i, outcome: o })).error).toBeNull()
  }
  joana = await criarMembro(`cr16j${marca}`, {
    tenant: rede.tenantId, rotulo: 'Comercial',
    permissoes: [{ modulo: 'crm', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'settings', nivel: 'MANAGE' }],
  })
  // Criar funil é configuração da rede toda: só a Admin da rede (o Heitor,
  // 18/11: "Configuração da rede toda só pela conta admin").
  dona = await criarMembro(`cr16d${marca}`, { tenant: rede.tenantId, rotulo: 'Dona', donoDaRede: true, permissoes: [] })
})

test.afterAll(async () => {
  await joana?.limpar()
  await dona?.limpar()
  await rede?.limpar()
})

test('A15: o menu "···" do card da primeira coluna abre inteiro na tela, com "Mover para outro funil"', async ({ browser }) => {
  const id = await lead('Menu Cortado')
  for (const viewport of [{ width: 412, height: 900 }, { width: 1440, height: 900 }]) {
    await como(browser, joana, async p => {
      await p.goto('/admin/oportunidades')
      await p.locator(`[data-lead-id="${id}"]`).getByTitle('Ações da oportunidade').click()
      const menu = p.getByRole('menu')
      await expect(menu).toBeVisible()
      await expect(menu, `o menu inteiro na tela (${viewport.width})`).toBeInViewport({ ratio: 1 })
      // Nada o corta: o ponto do meio de cada item é o próprio item (não a coluna, nem o vizinho).
      for (const item of await menu.getByRole('menuitem').all()) {
        const visto = await item.evaluate(el => {
          const r = el.getBoundingClientRect()
          const achado = document.elementFromPoint(r.left + 8, r.top + r.height / 2)
          return !!achado && el.contains(achado)
        })
        expect(visto, `o item "${await item.textContent()}" à mostra (${viewport.width})`).toBe(true)
      }
      await menu.getByRole('menuitem', { name: 'Mover para outro funil' }).click()
      await expect(p.getByText('Mover para outro funil').last()).toBeVisible()
    }, viewport)
  }
})

test('A16: o campo "Etapa" do modal lista só as etapas do funil do card', async ({ browser }) => {
  const id = await lead('Etapa Do Funil')
  await como(browser, joana, async p => {
    await p.goto(`/admin/oportunidades?lead=${id}`)
    const modal = p.getByRole('dialog').filter({ hasText: 'Editar oportunidade' })
    const etapa = modal.getByLabel('Etapa', { exact: true })
    await expect(etapa).toHaveValue(vendas.novo)
    expect(await etapa.locator('option').allTextContents()).toEqual(NOMES_DE_VENDAS)
    await expect(etapa.locator('optgroup')).toHaveCount(0)
  })
})

test('A17: com o filtro, a barra diz quantas mostra, e que o topo é do funil inteiro', async ({ browser }) => {
  // A tag é da PESSOA (o Heitor, 18/11: "a tag é da pessoa"): marcada no contato do card.
  const noiva = await lead('Filtro Noiva')
  const { data: k } = await db().from('leads').select('contato_id').eq('id', noiva).single<{ contato_id: string }>()
  expect((await db().from('contacts').update({ tags: ['Noiva'] }).eq('id', k!.contato_id)).error, 'a tag da pessoa').toBeNull()
  await lead('Filtro Outra')
  await como(browser, joana, async p => {
    await p.goto('/admin/oportunidades')
    await expect(p.locator('[data-filtro-do-quadro]')).toHaveCount(0)
    await p.getByRole('button', { name: /^Tags/ }).click()
    await p.locator('[data-painel-picker]').getByRole('button', { name: 'Noiva' }).click()
    const total = await db().from('leads').select('id', { count: 'exact', head: true }).eq('tenant_id', rede.tenantId).in('crm_stage_id', Object.values(vendas))
    await expect(p.locator('[data-filtro-do-quadro]')).toContainText(`Mostrando 1 de ${total.count} oportunidades`)
    // O "por que" mora na dica (2026-11-16): fecha o seletor e passa o mouse no "i".
    await p.keyboard.press('Escape')
    await p.locator('[data-filtro-do-quadro]').getByRole('button', { name: 'Sobre os números do topo' }).hover()
    await expect(p.locator('[data-filtro-do-quadro]')).toContainText('Os números do topo são do funil inteiro')
  })
})

/**
 * A10 da 38ª simulação (princípio 3): com duas tags marcadas no filtro, o selo
 * do "Limpar" mostrava 1 (contava o grupo). Conta cada filtro marcado, como o inbox.
 */
test('A10 da 38ª: com duas tags marcadas, o selo do "Limpar" diz 2', async ({ browser }) => {
  const id = await lead('Filtro duas tags A10')
  const { data: k } = await db().from('leads').select('contato_id').eq('id', id).single<{ contato_id: string }>()
  expect((await db().from('contacts').update({ tags: ['Noivas 2027', 'Indicação'] }).eq('id', k!.contato_id)).error, 'as tags da pessoa').toBeNull()
  await como(browser, joana, async p => {
    await p.goto('/admin/oportunidades')
    await p.getByRole('button', { name: /^Tags/ }).click()
    const painel = p.locator('[data-painel-picker]')
    await painel.getByRole('button', { name: 'Noivas 2027' }).click()
    await painel.getByRole('button', { name: 'Indicação' }).click()
    await p.keyboard.press('Escape')
    await expect(p.locator('[data-selo-dos-filtros]')).toHaveText('2')
  })
})

test('A19: o funil criado abre selecionado, com as etapas dele', async ({ browser }) => {
  const nomeDoFunil = `Noivas ${marca}`
  await como(browser, dona, async p => {
    await p.goto('/admin/oportunidades?configurar=funis')
    const janela = p.getByRole('dialog')
    await expect(janela.getByText('ETAPAS DE VENDAS')).toBeVisible()
    await janela.getByPlaceholder('Nome do funil').fill(nomeDoFunil)
    await janela.getByRole('button', { name: 'Criar', exact: true }).click()
    await expect(janela.getByText(`ETAPAS DE ${nomeDoFunil.toUpperCase()}`)).toBeVisible({ timeout: 15_000 })
  })
})
