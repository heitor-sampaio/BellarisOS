import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
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
 *   produto, crédito interno) e como paga — a venda é uma comanda.
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
    await p.getByRole('link', { name: 'Fechadas hoje' }).click()
    const linha = p.locator('[data-lista-de-comandas] .pdv-linha', { hasText: `Compra ${marca}` })
    await expect(linha).toContainText('400,00')
    await expect(linha).toContainText('Paga')
  })
  const { data: comandas } = await db().from('comandas').select('origem, client_id, branch_id, procedure_sale_id, cancelada_em').eq('client_id', cliente)
  expect(comandas).toHaveLength(1)
  expect(comandas![0]).toMatchObject({ origem: 'VENDA', client_id: cliente, branch_id: rede!.branchId, cancelada_em: null })
  expect(comandas![0]!.procedure_sale_id).not.toBeNull()
})

test('PDV2: toda venda nasce com a comanda — o crédito interno, pela action, também; parcelas não fazem outra', async ({ browser }) => {
  const cliente = await rede!.criarCliente(`Credito ${marca}`)
  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/pdv`)
    const r = await chamarAcao(p, 'actions/credito-interno.ts', 'venderCredito', `/${slug}/pdv`, [cliente, rede!.branchId, '150', { forma: 'AVISTA', metodo: 'PIX' }, null])
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
    await expect(venda.getByRole('button', { name: 'Crédito interno', exact: true })).toBeVisible()
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

/**
 * O troco no dinheiro (vendas-financeiro.md; o Heitor, 18/11: "ok"): ao
 * receber em DINHEIRO, toda tela que recebe pede o "Valor entregue"
 * (opcional) e mostra o troco; o entregue menor avisa e não deixa confirmar.
 * O que se grava é o valor do pagamento — o caixa conta o recebido, não o
 * entregue (o entregue não se guarda: decisão do Claude, princípio 7).
 * Na mesma rede [e2e] desta venda, com quem tem também o Financeiro (a baixa).
 */
test.describe('o troco no dinheiro', () => {
  let caixa: MembroDeTeste | null = null
  const daquiA = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString()

  test.beforeAll(async () => {
    caixa = await criarMembro(`trocob${marca}`, {
      tenant: rede!.tenantId, branchId: rede!.branchId, rotulo: 'Caixa',
      permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE' }],
    })
  })
  test.afterAll(async () => { await caixa?.limpar() })

  test('Nova venda em dinheiro: o entregue menor trava, o maior diz o troco, e grava o valor da venda', async ({ browser }) => {
    const cliente = await rede!.criarCliente(`Troco ${marca}`)
    await como(caixa!, browser, async p => {
      await p.goto(`/${slug}/pdv?nova=1&cliente=${cliente}`)
      const venda = p.getByRole('region', { name: 'Vender' })
      await venda.getByLabel('Procedimento', { exact: true }).selectOption(rede!.procedureId)
      await euVendi(venda)
      // No Pix, nada de valor entregue.
      await venda.getByRole('radio', { name: 'Pix', exact: true }).click()
      await expect(venda.getByLabel('Valor entregue (opcional)')).toHaveCount(0)
      await venda.getByRole('radio', { name: 'Dinheiro', exact: true }).click()
      const entregue = venda.getByLabel('Valor entregue (opcional)')
      await expect(entregue).toBeVisible()
      const vender = venda.getByRole('button', { name: /^Vender por R\$\s200,00$/ })
      // Opcional: vazio, vende.
      await expect(vender).toBeEnabled()
      await entregue.fill('150')
      await expect(venda.locator('[data-entregue-menor]')).toContainText(/menor que os R\$\s200,00 em dinheiro: faltam R\$\s50,00/)
      await expect(vender, 'o entregue menor não deixa vender').toBeDisabled()
      await entregue.fill('250')
      await expect(venda.locator('[data-troco]')).toHaveText(/Troco: R\$\s50,00/)
      await expect(vender).toBeEnabled()
      await vender.click()
      await expect(p.getByRole('region', { name: 'Vender' })).toHaveCount(0)
    })
    const { data } = await db().from('financial_transactions').select('amount, payment_method, is_paid').eq('client_id', cliente)
    expect(data, 'um lançamento, do valor da venda — não do entregue').toEqual([{ amount: 200, payment_method: 'CASH', is_paid: true }])
  })

  test('A parcela no PDV e a baixa no Financeiro: o mesmo campo e a mesma trava', async ({ browser }) => {
    const cliente = await rede!.criarCliente(`TrocoParcela ${marca}`)
    const { data: txs } = await db().from('financial_transactions').insert([
      { branch_id: rede!.branchId, client_id: cliente, type: 'INCOME', category: 'Serviços', description: `${PREFIXO} parcela ${marca} — parcela 1/2`,
        amount: 120, is_paid: false, due_date: daquiA(10), parcela_numero: 1, parcela_total: 2, created_by: 'e2e' },
      { branch_id: rede!.branchId, client_id: cliente, type: 'INCOME', category: 'Serviços', description: `${PREFIXO} baixa ${marca}`,
        amount: 80, is_paid: false, due_date: daquiA(5), created_by: 'e2e' },
    ]).select('id, amount')
    expect(txs).toHaveLength(2)
    await como(caixa!, browser, async p => {
      // A parcela no PDV.
      await p.goto(`/${slug}/pdv?nova=1&cliente=${cliente}`)
      const emAberto = p.getByRole('region', { name: 'Vender' }).locator('[data-em-aberto-da-cliente]')
      await emAberto.locator('[data-parcela-em-aberto]', { hasText: 'R$ 120,00' }).getByRole('button', { name: /Receber/ }).click()
      const janela = p.getByRole('dialog', { name: 'Receber a parcela' })
      await janela.getByRole('radio', { name: 'Dinheiro', exact: true }).click()
      await janela.getByLabel('Valor entregue (opcional)').fill('100')
      const receber = janela.getByRole('button', { name: /^Receber R\$\s120,00$/ })
      await expect(receber).toBeDisabled()
      await janela.getByLabel('Valor entregue (opcional)').fill('120')
      await expect(janela.locator('[data-troco]')).toHaveText('Sem troco.')
      await expect(receber).toBeEnabled()
      await janela.getByRole('button', { name: 'Cancelar' }).click()

      // A baixa no Financeiro (o "Receber" da lista).
      await p.goto(`/${slug}/financeiro?aba=a-receber`)
      await p.locator('tr', { hasText: `baixa ${marca}` }).getByRole('button', { name: 'Receber', exact: true }).click()
      const baixa = p.getByRole('dialog', { name: 'Receber' })
      await baixa.getByRole('radio', { name: 'Dinheiro', exact: true }).click()
      await baixa.getByLabel('Valor entregue (opcional)').fill('50')
      await expect(baixa.getByRole('button', { name: 'Confirmar recebimento' })).toBeDisabled()
      await baixa.getByLabel('Valor entregue (opcional)').fill('100')
      await expect(baixa.locator('[data-troco]')).toHaveText(/Troco: R\$\s20,00/)
      await baixa.getByRole('button', { name: 'Confirmar recebimento' }).click()
      await expect(baixa).toHaveCount(0)
    })
    const baixa = txs!.find(t => Number(t.amount) === 80)!
    const { data } = await db().from('financial_transactions').select('amount, is_paid, payment_method').eq('id', baixa.id).single()
    expect(data).toMatchObject({ amount: 80, is_paid: true, payment_method: 'CASH' })
  })
})
