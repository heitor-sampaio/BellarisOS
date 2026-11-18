import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A33 da 20ª simulação (2026-11-17): o relatório de Estoque não mostrava a
 * transferência entre unidades — só a Auditoria. Agora Relatórios → Estoque
 * tem "Transferências entre unidades": o que saiu e o que entrou em cada
 * unidade, ao custo do lote que saiu (`metrics_transferencias_de_estoque`).
 *
 * Numa rede [e2e] própria, com duas unidades; quem olha tem os Relatórios
 * (aba Estoque) e "A rede inteira".
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let quemVe: MembroDeTeste | null = null
let bairro = ''
let produto = ''
const CENTRO = `${PREFIXO} Centro ${marca}`
const BAIRRO = `${PREFIXO} Bairro ${marca}`
const PRODUTO = `Gel tr${marca}`

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quemVe!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`tr${marca}`)
  expect((await db().from('branches').update({ name: CENTRO }).eq('id', rede.branchId)).error).toBeNull()
  const b = await db().from('branches').insert({ tenant_id: rede.tenantId, name: BAIRRO, slug: `e2e-tr-bairro-${marca}` }).select('id').single<{ id: string }>()
  expect(b.error).toBeNull()
  bairro = b.data!.id
  const p = await db().from('products').insert({ tenant_id: rede.tenantId, name: `${PREFIXO} ${PRODUTO}`, unit: 'un' }).select('id').single<{ id: string }>()
  expect(p.error).toBeNull()
  produto = p.data!.id
  const e = await db().rpc('estoque_entrada', {
    p_produto: produto, p_unidade: rede.branchId, p_quantidade: 10, p_custo: 25, p_observacao: 'e2e', p_lote: null, p_validade: null, p_autor: 'e2e',
  })
  expect(e.error).toBeNull()
  quemVe = await criarMembro(`trv${marca}`, {
    tenant: rede.tenantId, rotulo: 'Relatórios', permissoes: [{ modulo: 'reports', nivel: 'VIEW' }, { modulo: 'stock', nivel: 'VIEW' }],
  })
  const aba = await db().from('role_report_tabs').insert({ tenant_id: rede.tenantId, role_id: quemVe.roleId, tab: 'estoque' })
  expect(aba.error).toBeNull()
})

test.afterAll(async () => {
  if (quemVe) await db().from('role_report_tabs').delete().eq('role_id', quemVe.roleId)
  await quemVe?.limpar(); await rede?.limpar()
})

test('A33: a transferência aparece no relatório de Estoque — saiu do Centro, entrou no Bairro, com o custo', async ({ browser }) => {
  const t = await db().rpc('estoque_transferir', {
    p_produto: produto, p_origem: rede!.branchId, p_destino: bairro, p_quantidade: 4, p_observacao: null, p_autor: 'e2e',
  })
  expect(t.error).toBeNull()

  // O número vem do banco: 4 un a R$ 25 = R$ 100, nas duas pontas.
  const { data, error } = await db().rpc('metrics_transferencias_de_estoque', {
    p_tenant: rede!.tenantId, p_branch_ids: null,
    p_from: new Date(Date.now() - 86_400_000).toISOString(), p_to: new Date(Date.now() + 86_400_000).toISOString(),
  })
  expect(error).toBeNull()
  const totais = Object.fromEntries((data as { branch_id: string; direcao: string; product_id: string | null; custo: number }[])
    .filter(l => !l.product_id).map(l => [`${l.branch_id === bairro ? 'Bairro' : 'Centro'} ${l.direcao}`, Number(l.custo)]))
  expect(totais).toEqual({ 'Centro SAIU': 100, 'Bairro ENTROU': 100 })

  await como(browser, async p => {
    await p.goto('/admin/reports?tab=estoque&period=today')
    const secao = p.locator('[data-transferencias]')
    await expect(secao).toContainText('Transferências entre unidades', { timeout: 30_000 })
    await expect(secao).toContainText(`Saiu para ${BAIRRO}`)
    await expect(secao).toContainText(`Entrou de ${CENTRO}`)
    await expect(secao).toContainText(PRODUTO)
    await expect(secao).toContainText('R$ 100,00')
  })
})
