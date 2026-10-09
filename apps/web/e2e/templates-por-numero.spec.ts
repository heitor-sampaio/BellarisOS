import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { subirGraphFalsa, type GraphFalsa } from './apoio/graph-falsa'

/**
 * Templates a partir dos NÚMEROS oficiais conectados (pedido do Heitor,
 * 2026-10-09):
 *  - sem número oficial ligado, a tela não mostra nem cria template;
 *  - ligar um número puxa o catálogo da conta dele (a WABA) da Meta — e o que
 *    o sistema não envia entra marcado, só leitura;
 *  - com mais de um, o template novo nasce no número escolhido, e a lista diz
 *    de qual número é e filtra por ele;
 *  - desligar tira do BellarisOS os templates da conta (na Meta continuam).
 *
 * O catálogo segue sendo da WABA (dois números da mesma conta dividem os
 * templates): "o número" do template é o da conta dele. A Graph é a falsa.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let outra: OutraRede
let admin: MembroDeTeste
let graph: GraphFalsa
let n1: string
let n2: string
const W1 = `91${String(Date.now()).slice(-8)}`
const W2 = `92${String(Date.now()).slice(-8)}`
const rotulo1 = `${PREFIXO} Recepção ${marca}`
const rotulo2 = `${PREFIXO} Vendas ${marca}`

async function caixa(rotulo: string, waba: string, fone: string): Promise<string> {
  const { data, error } = await db().from('whatsapp_numbers').insert({
    tenant_id: outra.tenantId, provider: 'official', label: rotulo, is_active: false,
    waba_id: waba, phone_number_id: fone,
    // Conexão do cadastro incorporado: ligar e desligar não regrava a config
    // (e o graphBase da Graph falsa fica).
    config: { conexao: 'cadastro_incorporado', modo: 'cloud_api', phoneNumberId: fone, wabaId: waba, accessToken: 'e2e-token', graphBase: graph.url },
  }).select('id').single<{ id: string }>()
  expect(error, 'criar a caixa oficial').toBeNull()
  return data!.id
}

test.beforeAll(async () => {
  test.setTimeout(240_000)
  graph = await subirGraphFalsa()
  outra = await criarOutraRede(`tpl${marca}`)
  admin = await criarMembro(`tpladm${marca}`, {
    tenant: outra.tenantId, rotulo: 'Marketing',
    permissoes: [{ modulo: 'marketing', nivel: 'MANAGE' }, { modulo: 'settings', nivel: 'MANAGE' }],
  })
  graph.responder(`/${W1}/message_templates`, { data: [
    { id: '7001', name: 'boas_vindas', status: 'APPROVED', category: 'UTILITY', language: 'pt_BR',
      components: [{ type: 'BODY', text: 'Olá, {{nome}}!', example: { body_text_named_params: [{ param_name: 'nome', example: 'Ana' }] } }] },
    { id: '7002', name: 'promo_foto', status: 'APPROVED', category: 'MARKETING', language: 'pt_BR',
      components: [{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: 'Promoção da semana' }] },
  ] })
  graph.responder(`/${W2}/message_templates`, { data: [] })
  n1 = await caixa(rotulo1, W1, `81${marca.length}${String(Date.now()).slice(-7)}`)
  n2 = await caixa(rotulo2, W2, `82${marca.length}${String(Date.now()).slice(-7)}`)
})
test.afterAll(async () => {
  const b = db()
  await b.from('message_templates').delete().eq('tenant_id', outra.tenantId)
  await b.from('whatsapp_numbers').delete().eq('tenant_id', outra.tenantId)
  await admin?.limpar()
  await outra?.limpar()
  await graph?.fechar()
})

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: admin.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const ligar = (p: Page, id: string, ativo: boolean) =>
  chamarAcao(p, 'actions/integrations.ts', 'salvarNumeroWhatsApp', '/admin/settings', [id, 'official', {}, ativo])
const templates = async () => ((await db().from('message_templates')
  .select('name, waba_id, status, meta_template_id, nao_suportado').eq('tenant_id', outra.tenantId).order('name')).data ?? []) as
  { name: string; waba_id: string; status: string; meta_template_id: string | null; nao_suportado: string | null }[]

test('sem número oficial ligado, a tela não mostra nem cria template', async ({ browser }) => {
  await db().from('message_templates').insert({
    tenant_id: outra.tenantId, waba_id: W1, name: `e2e_solto_${marca}`, body_text: 'Oi', status: 'APPROVED',
  })
  await como(browser, async p => {
    await p.goto('/admin/templates')
    await expect(p.getByText(/Conecte um número da API oficial/)).toBeVisible()
    await expect(p.getByRole('button', { name: /Novo/ })).toHaveCount(0)
    await expect(p.getByText(`e2e_solto_${marca}`)).toHaveCount(0)
  })
  await db().from('message_templates').delete().eq('tenant_id', outra.tenantId)
})

test('ligar um número puxa os templates da conta dele, e o que não dá para enviar vem marcado', async ({ browser }) => {
  await como(browser, async p => {
    const r = await ligar(p, n1, true)
    expect(r.texto).toContain('"ok":true')
    await expect.poll(async () => (await templates()).map(t => t.name)).toEqual(['boas_vindas', 'promo_foto'])
    const [boas, promo] = await templates()
    expect(boas).toMatchObject({ waba_id: W1, status: 'APPROVED', meta_template_id: '7001', nao_suportado: null })
    expect(promo!.nao_suportado).toMatch(/imagem/i)

    await p.goto('/admin/templates')
    const linha = p.locator('[data-template]', { hasText: 'boas_vindas' })
    await expect(linha).toContainText(rotulo1)
    await p.locator('[data-template]', { hasText: 'promo_foto' }).click()
    await expect(p.getByText(/não dá para enviar pelo BellarisOS/i)).toBeVisible()
  })
})

test('com dois números, o novo nasce no escolhido, e a lista filtra por número', async ({ browser }) => {
  await como(browser, async p => {
    expect((await ligar(p, n2, true)).texto).toContain('"ok":true')
    await p.goto('/admin/templates')
    await expect(p.locator('[data-template]', { hasText: 'boas_vindas' })).toBeVisible()

    // O filtro por número.
    await p.getByRole('button', { name: 'Número', exact: true }).click()
    await p.getByRole('button', { name: rotulo2, exact: true }).click()
    await expect(p.locator('[data-template]', { hasText: 'boas_vindas' })).toHaveCount(0)

    // O novo, no número escolhido.
    await p.getByRole('button', { name: /Novo/ }).click()
    await p.getByLabel('Número do WhatsApp').selectOption({ label: rotulo2 })
    await p.getByPlaceholder('lembrete_consulta').fill(`e2e_vendas_${marca}`)
    await p.getByPlaceholder(/Olá, \{\{nome\}\}/).fill('Oi! Temos novidades para você.')
    await p.getByRole('button', { name: 'Salvar', exact: true }).click()
    await expect.poll(async () => (await templates()).find(t => t.name === `e2e_vendas_${marca}`)?.waba_id).toBe(W2)
  })
})

test('desligar um número tira do BellarisOS os templates da conta dele', async ({ browser }) => {
  await como(browser, async p => {
    expect((await ligar(p, n1, false)).texto).toContain('"ok":true')
    await expect.poll(async () => (await templates()).map(t => t.name)).toEqual([`e2e_vendas_${marca}`])
    // Na Meta não se apaga nada: nenhum DELETE foi à Graph.
    expect(graph.chamadas.filter(c => c.metodo === 'DELETE')).toEqual([])
  })
})
