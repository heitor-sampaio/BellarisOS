import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A50 da 8ª simulação (2026-11-06): a aba LGPD da clínica não mostrava o prazo
 * de resposta (a cliente via "até 21/11"), e, depois de liberar o prontuário,
 * o pedido ficava "Em preparo" sem data nenhuma. (A decisão 3 do Heitor —
 * revogar e pedir exclusão pelo app — é "mantem do jeito que tá": nada disso
 * aqui.) Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
const pedidos: string[] = []
const ddmmaaaa = (d: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(120_000)
  rede = await criarOutraRede(`lg8${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  dona = await criarMembro(`lg8d${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
  const esperando = await rede.criarCliente('Esperando')
  const liberada = await rede.criarCliente('Liberada')
  const pedidoEm = new Date(Date.now() - 2 * 86_400_000)
  const { data, error } = await db().from('lgpd_requests').insert([
    { tenant_id: rede.tenantId, client_id: esperando, type: 'export', status: 'completed', requested_at: pedidoEm.toISOString(),
      completed_at: pedidoEm.toISOString(), include_medical: true, medical_status: 'pending', requested_via: 'portal' },
    { tenant_id: rede.tenantId, client_id: liberada, type: 'export', status: 'processing', requested_at: pedidoEm.toISOString(),
      include_medical: true, medical_status: 'approved', medical_reviewed_at: new Date().toISOString(), requested_via: 'portal' },
  ]).select('id')
  expect(error).toBeNull()
  pedidos.push(...(data ?? []).map(r => r.id as string))
})

test.afterAll(async () => {
  if (pedidos.length) await db().from('lgpd_requests').delete().in('id', pedidos)
  await dona?.limpar()
  await rede?.limpar()
})

test('A50: a aba LGPD diz até quando responder, e o prontuário liberado diz quando', async ({ browser }) => {
  const prazo = ddmmaaaa(new Date(Date.now() - 2 * 86_400_000 + 15 * 86_400_000))
  await como(browser, dona!, async p => {
    await p.goto('/admin/settings?tab=lgpd')
    const esperando = p.locator('[data-pedido-lgpd]', { hasText: 'Esperando' })
    await expect(esperando.locator('[data-prazo-de-resposta]')).toContainText(`Responder até ${prazo} (15 dias do pedido)`)
    const liberada = p.locator('[data-pedido-lgpd]', { hasText: 'Liberada' })
    await expect(liberada.locator('[data-liberado-em]')).toContainText(`Prontuário liberado em ${ddmmaaaa(new Date())}`)
    await expect(liberada.locator('[data-liberado-em]')).toContainText('o pacote novo, com o prontuário, fica pronto em poucos minutos')
  })
})
