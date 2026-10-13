import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * As tags da rede (pedido do Heitor, 2026-10-13): um vocabulário só para a
 * ficha e o CRM, em Configurações → Tags. Até aqui a ficha oferecia oito tags
 * fixas no código, e a tag que vinha de fora (importação, automação, o card)
 * ficava gravada e invisível na ficha.
 *  - Rede nova nasce com as oito de sempre; tag gravada em qualquer lugar entra
 *    no vocabulário sozinha (gatilho).
 *  - Criar, renomear (em clientes, contatos e oportunidades — e juntar, se o
 *    nome novo já existe) e arquivar.
 *  - A ficha oferece o vocabulário, e mostra a tag de fora que a pessoa já tem.
 *
 * Numa rede `[e2e]` própria.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let outra: OutraRede
let admin: MembroDeTeste
let soVe: MembroDeTeste
let clienteId: string
let contatoId: string
let leadId: string
const POS = `${PREFIXO} Pós-operatório ${marca}`

test.beforeAll(async () => {
  test.setTimeout(240_000)
  outra = await criarOutraRede(`tag${marca}`)
  admin = await criarMembro(`tag${marca}`, { tenant: outra.tenantId, rotulo: 'Recepção', permissoes: [
    { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'crm', nivel: 'MANAGE' }, { modulo: 'settings', nivel: 'MANAGE' },
  ] })
  soVe = await criarMembro(`tagv${marca}`, { tenant: outra.tenantId, rotulo: 'Só vê', permissoes: [{ modulo: 'clients', nivel: 'VIEW' }] })
  // A mesma tag de fora em clientes, contatos e oportunidades (gravada direto:
  // é o caminho da importação e da automação).
  const c = await db().from('clients').insert({
    tenant_id: outra.tenantId, branch_id: outra.branchId, name: `${PREFIXO} Cliente ${marca}`,
    phone: '5548' + String(Date.now()).slice(-9), tags: ['VIP', POS, 'retorno'], is_active: true,
  }).select('id').single<{ id: string }>()
  expect(c.error).toBeNull()
  clienteId = c.data!.id
  const fone = '5521' + String(Date.now()).slice(-9)
  const p = await db().from('contacts').insert({ tenant_id: outra.tenantId, name: `${PREFIXO} Pessoa ${marca}`, phone: fone, identifiers: [fone], tags: [POS] })
    .select('id').single<{ id: string }>()
  expect(p.error).toBeNull()
  contatoId = p.data!.id
  const l = await db().from('leads').insert({ tenant_id: outra.tenantId, name: `${PREFIXO} Lead ${marca}`, phone: fone, tags: [POS, 'Orgânico'] })
    .select('id').single<{ id: string }>()
  expect(l.error).toBeNull()
  leadId = l.data!.id
})
test.afterAll(async () => {
  const b = db()
  if (outra) {
    const t = outra.tenantId
    if (leadId) { await b.from('lead_events').delete().eq('lead_id', leadId); await b.from('leads').delete().eq('id', leadId) }
    await b.from('contacts').delete().eq('tenant_id', t)
    if (clienteId) { await b.from('loyalty_accounts').delete().eq('client_id', clienteId); await b.from('clients').delete().eq('id', clienteId) }
    await b.from('tags').delete().eq('tenant_id', t)
  }
  await admin?.limpar(); await soVe?.limpar()
  await outra?.limpar()
})

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const vocabulario = async () => ((await db().from('tags').select('nome, arquivada_em').eq('tenant_id', outra.tenantId)).data ?? []) as
  { nome: string; arquivada_em: string | null }[]

test('a rede nova nasce com as tags padrão, e a tag gravada em qualquer lugar entra no vocabulário', async () => {
  const nomes = (await vocabulario()).map(t => t.nome)
  expect(nomes).toEqual(expect.arrayContaining(['VIP', 'Indicação', 'Retorno', 'Alergias', 'Gestante', 'Idoso', 'Plano', 'Desconto', POS]))
  // "retorno" é a mesma de "Retorno" (sem caixa): não vira outra.
  expect(nomes.filter(n => n.toLowerCase() === 'retorno')).toHaveLength(1)
  // A de unidade é do sistema: não entra.
  expect(nomes.some(n => n.startsWith('Unidade: '))).toBe(false)
})

