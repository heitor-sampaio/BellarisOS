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
  // D2 da 33ª: o pedido cujo prontuário a rede NEGA (o pacote geral pronto, "em análise").
  const negada = await rede.criarCliente('Negada')
  const pedidoEm = new Date(Date.now() - 2 * 86_400_000)
  const { data, error } = await db().from('lgpd_requests').insert([
    { tenant_id: rede.tenantId, client_id: esperando, type: 'export', status: 'completed', requested_at: pedidoEm.toISOString(),
      completed_at: pedidoEm.toISOString(), include_medical: true, medical_status: 'pending', requested_via: 'portal' },
    { tenant_id: rede.tenantId, client_id: liberada, type: 'export', status: 'processing', requested_at: pedidoEm.toISOString(),
      include_medical: true, medical_status: 'approved', medical_reviewed_at: new Date().toISOString(), requested_via: 'portal' },
    { tenant_id: rede.tenantId, client_id: negada, type: 'export', status: 'completed', requested_at: pedidoEm.toISOString(),
      completed_at: pedidoEm.toISOString(), include_medical: true, medical_status: 'pending', requested_via: 'portal' },
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

/**
 * D2 da 33ª (LG-05, LG-07): negar o prontuário refaz o pacote, como liberar. O
 * pronto dizia "em análise — quando ela decidir, o arquivo é refeito", e o
 * negado ficava com ele. Agora o pedido volta a preparo, e o pacote novo sai
 * sem o prontuário, dizendo que a rede não o liberou.
 */
test('D2: negar o prontuário refaz o pacote, sem ele e dizendo por quê', async ({ browser }) => {
  test.setTimeout(90_000)
  const pedido = pedidos[2]!
  const decididoEm = Date.now()
  await como(browser, dona!, async p => {
    await p.goto('/admin/settings?tab=lgpd')
    const negada = p.locator('[data-pedido-lgpd]', { hasText: 'Negada' })
    await expect(async () => {
      const negar = negada.getByRole('button', { name: 'Negar' })
      if (await negar.isVisible()) await negar.click({ timeout: 1000 })
      await expect(negada.locator('[data-liberado-em]')).toContainText('Prontuário negado', { timeout: 2000 })
    }).toPass()
  })
  await expect.poll(async () => {
    const { data } = await db().from('lgpd_requests').select('status, medical_status, completed_at, export_json_path').eq('id', pedido).single()
    return data && data.export_json_path && new Date(data.completed_at as string).getTime() >= decididoEm - 1000
      ? `${data.status}|${data.medical_status}` : null
  }, { message: 'negar refaz o pacote em poucos minutos', timeout: 60_000 }).toBe('completed|denied')
  const { data: row } = await db().from('lgpd_requests').select('export_json_path').eq('id', pedido).single()
  const { data: assinado } = await db().storage.from('lgpd-exports').createSignedUrl(row!.export_json_path as string, 60)
  const pacote = await (await fetch(assinado!.signedUrl)).json() as { solicitacao: { prontuario?: string }; prontuario: unknown }
  expect(pacote.solicitacao.prontuario, 'o pedido diz que a rede não liberou').toBe('pedido — não liberado pela equipe')
  expect(String(pacote.prontuario), 'e o pacote já não diz "em análise"').not.toMatch(/em análise/)
})
