import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { clienteComSessao, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * J-65 das simulações, na exportação LGPD pelo app:
 * - `contaNoApp.ultimoAcesso` saía sempre nulo: nada gravava `last_app_login_at`;
 * - com o prontuário em análise, o cartão dizia "Pronto" ao lado de
 *   "Prontuário em análise", e o "Solicitar meus dados" reaparecia;
 * - o JSON vinha com campos técnicos e ids (branch_id, status COMPLETED,
 *   type INCOME, o id do pedido).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let cliente: ClienteDeTeste | null = null
let slug = ''

async function como(browser: Browser, quem: ClienteDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
async function jsonDoPacote(caminho: string) {
  const { data, error } = await db().storage.from('lgpd-exports').createSignedUrl(caminho, 60)
  expect(error, 'o pacote tem de estar no bucket').toBeNull()
  const r = await fetch(data!.signedUrl)
  expect(r.ok).toBe(true)
  return await r.json() as Record<string, unknown>
}
/** Toda chave do JSON, em qualquer nível. */
function chaves(v: unknown, saida: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach(x => chaves(x, saida))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { saida.push(k); chaves(x, saida) }
  return saida
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`lg${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  cliente = await clienteComSessao(`lgc${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  const { data: ag, error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente.clientId, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 120,
    scheduled_at: new Date(Date.now() - 3 * 86_400_000).toISOString(), completed_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  expect((await db().from('financial_transactions').insert({
    branch_id: rede.branchId, client_id: cliente.clientId, appointment_id: ag!.id, type: 'INCOME', category: 'Atendimento',
    description: '[e2e] Atendimento', amount: 120, payment_method: 'PIX', is_paid: true, paid_at: new Date().toISOString(), created_by: rede.professionalId,
  })).error).toBeNull()
})
test.afterAll(async () => {
  if (cliente) {
    const { data } = await db().from('lgpd_requests').select('export_json_path, export_pdf_path').eq('client_id', cliente.clientId)
    const caminhos = (data ?? []).flatMap(p => [p.export_json_path, p.export_pdf_path]).filter(Boolean) as string[]
    if (caminhos.length) await db().storage.from('lgpd-exports').remove(caminhos)
    await db().from('lgpd_requests').delete().eq('client_id', cliente.clientId)
    await db().from('financial_transactions').delete().eq('client_id', cliente.clientId)
  }
  if (rede) await db().from('appointments').delete().eq('branch_id', rede.branchId)
  await cliente?.limpar(); await rede?.limpar()
})

test.describe.serial('a exportação LGPD pelo app', () => {
  test('entrar no app grava o último acesso', async ({ browser }) => {
    await como(browser, cliente!, async p => { await p.goto(`/${slug}/cliente/home`) })
    await expect.poll(async () => (await db().from('clients').select('last_app_login_at').eq('id', cliente!.clientId).single()).data?.last_app_login_at)
      .not.toBeNull()
  })

  test('com o prontuário em análise, o cartão diz "Parte geral pronta" e não oferece pedir de novo', async ({ browser }) => {
    await como(browser, cliente!, async p => {
      await p.goto(`/${slug}/cliente/perfil`)
      await p.locator('input[name="include_medical"]').check()
      await p.getByRole('button', { name: 'Solicitar meus dados' }).click()
      await expect(p.getByText('Prontuário em análise').first()).toBeVisible()
    })
    await expect.poll(async () => {
      const { data } = await db().from('lgpd_requests').select('status, medical_status').eq('client_id', cliente!.clientId).single()
      return data ? `${data.status}|${data.medical_status}` : null
    }, { timeout: 30_000 }).toBe('completed|pending')

    await como(browser, cliente!, async p => {
      await p.goto(`/${slug}/cliente/perfil`)
      await expect(p.getByText('Parte geral pronta')).toBeVisible()
      await expect(p.getByText('Prontuário em análise')).toBeVisible()
      await expect(p.getByText('Pronto', { exact: true })).toHaveCount(0)
      await expect(p.getByRole('button', { name: 'Solicitar meus dados' })).toHaveCount(0)
      await expect(p.getByRole('button', { name: /Baixar relatório/ })).toBeVisible()
    })
  })

  test('o JSON é legível: sem ids, sem códigos, com o último acesso', async () => {
    const { data: pedido } = await db().from('lgpd_requests').select('export_json_path').eq('client_id', cliente!.clientId).single()
    const pacote = await jsonDoPacote(pedido!.export_json_path as string)
    const todas = chaves(pacote)
    expect(todas.filter(k => k === 'id' || /_id$/.test(k) || /_/.test(k)), 'nada de id nem nome de coluna').toEqual([])
    const texto = JSON.stringify(pacote)
    for (const codigo of ['"COMPLETED"', '"INCOME"', '"PIX"', '"INTERNAL"']) expect(texto, `sem o código ${codigo}`).not.toContain(codigo)
    const cadastro = pacote.cadastro as { contaNoApp: { ultimoAcesso: string | null } }
    expect(cadastro.contaNoApp.ultimoAcesso).not.toBeNull()
    const ag = (pacote.agendamentos as Record<string, unknown>[])[0]!
    expect(ag).toMatchObject({ situacao: 'Concluído', valor: 120, unidade: `[e2e] Unidade lg${marca}` })
    const tx = ((pacote.financeiro as { transacoes: Record<string, unknown>[] }).transacoes)[0]!
    expect(tx).toMatchObject({ tipo: 'Receita', formaDePagamento: 'Pix', situacao: 'Pago' })
  })
})
