import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * C3 do levantamento das regras (F63): actions de LEITURA que respondiam sem
 * conferir a permissão. Esconder na tela não basta — todo export de
 * `'use server'` se chama direto, e a resposta vai inteira ao navegador.
 *
 * - `findProductByBarcode` mandava o custo do produto a qualquer membro;
 * - `lookupClientByCpf` dizia de quem é um CPF a qualquer membro;
 * - as taxas da maquininha iam a todo "quem recebe" — e a D7 (o Heitor, 2ª
 *   volta) é que só quem vê o financeiro de todos vê a taxa. Quem só recebe
 *   continua sabendo SE a taxa está cadastrada (o aviso "sai sem desconto").
 *
 * Numa rede [e2e] própria: as taxas dela são só deste teste.
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
const CODIGO = `789${Date.now().toString().slice(-10)}`
const CPF = `9${Date.now().toString().slice(-10)}`
let rede: OutraRede
let dona: MembroDeTeste
let semNada: MembroDeTeste
let caixa: MembroDeTeste
let cliente = ''

async function como<T>(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<T>): Promise<T> {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`rsp${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  const produto = await rede.criarProduto('Seringa')
  expect((await db().from('products').update({ barcode: CODIGO, cost_price: 12.34 }).eq('id', produto)).error).toBeNull()
  cliente = await rede.criarCliente('Com CPF')
  expect((await db().from('clients').update({ document: CPF }).eq('id', cliente)).error).toBeNull()
  expect((await db().from('payment_fees').insert([
    { tenant_id: rede.tenantId, metodo: 'CREDIT_CARD', parcelas: 3, taxa_pct: 7.77 },
    { tenant_id: rede.tenantId, metodo: 'DEBIT_CARD', parcelas: 1, taxa_pct: 1.99 },
  ])).error).toBeNull()
  expect((await db().from('tenants').update({ cartao_por_bandeira: { ELO: { prazo: 47, taxas: { 'CREDIT_CARD:3': 8.88 } } } })
    .eq('id', rede.tenantId)).error).toBeNull()

  dona = await criarMembro(`rspd${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  semNada = await criarMembro(`rspn${marca}`, {
    tenant: rede.tenantId, rotulo: 'Agenda', permissoes: [{ modulo: 'agenda', nivel: 'VIEW', escopo: 'ALL' }],
  })
  caixa = await criarMembro(`rspc${marca}`, {
    tenant: rede.tenantId, rotulo: 'Caixa', permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  await dona?.limpar(); await semNada?.limpar(); await caixa?.limpar()
  if (rede) await db().from('payment_fees').delete().eq('tenant_id', rede.tenantId)
  await rede?.limpar()
})

test('o código de barras não manda o custo a quem não dá entrada no estoque', async ({ browser }) => {
  const rota = '/admin/estoque'
  const controle = await como(browser, dona, async p => { await p.goto(rota); return chamarAcao(p, 'actions/stock.ts', 'findProductByBarcode', rota, [CODIGO]) })
  expect(controle.texto, 'o controle: a dona acha o produto, com o custo').toContain('12.34')
  const r = await como(browser, semNada, p => chamarAcao(p, 'actions/stock.ts', 'findProductByBarcode', rota, [CODIGO]))
  expect(r.texto).not.toContain('12.34')
  expect(r.texto).not.toContain('cost_price')
})

test('o CPF não diz de quem é a quem não edita clientes', async ({ browser }) => {
  const rota = `/admin/clients/${cliente}`
  const controle = await como(browser, dona, async p => { await p.goto(rota); return chamarAcao(p, 'actions/clients.ts', 'lookupClientByCpf', rota, [CPF, '00000000-0000-0000-0000-000000000000']) })
  expect(controle.texto, 'o controle: a dona vê que o CPF já existe').toContain('"found":true')
  const r = await como(browser, semNada, p => chamarAcao(p, 'actions/clients.ts', 'lookupClientByCpf', rota, [CPF, '00000000-0000-0000-0000-000000000000']))
  expect(r.texto).toContain('"found":false')
  expect(r.texto).not.toContain('Com CPF')
})

test('a taxa da maquininha não vai a quem só recebe (D7) — só se ela está cadastrada', async ({ browser }) => {
  const rota = '/admin/financeiro'
  const acoes = ['taxasDoCartaoDeCredito', 'taxaDoDebito', 'cartaoPorBandeiraDaRede'] as const
  const pela = (m: MembroDeTeste) => como(browser, m, async p => {
    if (m === dona) await p.goto(rota)
    const saida: Record<string, string> = {}
    for (const a of acoes) saida[a] = (await chamarAcao(p, 'actions/comissoes.ts', a, rota, [])).texto
    return saida
  })
  const controle = await pela(dona)
  expect(controle.taxasDoCartaoDeCredito, 'o controle: a dona vê a taxa de 3x').toContain('7.77')
  expect(controle.taxaDoDebito).toContain('1.99')
  expect(controle.cartaoPorBandeiraDaRede).toContain('8.88')

  const r = await pela(caixa)
  for (const n of ['7.77', '1.99', '8.88', '"prazo"']) {
    expect(Object.values(r).join('\n'), `${n} chegou ao caixa`).not.toContain(n)
  }
  // Mas sabe QUAIS estão cadastradas: é o que decide o aviso "sai sem desconto".
  expect(r.taxasDoCartaoDeCredito).toContain('"parcelas":3')
  expect(r.cartaoPorBandeiraDaRede).toContain('CREDIT_CARD:3')
})
