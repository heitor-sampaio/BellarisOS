import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { haMinutosHoje } from './apoio/datas'

/**
 * O PDV na 19ª simulação (a regra em `docs/regras/vendas-financeiro.md`, PDV):
 *
 * - D1: a comanda da venda estornada de dentro dela e recebida de novo vale o
 *   vendido UMA vez (dizia R$ 2.000,00 do pacote de R$ 1.000 — somava o
 *   lançamento estornado e o reaberto), e diz o estorno de antes.
 * - A1: a comanda paga diz a bandeira ("Crédito Mastercard 3x").
 * - A2: depois de "Receber", a tela diz o que recebeu e onde a comanda está.
 */

test.describe.configure({ mode: 'serial', timeout: 120_000 })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let balcao: MembroDeTeste | null = null
let slug = ''
let minutos = 5

async function como<T>(m: MembroDeTeste, browser: Browser, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** A comanda como o PDV a lê (a função do banco), do dia de hoje. */
async function comandaNoBanco(id: string) {
  const { data, error } = await db().rpc('pdv_comandas', {
    p_tenant: rede!.tenantId, p_branch: rede!.branchId, p_situacao: 'TODAS',
    p_de: new Date(Date.now() - 86_400_000).toISOString(), p_ate: new Date(Date.now() + 86_400_000).toISOString(),
  })
  expect(error, 'ler as comandas').toBeNull()
  return (data as { id: string; valor: number; recebido: number; em_aberto: number; estorno_anterior: unknown }[]).find(c => c.id === id)!
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`p19${marca}`)
  expect((await db().from('procedures').update({ price: 200 }).eq('id', rede.procedureId)).error).toBeNull()
  expect((await db().from('users').update({ branch_id: rede.branchId, provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  balcao = await criarMembro(`p19b${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Balcão',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' },
      { modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'procedures', nivel: 'MANAGE' }],
  })
})
test.afterAll(async () => {
  await balcao?.limpar()
  await rede?.limpar()
})

test('D1/A1: a venda estornada e recebida de novo vale o vendido uma vez, diz o estorno e a bandeira', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Estorno da venda')
  const comanda = await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/pdv`)
    const r = await chamarAcao(p, 'actions/pre-pago.ts', 'venderProcedimento', `/${slug}/pdv`, [
      cliente, rede!.procedureId, rede!.branchId, 1, null, { forma: 'AVISTA', metodo: 'DEBIT_CARD', bandeira: 'VISA' }, null, null, null,
    ])
    const venda = r.texto.match(/"saleId":"([0-9a-f-]{36})"/)?.[1]
    expect(venda, `a venda à vista passou: ${r.texto.slice(0, 300)}`).toBeTruthy()
    return (await db().from('comandas').select('id').eq('procedure_sale_id', venda!).single<{ id: string }>()).data!.id
  })
  const pago = (await db().from('financial_transactions').select('id').eq('client_id', cliente).eq('type', 'INCOME')
    .single<{ id: string }>()).data!
  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/financeiro`)
    await chamarAcao(p, 'actions/financial.ts', 'reverseTransaction', `/${slug}/financeiro`, [pago.id, slug, 'Cobrou na forma errada'])
  })
  expect((await db().from('financial_transactions').select('id').eq('estorno_de', pago.id)).data, 'estornou').toHaveLength(1)
  // Estornada: a comanda volta a ter os R$ 200,00 a receber — e vale R$ 200,00, não R$ 400,00.
  const aReceber = await comandaNoBanco(comanda)
  expect(Number(aReceber.valor), 'a comanda a receber vale o vendido').toBe(200)
  expect(Number(aReceber.em_aberto)).toBe(200)
  expect(aReceber.estorno_anterior, 'a comanda da venda leva o estorno de antes').not.toBeNull()
  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/pdv?ver=PAGAS&comanda=${comanda}`)
    await expect(p.locator('[data-estorno-da-venda]')).toContainText(/Estornada às \d{2}:\d{2} — R\$\s200,00, Débito: o valor voltou a receber\./)
  })

  const reaberta = (await db().from('financial_transactions').select('id').eq('client_id', cliente).eq('type', 'INCOME')
    .eq('is_paid', false).single<{ id: string }>()).data!
  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/pdv`)
    const r = await chamarAcao(p, 'actions/pdv.ts', 'receberParcelaNoPdv', `/${slug}/pdv`,
      [reaberta.id, slug, { forma: 'CREDIT_CARD', vezes: 3, bandeira: 'MASTERCARD' }])
    expect(r.texto, 'recebeu de novo').toMatch(/"ok":true/)
  })
  const recebida = await comandaNoBanco(comanda)
  expect(Number(recebida.valor), 'recebida de novo, a comanda vale o vendido UMA vez').toBe(200)
  expect(Number(recebida.recebido)).toBe(200)
  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/pdv?ver=PAGAS&comanda=${comanda}`)
    const paga = p.locator('[data-comanda-paga]')
    // A1: a forma de agora, com a bandeira.
    await expect(paga).toContainText(/Crédito Mastercard 3x/)
    await expect(paga).toContainText(/R\$\s200,00\s*recebidos/)
    await expect(p.locator('[data-estorno-da-venda]')).toContainText(/Recebida de novo depois do estorno das \d{2}:\d{2} \(R\$\s200,00, Débito\)\./)
    await expect(p.getByText(/R\$\s400,00/)).toHaveCount(0)
  })
})

test('A2: depois de "Receber", a tela diz o recebido e que a comanda está em "Fechadas hoje"', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Recebida agora')
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    status: 'IN_PROGRESS', source: 'INTERNAL', duration_min: 30, price: 180,
    scheduled_at: haMinutosHoje(minutos += 2), started_at: new Date().toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error, 'iniciar o atendimento').toBeNull()
  const comanda = (await db().from('comandas').select('id').eq('appointment_id', data!.id).single<{ id: string }>()).data!.id
  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/pdv?comanda=${comanda}`)
    const detalhe = p.locator('[data-comanda-aberta]')
    await detalhe.getByRole('radio', { name: 'Pix' }).click()
    await detalhe.getByRole('button', { name: /Receber R\$\s?180,00/ }).click()
    await expect(p.locator(`[data-lista-de-comandas] [data-comanda="${comanda}"]`)).toHaveCount(0)
    await expect(p.locator('[data-recebida-agora]'))
      .toContainText(/Recebido R\$\s180,00 \(Pix\)\. A comanda saiu das abertas e está em “Fechadas hoje”\./)
  })
})
