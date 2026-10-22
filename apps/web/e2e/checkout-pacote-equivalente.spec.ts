import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O checkout SUGERE o pacote equivalente (2026-10-21, decisão do Heitor):
 * "Quando as sessões do plano cabem num pacote ativo do catálogo, o checkout
 * mostra 'Fechar como pacote X: R$ … (economia de R$ …)' e troca com um
 * clique. O plano continua montado por procedimento." Na simulação foi
 * preciso digitar o desconto à mão.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let planId = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`pe${marca}`)
  await db().from('procedures').update({ price: 300 }).eq('id', rede.procedureId)
  const { data: b } = await db().from('procedures').insert({
    tenant_id: rede.tenantId, name: `${PREFIXO} Drenagem ${marca}`, category: 'e2e', duration_min: 30, price: 100,
  }).select('id').single<{ id: string }>()
  const procB = b!.id
  // 2× A + 2× B = R$ 800 no plano; o pacote faz por R$ 700.
  const { error: eP } = await db().rpc('pacote_salvar', {
    p_tenant: rede.tenantId, p_id: null, p_nome: `${PREFIXO} Pacote ${marca}`, p_preco: 700, p_validade: null, p_ativo: true,
    p_itens: [{ procedure_id: rede.procedureId, quantity: 2 }, { procedure_id: procB, quantity: 2 }],
  })
  expect(eP).toBeNull()
  const cliente = await rede.criarCliente('Pacote')
  const { data: pl } = await db().from('treatment_plans').insert({
    branch_id: rede.branchId, professional_id: rede.professionalId, client_id: cliente, status: 'PROPOSED', name: `${PREFIXO} Plano ${marca}`,
  }).select('id').single<{ id: string }>()
  planId = pl!.id
  const { data: s } = await db().from('treatment_plan_sessions').insert([0, 1, 2, 3].map(i => ({ plan_id: planId, sort_order: i }))).select('id, sort_order')
  const ss = (s ?? []).sort((x, y) => x.sort_order - y.sort_order)
  await db().from('treatment_plan_session_procedures').insert([
    { session_id: ss[0]!.id, procedure_id: rede.procedureId, price: 300, sort_order: 0 },
    { session_id: ss[1]!.id, procedure_id: rede.procedureId, price: 300, sort_order: 0 },
    { session_id: ss[2]!.id, procedure_id: procB, price: 100, sort_order: 0 },
    { session_id: ss[3]!.id, procedure_id: procB, price: 100, sort_order: 0 },
  ])
  gestor = await criarMembro(`peg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção',
    permissoes: [
      { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'medical_records', nivel: 'VIEW' }, { modulo: 'procedures', nivel: 'VIEW' },
    ],
  })
})
test.afterAll(async () => {
  if (rede) await db().from('service_packages').delete().eq('tenant_id', rede.tenantId)
  await gestor?.limpar(); await rede?.limpar()
})

test('o checkout sugere o pacote e aplica o preço dele como desconto', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/admin/checkout/${planId}`)
    await p.getByRole('button', { name: 'Confirmar plano' }).click()
    const sugestao = p.locator('[data-pacote-equivalente]')
    await expect(sugestao).toContainText(`Pacote ${marca}`)
    await expect(sugestao).toContainText('700,00')
    await expect(sugestao).toContainText('economia de R$')
    await expect(sugestao).toContainText('100,00')
    await sugestao.getByRole('button', { name: 'Fechar como pacote' }).click()
    await expect(p.locator('[data-campo-desconto] input')).toHaveValue('100,00')
    await expect(sugestao).toContainText('Preço do pacote aplicado')
  })
})
