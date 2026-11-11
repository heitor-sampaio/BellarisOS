import { test, expect, type Page, type Browser } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { addDaysTZ, dayKeyTZ } from '../lib/datetime'

/**
 * D10 da 12ª simulação (2026-11-10/11, a Helena da [sim] Clínica Margarida): o
 * "Quem receberia hoje" do Aniversário e do Pós-visita 7 dias dizia "12 clientes
 * no público" — o público inteiro —, quando ninguém fazia aniversário nem fez 7
 * dias da visita. A dona achou que a campanha ia sair para 12. Princípio 3: a
 * conta de hoje é a do GATILHO de hoje (a mesma escolha do cron), e o público
 * total fica numa linha à parte. Rede [e2e] própria, três clientes ativas.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let membro: MembroDeTeste
const campanhas: Record<string, string> = {}

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: membro.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`cp12${marca}`)
  const b = db()
  const hoje = dayKeyTZ(new Date())
  const outroDia = dayKeyTZ(addDaysTZ(new Date(), 40))
  // Uma aniversariante de hoje e duas de outro dia.
  const ana = await rede.criarCliente('Ana')
  const bia = await rede.criarCliente('Bia')
  const carla = await rede.criarCliente('Carla')
  expect((await b.from('clients').update({ birth_date: `1990-${hoje.slice(5)}` }).eq('id', ana)).error).toBeNull()
  for (const c of [bia, carla]) expect((await b.from('clients').update({ birth_date: `1988-${outroDia.slice(5)}` }).eq('id', c)).error).toBeNull()
  const base = { tenant_id: rede.tenantId, status: 'DRAFT', type: 'AUTOMATED', title: 'Oi', body: 'Mensagem', audience_rules: {} }
  const { data, error } = await b.from('notification_campaigns').insert([
    { ...base, name: `${PREFIXO} Aniversário ${marca}`, trigger_type: 'BIRTHDAY', trigger_config: null },
    { ...base, name: `${PREFIXO} Pós-visita ${marca}`, trigger_type: 'DAYS_AFTER_VISIT', trigger_config: { days: 7 } },
  ]).select('id, trigger_type')
  expect(error).toBeNull()
  for (const c of data ?? []) campanhas[c.trigger_type as string] = c.id as string
  membro = await criarMembro(`cp12m${marca}`, { tenant: rede.tenantId, rotulo: 'Marketing', permissoes: [{ modulo: 'marketing', nivel: 'MANAGE' }] })
})

test.afterAll(async () => {
  await db().from('notification_campaigns').delete().eq('tenant_id', rede.tenantId)
  await membro?.limpar(); await rede?.limpar()
})

test('D10: o Aniversário diz quem faz aniversário HOJE, e o público inteiro numa linha à parte', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/admin/notificacoes/${campanhas.BIRTHDAY}`)
    const hoje = p.locator('[data-receberiam-hoje]')
    await expect(hoje).toContainText('1 aniversariante hoje')
    await expect(p.locator('[data-quem-receberia-hoje] [data-testid="alcance-da-campanha"]')).toContainText('3 clientes no público', { timeout: 20_000 })
  })
})

test('D10: o Pós-visita 7 dias, sem ninguém que fez 7 dias da visita, diz que hoje não sai para ninguém', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/admin/notificacoes/${campanhas.DAYS_AFTER_VISIT}`)
    await expect(p.locator('[data-receberiam-hoje]')).toContainText('Hoje ninguém')
    await expect(p.locator('[data-receberiam-hoje]')).toContainText('7 dias')
  })
})
