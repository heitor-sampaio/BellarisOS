import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A28 da 14ª simulação (F75): o CSV do Fechamento do dia trazia o bruto do
 * cartão por bandeira, e a Ivone conciliava com cada operadora sem a TAXA nem
 * o LÍQUIDO de cada maquininha. O CSV leva "Taxa e líquido por maquininha" —
 * a mesma conta da linha "Taxas da maquininha no dia"
 * (`metrics_taxas_por_maquininha`) — e só a quem vê o financeiro da clínica
 * (D7, 2026-11-11: quem só recebe não vê a taxa nem o líquido; o servidor nem
 * os busca).
 *
 * Numa rede [e2e] própria: a "Maquininha" com que ela nasce (débito 2%), uma
 * "Stone" (débito 3%) e o Pix a 1%.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let dona: MembroDeTeste | null = null
let recepcao: MembroDeTeste | null = null

async function csvDe(m: MembroDeTeste, browser: Browser): Promise<string> {
  const ctx = await browser.newContext({ storageState: m.estado })
  try {
    const p: Page = await ctx.newPage()
    await p.goto(`/${slug}/fechamento`)
    const [arquivo] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Exportar CSV' }).click({ timeout: 30_000 })])
    const fs = await import('node:fs/promises')
    return (await fs.readFile((await arquivo.path())!, 'utf8')).replace(/^﻿/, '')
  } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`f75t${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString(), pix_taxa_pct: 1 }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const { data: primeira } = await db().from('maquininhas').select('id').eq('tenant_id', rede.tenantId).single<{ id: string }>()
  expect((await db().from('maquininhas').update({ taxas: { 'DEBIT_CARD:1': 2 } }).eq('id', primeira!.id)).error).toBeNull()
  const { data: stone, error } = await db().from('maquininhas')
    .insert({ tenant_id: rede.tenantId, nome: 'Stone', ordem: 1, taxas: { 'DEBIT_CARD:1': 3 }, prazo_dias: 1 })
    .select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const agora = new Date().toISOString()
  const base = { branch_id: rede.branchId, type: 'INCOME', category: 'Atendimento', is_paid: true, paid_at: agora, created_by: 'e2e' }
  expect((await db().from('financial_transactions').insert([
    { ...base, description: `Débito na Maquininha ${marca}`, amount: 100, payment_method: 'DEBIT_CARD', maquininha_id: primeira!.id },
    { ...base, description: `Débito na Stone ${marca}`, amount: 200, payment_method: 'DEBIT_CARD', maquininha_id: stone!.id },
    { ...base, description: `Pix ${marca}`, amount: 50, payment_method: 'PIX' },
  ])).error).toBeNull()
  dona = await criarMembro(`f75td${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  recepcao = await criarMembro(`f75tr${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção', permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  await dona?.limpar(); await recepcao?.limpar(); await rede?.limpar()
})

test('A28: o CSV do Fechamento traz a taxa e o líquido de cada maquininha a quem vê o financeiro', async ({ browser }) => {
  test.setTimeout(120_000)
  const texto = await csvDe(dona!, browser)
  const linhas = texto.split('\r\n')
  expect(linhas).toContain('Taxa e líquido por maquininha (estimados)')
  expect(linhas).toContain('Maquininha;Bruto;Taxa;Líquido')
  expect(linhas).toContain('Maquininha;100,00;2,00;98,00')
  expect(linhas).toContain('Stone;200,00;6,00;194,00')
  expect(linhas).toContain('Pix;50,00;0,50;49,50')
})

test('A28 e D7: quem só recebe exporta o Fechamento sem a taxa nem o líquido', async ({ browser }) => {
  test.setTimeout(120_000)
  const texto = await csvDe(recepcao!, browser)
  expect(texto).toContain('Fechamento do dia')
  expect(texto).not.toContain('Taxa e líquido por maquininha')
})
