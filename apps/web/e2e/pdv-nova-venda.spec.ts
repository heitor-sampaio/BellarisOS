import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { euVendi, pagoNoPix } from './apoio/vender'

/**
 * A venda nova no PDV (a revisão do Heitor, 2026-11-13 — PDV2, PDV5, PDV6 e
 * PDV7 do plano de adaptação, `docs/revisao.md`).
 *
 * O Heitor: "E pelo PDV daí também dá para vender o que tiver de produto" e
 * "O vender da ficha sai e o do inbox ele pode sair, ele pode levar pro PDV,
 * tá? Porque só vende pelo PDV." Uma venda, uma comanda (PDV-P1).
 *
 * - "Nova venda": escolhe a cliente, o que vender (procedimento, pacote,
 *   produto, crédito na rede) e como paga — a venda é uma comanda.
 * - Toda venda (pela tela ou pela action) nasce com a comanda dela.
 * - A ficha não tem mais o "Vender"; a busca leva ao PDV com a cliente.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let balcao: MembroDeTeste | null = null
let slug = ''

async function como(m: MembroDeTeste, browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`pdvv${marca}`)
  expect((await db().from('procedures').update({ price: 200 }).eq('id', rede.procedureId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  balcao = await criarMembro(`pdvvb${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Balcão',
    permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' }],
  })
})
test.afterAll(async () => {
  if (!rede) return
  const b = db()
  const { data: vendas } = await b.from('procedure_sales').select('id').eq('tenant_id', rede.tenantId)
  const ids = (vendas ?? []).map(v => v.id as string)
  if (ids.length) {
    await b.from('financial_transactions').update({ procedure_sale_id: null }).in('procedure_sale_id', ids)
    await b.from('commission_lines').update({ procedure_sale_id: null }).in('procedure_sale_id', ids)
    await b.from('procedure_sales').delete().in('id', ids)
  }
  await balcao?.limpar()
  await rede.limpar()
})

test('PDV2/PDV5: a "Nova venda" escolhe a cliente, vende e a venda vira uma comanda paga', async ({ browser }) => {
  const cliente = await rede!.criarCliente(`Compra ${marca}`)
  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/pdv`)
    await p.getByRole('link', { name: 'Nova venda' }).click()
    const venda = p.getByRole('region', { name: 'Vender' })
    await venda.getByLabel('Cliente da venda').fill(`Compra ${marca}`)
    await venda.getByRole('button', { name: new RegExp(`Compra ${marca}`) }).click()
    await expect(venda.locator('[data-cliente-da-venda]')).toContainText(`Compra ${marca}`)

    await venda.getByLabel('Procedimento', { exact: true }).selectOption(rede!.procedureId)
    await venda.getByLabel('Quantidade').fill('2')
    await pagoNoPix(venda)
    await euVendi(venda)
    await venda.getByRole('button', { name: /^Vender por R\$\s400,00$/ }).click()
    // Quem tem a Agenda em Gerenciar ganha o "agendar a primeira agora" — aqui, não.
    const agendarAgora = venda.locator('[data-agendar-agora]')
    await expect(agendarAgora).toBeVisible()
    await agendarAgora.getByRole('button', { name: 'Cancelar' }).click()

    // Vendida, a comanda dela está nas pagas de hoje.
    await expect(p.getByRole('region', { name: 'Vender' })).toHaveCount(0)
    await p.getByRole('link', { name: 'Pagas hoje' }).click()
    const linha = p.locator('[data-lista-de-comandas] .pdv-linha', { hasText: `Compra ${marca}` })
    await expect(linha).toContainText('400,00')
    await expect(linha).toContainText('Paga')
  })
  const { data: comandas } = await db().from('comandas').select('origem, client_id, branch_id, procedure_sale_id, cancelada_em').eq('client_id', cliente)
  expect(comandas).toHaveLength(1)
  expect(comandas![0]).toMatchObject({ origem: 'VENDA', client_id: cliente, branch_id: rede!.branchId, cancelada_em: null })
  expect(comandas![0]!.procedure_sale_id).not.toBeNull()
})

test('PDV2: toda venda nasce com a comanda — o crédito na rede, pela action, também; parcelas não fazem outra', async ({ browser }) => {
  const cliente = await rede!.criarCliente(`Credito ${marca}`)
  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/pdv`)
    const r = await chamarAcao(p, 'actions/credito-na-clinica.ts', 'venderCredito', `/${slug}/pdv`, [cliente, rede!.branchId, '150', { forma: 'AVISTA', metodo: 'PIX' }, null])
    expect(r.status).toBe(200)
  })
  const { data: comandas } = await db().from('comandas').select('origem, credito_vendido_id').eq('client_id', cliente)
  expect(comandas).toHaveLength(1)
  expect(comandas![0]!.origem).toBe('VENDA')
  expect(comandas![0]!.credito_vendido_id).not.toBeNull()
})

test('PDV7: a venda abre no PDV com a cliente escolhida (?cliente=), e a ficha não tem mais o "Vender"', async ({ browser }) => {
  const cliente = await rede!.criarCliente(`Ficha ${marca}`)
  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/clients/${cliente}`)
    await expect(p.getByRole('heading', { name: new RegExp(`Ficha ${marca}`) }).first()).toBeVisible()
    await expect(p.getByRole('button', { name: 'Vender', exact: true })).toHaveCount(0)

    await p.goto(`/${slug}/pdv?nova=1&cliente=${cliente}`)
    const venda = p.getByRole('region', { name: 'Vender' })
    await expect(venda.locator('[data-cliente-da-venda]')).toContainText(`Ficha ${marca}`)
    await expect(venda.getByRole('button', { name: 'Crédito na rede', exact: true })).toBeVisible()
  })
})

test('F33/PDV7: na rede, a "Nova venda" sem a unidade pergunta em qual; trocar a unidade leva a venda junto; a arquivada diz por quê', async ({ browser }) => {
  const outra = (await db().from('branches').insert({ tenant_id: rede!.tenantId, name: `Outra ${marca}`, slug: `e2e-pdvv2-${marca}` })
    .select('id').single<{ id: string }>()).data!.id
  const daRede = await criarMembro(`pdvvr${marca}`, {
    tenant: rede!.tenantId, branchId: null, rotulo: 'Balcão da rede',
    permissoes: [{ modulo: 'clients', nivel: 'VIEW' }, { modulo: 'cashier', nivel: 'MANAGE' }],
  })
  try {
    const cliente = await rede!.criarCliente(`Troca ${marca}`)
    const arquivada = await rede!.criarCliente(`Arquivada ${marca}`)
    expect((await db().from('clients').update({ is_active: false }).eq('id', arquivada)).error).toBeNull()
    await como(daRede, browser, async p => {
      // O inbox e a busca chegam sem a unidade: a venda pergunta antes.
      await p.goto(`/admin/pdv?nova=1&cliente=${cliente}`)
      const venda = p.getByRole('region', { name: 'Vender' })
      await expect(venda.locator('[data-unidade-da-venda]')).toContainText('Em qual unidade')
      await expect(venda.locator('[data-cliente-da-venda]')).toHaveCount(0)
      await venda.getByRole('button', { name: `Outra ${marca}` }).click()
      await expect(venda.locator('[data-cliente-da-venda]')).toContainText(`Troca ${marca}`)
      await expect(p).toHaveURL(new RegExp(`unidade=${outra}`))

      // Trocar a unidade no topo leva a venda (e a cliente) junto.
      await p.locator('.seg-desktop').getByRole('button', { name: new RegExp(`Unidade pdvv${marca}`) }).click()
      await expect(p.getByRole('region', { name: 'Vender' }).locator('[data-cliente-da-venda]')).toContainText(`Troca ${marca}`)
      await expect(p).toHaveURL(new RegExp(`unidade=${rede!.branchId}`))

      // A arquivada: a tela diz por quê, não volta calada à busca.
      await p.goto(`/admin/pdv?unidade=${rede!.branchId}&nova=1&cliente=${arquivada}`)
      await expect(p.getByRole('region', { name: 'Vender' }).getByRole('alert')).toContainText('arquivada')
    })
  } finally {
    await daRede.limpar()
  }
})
