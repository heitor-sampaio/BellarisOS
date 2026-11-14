import { test, expect, type Page, type Browser } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { addDaysTZ, partsInTZ } from '../lib/datetime'

/**
 * D10 da 12ª simulação (2026-11-10/11, a Helena da [sim] Clínica Margarida): o
 * "Quem receberia hoje" da campanha com gatilho dizia "12 clientes no público"
 * — o público inteiro —, quando o gatilho não escolhia ninguém hoje. A dona
 * achou que a campanha ia sair para 12. Princípio 3: a conta de hoje é a do
 * GATILHO de hoje (a mesma escolha do cron), e o público total fica numa
 * linha à parte.
 *
 * MK1 (2026-11-14): o aniversário e o pós-visita saíram da campanha (são
 * modelos nas Automações); o gatilho que ficou é a data de TODO ANO da
 * Agendada — a mesma regra, provada com ela. Rede [e2e] própria, três
 * clientes ativas.
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
  const hoje = partsInTZ(new Date())
  const outroDia = partsInTZ(addDaysTZ(new Date(), 40))
  for (const nome of ['Ana', 'Bia', 'Carla']) await rede.criarCliente(nome)
  const base = { tenant_id: rede.tenantId, status: 'DRAFT', type: 'SCHEDULED', trigger_type: 'ANNUAL_DATE', title: 'Oi', body: 'Mensagem', audience_rules: {} }
  const { data, error } = await b.from('notification_campaigns').insert([
    { ...base, name: `${PREFIXO} Hoje ${marca}`, trigger_config: { month: hoje.month, day: hoje.day } },
    { ...base, name: `${PREFIXO} Outro dia ${marca}`, trigger_config: { month: outroDia.month, day: outroDia.day } },
  ]).select('id, name')
  expect(error).toBeNull()
  for (const c of data ?? []) campanhas[(c.name as string).includes('Hoje') ? 'HOJE' : 'OUTRO'] = c.id as string
  membro = await criarMembro(`cp12m${marca}`, { tenant: rede.tenantId, rotulo: 'Marketing', permissoes: [{ modulo: 'marketing', nivel: 'MANAGE' }] })
})

test.afterAll(async () => {
  await db().from('notification_campaigns').delete().eq('tenant_id', rede.tenantId)
  await membro?.limpar(); await rede?.limpar()
})

test('D10: a de todo ano, no dia dela, diz quantas recebem HOJE, e o público inteiro numa linha à parte', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/admin/notificacoes/${campanhas.HOJE}`)
    await expect(p.locator('[data-receberiam-hoje]')).toContainText('Hoje é a data: 3 clientes no público')
    await expect(p.locator('[data-quem-receberia-hoje] [data-testid="alcance-da-campanha"]')).toContainText('3 clientes no público', { timeout: 20_000 })
  })
})

test('D10: a de todo ano, fora do dia dela, diz que hoje não sai', async ({ browser }) => {
  const dia = partsInTZ(addDaysTZ(new Date(), 40))
  const dd = (n: number) => String(n).padStart(2, '0')
  await como(browser, async p => {
    await p.goto(`/admin/notificacoes/${campanhas.OUTRO}`)
    await expect(p.locator('[data-receberiam-hoje]')).toContainText(`Hoje não é ${dd(dia.day)}/${dd(dia.month)}`)
  })
})