test('Configurações → Tags: cria, mostra o uso, e a ficha oferece a tag nova e mostra a de fora', async ({ browser }) => {
  await como(browser, admin, async p => {
    await p.goto('/admin/settings?tab=tags')
    const linha = p.locator('[data-tag]', { hasText: POS })
    await expect(linha).toContainText('1 cliente')
    await expect(linha).toContainText('1 contato')
    await expect(linha).toContainText('1 oportunidade')

    await p.getByLabel('Nova tag').fill(`${PREFIXO} Noivas ${marca}`)
    await p.getByRole('button', { name: 'Criar tag' }).click()
    await expect(p.locator('[data-tag]', { hasText: `${PREFIXO} Noivas ${marca}` })).toBeVisible()

    // A ficha: a tag nova para escolher, e a de fora marcada.
    await p.goto(`/admin/clients/${clienteId}`)
    await p.getByRole('link', { name: 'Dados', exact: true }).click()
    await expect(p.getByRole('button', { name: POS })).toHaveAttribute('aria-pressed', 'true')
    await expect(p.getByRole('button', { name: 'Retorno', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await p.getByRole('button', { name: `${PREFIXO} Noivas ${marca}` }).click()
    await p.getByRole('button', { name: 'Salvar dados' }).click()
    await expect(p.getByRole('button', { name: 'Salvo' })).toBeVisible()
  })
  const { data } = await db().from('clients').select('tags').eq('id', clienteId).single()
  expect(data!.tags).toEqual(expect.arrayContaining(['VIP', POS, 'retorno', `${PREFIXO} Noivas ${marca}`]))
})

test('renomear muda a tag em clientes, contatos e oportunidades', async ({ browser }) => {
  const novo = `${PREFIXO} Pós-op ${marca}`
  await como(browser, admin, async p => {
    await p.goto('/admin/settings?tab=tags')
    const linha = p.locator(`[data-tag="${POS}"]`)
    await linha.getByRole('button', { name: 'Renomear' }).click()
    await linha.getByLabel('Novo nome').fill(novo)
    await linha.getByRole('button', { name: 'Salvar' }).click()
    await expect(p.locator('[data-tag]', { hasText: novo })).toContainText('1 cliente')
    await expect(p.locator('[data-tag]', { hasText: POS })).toHaveCount(0)
  })
  const [c, k, l] = await Promise.all([
    db().from('clients').select('tags').eq('id', clienteId).single(),
    db().from('contacts').select('tags').eq('id', contatoId).single(),
    db().from('leads').select('tags').eq('id', leadId).single(),
  ])
  for (const r of [c, k, l]) {
    expect(r.data!.tags).toContain(novo)
    expect(r.data!.tags).not.toContain(POS)
  }
  expect((await vocabulario()).map(t => t.nome)).not.toContain(POS)
})

test('renomear para um nome que já existe JUNTA as duas (sem repetir na pessoa)', async ({ browser }) => {
  await como(browser, admin, async p => {
    await p.goto('/admin/settings?tab=tags')
    const linha = p.locator('[data-tag="Retorno"]')
    await linha.getByRole('button', { name: 'Renomear' }).click()
    await linha.getByLabel('Novo nome').fill('vip')
    await linha.getByRole('button', { name: 'Salvar' }).click()
    await expect(p.locator('[data-tag="Retorno"]')).toHaveCount(0)
  })
  const { data } = await db().from('clients').select('tags').eq('id', clienteId).single()
  // Fica o nome que já existia ("VIP"), uma vez só.
  expect((data!.tags as string[]).filter(t => t.toLowerCase() === 'vip')).toEqual(['VIP'])
  expect((data!.tags as string[]).some(t => t.toLowerCase() === 'retorno')).toBe(false)
})

test('arquivada sai das opções, mas fica em quem já tem', async ({ browser }) => {
  const noivas = `${PREFIXO} Noivas ${marca}`
  await como(browser, admin, async p => {
    await p.goto('/admin/settings?tab=tags')
    await p.locator('[data-tag]', { hasText: noivas }).getByRole('button', { name: 'Arquivar' }).click()
    await expect(p.locator('[data-tag]', { hasText: noivas })).toContainText('Arquivada')

    // Outra ficha não a oferece; a que já tem continua mostrando.
    const outro = await outra.criarCliente(`Sem tags ${marca}`)
    await p.goto(`/admin/clients/${outro}`)
    await p.getByRole('link', { name: 'Dados', exact: true }).click()
    await expect(p.getByRole('button', { name: 'Gestante', exact: true })).toBeVisible()
    await expect(p.getByRole('button', { name: noivas })).toHaveCount(0)
    await p.goto(`/admin/clients/${clienteId}`)
    await p.getByRole('link', { name: 'Dados', exact: true }).click()
    await expect(p.getByRole('button', { name: noivas })).toHaveAttribute('aria-pressed', 'true')
  })
  expect((await vocabulario()).find(t => t.nome === noivas)?.arquivada_em).toBeTruthy()
})

test('quem só vê clientes não mexe no vocabulário (nem pela action direta)', async ({ browser }) => {
  await como(browser, soVe, async p => {
    const r = await chamarAcao(p, 'actions/tags.ts', 'criarTag', '/admin/settings', [`${PREFIXO} Furo ${marca}`])
    expect(r.texto).not.toContain('"ok":true')
  })
  expect((await vocabulario()).map(t => t.nome)).not.toContain(`${PREFIXO} Furo ${marca}`)
})
