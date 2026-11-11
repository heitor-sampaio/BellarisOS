import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { responderAnamnese } from './apoio/anamnese'

/**
 * Os defeitos do plano de tratamento da 12ª simulação (2026-11-10/11, a
 * Cláudia e a Bianca da [sim] Clínica Acácia), numa rede [e2e] própria:
 *
 * - D4: o plano cancelado reabria como rascunho editável ("Nova sessão",
 *   "Adicionar procedimento", lixeiras e preços), sem o motivo e sem o que foi
 *   devolvido e o que ficou. `isPlanLocked` travava só o proposto, o fechado e o
 *   concluído.
 * - D5: cancelar gravava, e a tela continuava "Fechado e pago" com o botão
 *   "Cancelar plano" — só recarregando aparecia "Cancelado".
 * Princípio 3: o cancelado é um retrato, só leitura, com a data, o motivo e o
 * dinheiro; e a tela relê o plano ao cancelar.
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let gestor: MembroDeTeste
let slug = ''
let clienteId = ''

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** O plano FECHADO e pago no Pix: duas sessões de R$ 100, nenhuma feita. */
async function planoFechadoEPago(rotulo: string): Promise<string> {
  const b = db()
  const { data: pl, error } = await b.from('treatment_plans').insert({
    branch_id: rede.branchId, client_id: clienteId, professional_id: rede.professionalId,
    status: 'ACCEPTED', name: `${PREFIXO} ${rotulo} ${marca}`, aceito_em: new Date().toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error, 'criar o plano').toBeNull()
  const { data: sessoes, error: eS } = await b.from('treatment_plan_sessions').insert([0, 1].map(i => ({ plan_id: pl!.id, sort_order: i }))).select('id')
  expect(eS).toBeNull()
  expect((await b.from('treatment_plan_session_procedures').insert(sessoes!.map(s => ({ session_id: s.id, procedure_id: rede.procedureId, price: 100, sort_order: 0 })))).error).toBeNull()
  expect((await b.from('financial_transactions').insert({
    branch_id: rede.branchId, client_id: clienteId, treatment_plan_id: pl!.id, type: 'INCOME', category: 'Serviços',
    description: 'Plano de tratamento', created_by: 'e2e', amount: 200, payment_method: 'PIX', is_paid: true, paid_at: new Date().toISOString(),
  })).error, 'o pagamento do plano').toBeNull()
  return pl!.id
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`pl12${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await b.from('users').update({ atende_em: [rede.branchId], provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  clienteId = await rede.criarCliente('Patricia')
  await responderAnamnese(clienteId, rede.tenantId)
  // Quem cancela (o Financeiro em Gerenciar) e também monta plano (o Prontuário em
  // Gerenciar): é quem via o editor aberto no plano cancelado.
  gestor = await criarMembro(`pl12g${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestao',
    permissoes: [
      { modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' },
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'medical_records', nivel: 'MANAGE' }, { modulo: 'procedures', nivel: 'MANAGE' },
    ],
  })
})

test.afterAll(async () => {
  await gestor?.limpar()
  await rede?.limpar()
})

test('D5 e D4: cancelar relê o plano na hora, e o cancelado é só leitura, com a data, o motivo e o dinheiro', async ({ browser }) => {
  const plano = await planoFechadoEPago('Plano laser')
  await como(browser, gestor, async p => {
    await p.goto(`/${slug}/planejamentos/${plano}`)
    await p.locator('[data-cancelar-plano]').click()
    const dlg = p.getByRole('dialog', { name: 'Cancelar plano' })
    await expect(dlg.locator('[data-conta-do-cancelamento]')).toBeVisible()
    await dlg.getByLabel('Motivo do cancelamento *').fill('Mudou de cidade')
    await dlg.getByRole('radio', { name: /Crédito na clínica/ }).check()
    await dlg.getByRole('button', { name: 'Cancelar plano' }).click()
    await expect(dlg).toBeHidden()

    // D5: sem recarregar, a tela já é a do cancelado.
    const retrato = p.locator('[data-retrato-do-cancelamento]')
    await expect(retrato).toBeVisible()
    await expect(retrato).toContainText('Mudou de cidade')
    await expect(retrato).toContainText('R$ 200,00 em crédito na clínica')
    await expect(p.locator('[data-cancelar-plano]')).toHaveCount(0)
    await expect(p.getByText('Cancelado', { exact: true }).first()).toBeVisible()

    // D4: recarregado, continua só leitura — nada de editar o plano cancelado.
    await p.reload()
    await expect(p.locator('[data-retrato-do-cancelamento]')).toContainText('Mudou de cidade')
    await expect(p.getByRole('button', { name: /Nova sessão/ })).toHaveCount(0)
    await expect(p.getByRole('button', { name: /Adicionar procedimento/ })).toHaveCount(0)
    await expect(p.getByRole('button', { name: /Aceitar plano/ })).toHaveCount(0)
  })
})
