import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * A15 da 6ª simulação (2026-11-04): os contatos importados SEM "criar
 * oportunidade" não apareciam em lugar nenhum — nem em Clientes, nem no
 * Ctrl K, nem no Inbox, nem em Oportunidades. A pessoa do CRM sem
 * oportunidade e sem conversa agora se acha pela busca universal ("Contatos
 * do CRM"), e abrir leva ao "Novo lead" do quadro já com os dados dela — a
 * oportunidade nasce ligada a ESSA pessoa (também a que só tem e-mail).
 * Só para quem cria oportunidade (CRM em Gerenciar). Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let sdr: MembroDeTeste | null = null
let quemSoVe: MembroDeTeste | null = null
const nome = `${PREFIXO} Importada Sem Card ${marca}`
const soEmail = `${PREFIXO} Só E-mail Sem Card ${marca}`
let pessoa = ''
let pessoaDoEmail = ''

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const campo = (p: Page) => p.getByRole('combobox', { name: 'Busca universal' })

test.beforeAll(async () => {
  rede = await criarOutraRede(`bc${marca}`)
  sdr = await criarMembro(`bcs${marca}`, { tenant: rede.tenantId, rotulo: 'SDR', permissoes: [{ modulo: 'crm', nivel: 'MANAGE' }] })
  quemSoVe = await criarMembro(`bcv${marca}`, { tenant: rede.tenantId, rotulo: 'Vê', permissoes: [{ modulo: 'crm', nivel: 'VIEW' }] })
  const fone = '5548' + String(Date.now()).slice(-9)
  const { data: p1, error } = await db().from('contacts').insert({
    tenant_id: rede.tenantId, name: nome, phone: fone, identifiers: [fone], email: `sem-card-${marca}@exemplo.com`, tags: [],
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  pessoa = p1!.id
  const { data: p2, error: e2 } = await db().from('contacts').insert({
    tenant_id: rede.tenantId, name: soEmail, identifiers: [], email: `so-email-${marca}@exemplo.com`, tags: [],
  }).select('id').single<{ id: string }>()
  expect(e2).toBeNull()
  pessoaDoEmail = p2!.id
})
test.afterAll(async () => {
  if (rede) {
    const { data: leads } = await db().from('leads').select('id').eq('tenant_id', rede.tenantId)
    const ids = (leads ?? []).map(l => l.id as string)
    if (ids.length) { await db().from('lead_events').delete().in('lead_id', ids); await db().from('leads').delete().in('id', ids) }
    await db().from('contacts').delete().eq('tenant_id', rede.tenantId)
  }
  await sdr?.limpar(); await quemSoVe?.limpar(); await rede?.limpar()
})

test('A15: o Ctrl K acha a pessoa do CRM sem oportunidade, e abrir cria a oportunidade dela', async ({ browser }) => {
  await como(browser, sdr!, async p => {
    await p.goto('/admin/oportunidades')
    await campo(p).fill(`importada sem card ${marca}`)
    const opcao = p.getByRole('option', { name: new RegExp(`Importada Sem Card ${marca}`) })
    await expect(opcao).toBeVisible({ timeout: 15_000 })
    await expect(p.getByText('Contatos do CRM')).toBeVisible()
    await opcao.click()
    await expect(p).toHaveURL(/\/admin\/oportunidades/, { timeout: 20_000 })
    const modal = p.locator('dialog[open]')
    await expect(modal.locator('input[name="name"]')).toHaveValue(nome, { timeout: 20_000 })
    await expect(modal.locator('input[name="email"]')).toHaveValue(`sem-card-${marca}@exemplo.com`)
    await modal.getByRole('button', { name: 'Criar oportunidade' }).click()
    await expect(modal).toBeHidden({ timeout: 15_000 })
  })
  const { data: leads } = await db().from('leads').select('contato_id').eq('tenant_id', rede!.tenantId).eq('name', nome)
  expect(leads, 'a oportunidade é da pessoa achada').toEqual([{ contato_id: pessoa }])
})

test('A15: a pessoa só com e-mail ganha a oportunidade dela (não nasce outra pessoa)', async ({ browser }) => {
  await como(browser, sdr!, async p => {
    await p.goto('/admin/oportunidades')
    await campo(p).fill(`so e-mail sem card ${marca}`)
    await p.getByRole('option', { name: new RegExp(`Só E-mail Sem Card ${marca}`) }).click({ timeout: 15_000 })
    const modal = p.locator('dialog[open]')
    await expect(modal.locator('input[name="name"]')).toHaveValue(soEmail, { timeout: 20_000 })
    await modal.getByRole('button', { name: 'Criar oportunidade' }).click()
    await expect(modal).toBeHidden({ timeout: 15_000 })
  })
  const { data: leads } = await db().from('leads').select('contato_id').eq('tenant_id', rede!.tenantId).eq('name', soEmail)
  expect(leads).toEqual([{ contato_id: pessoaDoEmail }])
  const { count } = await db().from('contacts').select('id', { count: 'exact', head: true }).eq('tenant_id', rede!.tenantId)
  expect(count, 'nenhuma pessoa nova').toBe(2)
})

test('A15: quem só vê o CRM não acha a pessoa sem oportunidade (não cria oportunidade)', async ({ browser }) => {
  await como(browser, quemSoVe!, async p => {
    await p.goto('/admin/oportunidades')
    const r = await chamarAcao(p, 'actions/busca.ts', 'buscarTudo', '/admin/dashboard', [`sem card ${marca}`, null])
    expect(r.texto).not.toContain('"tipo":"contato"')
  })
})
