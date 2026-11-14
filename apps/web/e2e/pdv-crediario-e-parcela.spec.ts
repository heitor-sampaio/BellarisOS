import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { euVendi } from './apoio/vender'

/**
 * O PDV, fase 5a (o plano de adaptação, `docs/revisao.md`): PDV8 e o resto
 * do CX1.
 *
 * PDV8 — o Heitor, 13/11: "sempre tem que ter forma de pagamento, o crediario
 * é uma forma de pagamento, não existe pagamento sem forma de pagamento". O
 * Crediário é uma das formas, ao lado de Pix, Dinheiro, Débito, Crédito e
 * Crédito na rede: escolhido, a venda fica registrada como Crediário. Se
 * houver entrada, ela pede a forma dela. Sai o "sem entrada, não precisa" e o
 * "Meio de pagamento (opcional)" do "a receber". Quando o dinheiro entra (a
 * parcela no PDV ou a baixa no Financeiro), a forma é pedida, sempre.
 *
 * CX1 — "O PDV recebe toda comanda e também a parcela do crediário que a
 * cliente veio pagar: abrir a cliente no PDV mostra as parcelas em aberto
 * dela, e recebe-se ali."
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let balcao: MembroDeTeste | null = null
let semReceber: MembroDeTeste | null = null
let financeiro: MembroDeTeste | null = null
let slug = ''
let outraUnidade = ''

async function como(m: MembroDeTeste, browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const amanha = () => new Date(Date.now() + 30 * 86_400_000).toISOString()

/** Vende o procedimento pré-pago no crediário, sem entrada, pela action (3 × R$ 200). */
async function venderNoCrediario(p: Page, cliente: string): Promise<{ id: string; parcela_numero: number; amount: number }[]> {
  const r = await chamarAcao(p, 'actions/pre-pago.ts', 'venderProcedimento', `/${slug}/pdv`, [
    cliente, rede!.procedureId, rede!.branchId, 3, null,
    { forma: 'PARCELADO', entrada: 0, parcelas: 3, primeiroVencimento: amanha() }, null, null, null,
  ])
  expect(r.texto, 'a venda no crediário sem entrada passou').toContain('saleId')
  const { data } = await db().from('financial_transactions').select('id, parcela_numero, amount, is_paid, payment_method')
    .eq('client_id', cliente).eq('branch_id', rede!.branchId).order('parcela_numero')
  expect(data, 'três parcelas em aberto, sem forma').toHaveLength(3)
  expect(data!.every(l => !l.is_paid && l.payment_method === null)).toBe(true)
  return data as { id: string; parcela_numero: number; amount: number }[]
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`pdvc${marca}`)
  expect((await db().from('procedures').update({ price: 200 }).eq('id', rede.procedureId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  outraUnidade = (await db().from('branches').insert({ tenant_id: rede.tenantId, name: `Outra ${marca}`, slug: `e2e-pdvc2-${marca}` })
    .select('id').single<{ id: string }>()).data!.id
  balcao = await criarMembro(`pdvcb${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Balcão',
    permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' }],
  })
  semReceber = await criarMembro(`pdvcs${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Sem receber',
    permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }],
  })
  financeiro = await criarMembro(`pdvcf${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Financeiro',
    permissoes: [{ modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' }],
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
  await b.from('financial_transactions').delete().eq('branch_id', outraUnidade)
  await balcao?.limpar()
  await semReceber?.limpar()
  await financeiro?.limpar()
  await rede.limpar()
})

test('PDV8: o Crediário é uma forma — sem entrada nada a escolher, com entrada a forma dela; a venda fica registrada como Crediário', async ({ browser }) => {
  const cliente = await rede!.criarCliente(`Crediario ${marca}`)
  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/pdv?nova=1&cliente=${cliente}`)
    const venda = p.getByRole('region', { name: 'Vender' })
    await expect(venda.locator('[data-cliente-da-venda]')).toBeVisible()
    await venda.getByLabel('Procedimento', { exact: true }).selectOption(rede!.procedureId)
    await venda.getByLabel('Quantidade').fill('3')

    // As formas, lado a lado: o Crediário é uma delas (e nenhuma vem escolhida).
    const formas = venda.getByRole('radiogroup', { name: /Forma de pagamento/ })
    for (const f of ['Pix', 'Dinheiro', 'Débito', 'Crédito', 'Crediário', 'A receber']) {
      await expect(formas.getByRole('radio', { name: f, exact: true }), f).toBeVisible()
    }
    await expect(formas.locator('[aria-checked="true"]')).toHaveCount(0)
    await expect(venda.getByText('Meio de pagamento', { exact: false })).toHaveCount(0)

    await formas.getByRole('radio', { name: 'Crediário', exact: true }).click()
    // Sem entrada: nada se recebe agora, e não há forma a escolher — nem o "não precisa".
    await expect(venda.getByLabel('Forma da entrada')).toHaveCount(0)
    await expect(venda.getByText(/não precisa/)).toHaveCount(0)
    // Com entrada, ela pede a forma dela.
    await venda.getByLabel('Entrada', { exact: true }).fill('100')
    await expect(venda.getByLabel('Forma da entrada')).toBeVisible()
    await euVendi(venda)
    const botao = venda.getByRole('button', { name: /^Vender por R\$\s600,00$/ })
    await expect(botao, 'a entrada sem forma não vende').toBeDisabled()
    await venda.getByLabel('Entrada', { exact: true }).fill('')
    await expect(venda.getByLabel('Forma da entrada')).toHaveCount(0)
    await venda.getByLabel('Parcelas').selectOption('3')
    await botao.click()
    const agendarAgora = venda.locator('[data-agendar-agora]')
    if (await agendarAgora.count()) await agendarAgora.getByRole('button', { name: 'Cancelar' }).click()

    // A comanda da venda diz "Crediário" — não "Sem forma de pagamento".
    await expect(p.getByRole('region', { name: 'Vender' })).toHaveCount(0)
    await p.getByRole('link', { name: 'Pagas hoje' }).click()
    const linha = p.locator('[data-lista-de-comandas] .pdv-linha', { hasText: `Crediario ${marca}` })
    await expect(linha).toContainText('Crediário')
    await expect(linha).not.toContainText('Sem forma')
  })
  const { data } = await db().from('financial_transactions').select('amount, is_paid, payment_method, parcela_total').eq('client_id', cliente)
  expect(data).toHaveLength(3)
  expect(data!.every(l => !l.is_paid && l.payment_method === null && l.parcela_total === 3)).toBe(true)
})

test('PDV8: o "A receber" não pede meio, e o servidor não aceita o meio dele nem a entrada sem forma', async ({ browser }) => {
  const cliente = await rede!.criarCliente(`AReceber ${marca}`)
  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/pdv?nova=1&cliente=${cliente}`)
    const venda = p.getByRole('region', { name: 'Vender' })
    await venda.getByLabel('Procedimento', { exact: true }).selectOption(rede!.procedureId)
    await venda.getByRole('radio', { name: 'A receber', exact: true }).click()
    await expect(venda.getByLabel('Vencimento')).toBeVisible()
    await expect(venda.getByText('Meio de pagamento (opcional)')).toHaveCount(0)
    await expect(venda.getByLabel('Meio de pagamento')).toHaveCount(0)

    const aReceberComMeio = await chamarAcao(p, 'actions/pre-pago.ts', 'venderProcedimento', `/${slug}/pdv`, [
      cliente, rede!.procedureId, rede!.branchId, 1, null, { forma: 'A_RECEBER', metodo: 'PIX', vencimento: null }, null, null, null,
    ])
    expect(aReceberComMeio.texto).toContain('"error"')
    expect(aReceberComMeio.texto).not.toContain('saleId')
    const entradaSemForma = await chamarAcao(p, 'actions/pre-pago.ts', 'venderProcedimento', `/${slug}/pdv`, [
      cliente, rede!.procedureId, rede!.branchId, 1, null, { forma: 'PARCELADO', metodo: null, entrada: 50, parcelas: 2, primeiroVencimento: amanha() }, null, null, null,
    ])
    expect(entradaSemForma.texto).toContain('Escolha a forma da entrada.')
    expect(entradaSemForma.texto).not.toContain('saleId')
  })
  const { count } = await db().from('financial_transactions').select('id', { count: 'exact', head: true }).eq('client_id', cliente)
  expect(count, 'nada gravou').toBe(0)
})

test('CX1: escolhida a cliente, o PDV mostra as parcelas em aberto dela e recebe ali, pedindo a forma', async ({ browser }) => {
  const cliente = await rede!.criarCliente(`Parcela ${marca}`)
  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/pdv`)
    const parcelas = await venderNoCrediario(p, cliente)
    // A 2ª venceu ontem: a tela diz.
    const ontem = new Date(Date.now() - 86_400_000).toISOString()
    expect((await db().from('financial_transactions').update({ due_date: ontem }).eq('id', parcelas[1]!.id)).error).toBeNull()

    await p.goto(`/${slug}/pdv?nova=1&cliente=${cliente}`)
    const venda = p.getByRole('region', { name: 'Vender' })
    const emAberto = venda.locator('[data-em-aberto-da-cliente]')
    await expect(emAberto.locator('[data-parcela-em-aberto]')).toHaveCount(3)
    const primeira = emAberto.locator('[data-parcela-em-aberto]', { hasText: 'Parcela 1 de 3 do crediário' })
    await expect(primeira).toContainText('R$ 200,00')
    await expect(emAberto.locator('[data-parcela-em-aberto]', { hasText: 'Parcela 2 de 3' })).toContainText('Vencida em')

    await primeira.getByRole('button', { name: 'Receber esta parcela' }).click()
    const janela = p.getByRole('dialog', { name: 'Receber a parcela' })
    await expect(janela).toBeVisible()
    // A parcela não se paga em crediário: as formas de quem paga agora.
    await expect(janela.getByRole('radio', { name: 'Crediário', exact: true })).toHaveCount(0)
    const receber = janela.getByRole('button', { name: /^Receber R\$\s200,00$/ })
    await expect(receber, 'sem forma, não recebe').toBeDisabled()
    await janela.getByRole('radio', { name: 'Pix', exact: true }).click()
    await receber.click()
    await expect(janela).toHaveCount(0)
    await expect(p.getByRole('region', { name: 'Vender' }).locator('[data-parcela-em-aberto]')).toHaveCount(2)
  })
  const { data: paga } = await db().from('financial_transactions').select('is_paid, payment_method, recebido_por, branch_id')
    .eq('client_id', cliente).eq('parcela_numero', 1).single()
  expect(paga).toMatchObject({ is_paid: true, payment_method: 'PIX', recebido_por: balcao!.userId, branch_id: rede!.branchId })
})

test('CX1: receber a parcela confere quem recebe, a forma, a rede e a unidade do lançamento', async ({ browser }) => {
  const cliente = await rede!.criarCliente(`Trava ${marca}`)
  // Um a receber da cliente na OUTRA unidade: o balcão da unidade fixa não o alcança.
  const { data: fora } = await db().from('financial_transactions').insert({
    branch_id: outraUnidade, client_id: cliente, type: 'INCOME', category: 'Serviços', description: `${PREFIXO} fora ${marca}`,
    amount: 80, is_paid: false, due_date: amanha(), created_by: 'e2e',
  }).select('id').single<{ id: string }>()
  expect(fora).toBeTruthy()
  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/pdv`)
    const [parcela] = await venderNoCrediario(p, cliente)
    const semForma = await chamarAcao(p, 'actions/pdv.ts', 'receberParcelaNoPdv', `/${slug}/pdv`, [parcela!.id, slug, { forma: '' }])
    expect(semForma.texto).toContain('Escolha a forma de pagamento.')
    const crediario = await chamarAcao(p, 'actions/pdv.ts', 'receberParcelaNoPdv', `/${slug}/pdv`, [parcela!.id, slug, { forma: 'CREDIARIO' }])
    expect(crediario.texto).toContain('"error"')
    const deFora = await chamarAcao(p, 'actions/pdv.ts', 'receberParcelaNoPdv', `/${slug}/pdv`, [fora!.id, slug, { forma: 'PIX' }])
    expect(deFora.texto).toContain('Lançamento não encontrado.')
  })
  await como(semReceber!, browser, async p => {
    await p.goto(`/${slug}/clients`)
    const { data: parcela } = await db().from('financial_transactions').select('id').eq('client_id', cliente).eq('parcela_numero', 1).single<{ id: string }>()
    const r = await chamarAcao(p, 'actions/pdv.ts', 'receberParcelaNoPdv', `/${slug}/clients`, [parcela!.id, slug, { forma: 'PIX' }])
    expect(r.texto).toContain('"error"')
  })
  const { data } = await db().from('financial_transactions').select('is_paid').eq('client_id', cliente)
  expect(data!.every(l => !l.is_paid), 'nada foi recebido').toBe(true)
})

test('PDV8/CX2: a baixa no Financeiro pede a forma sempre — também a do a receber que já tinha meio', async ({ browser }) => {
  const cliente = await rede!.criarCliente(`Baixa ${marca}`)
  const { data: tx } = await db().from('financial_transactions').insert({
    branch_id: rede!.branchId, client_id: cliente, type: 'INCOME', category: 'Serviços', description: `${PREFIXO} combinado ${marca}`,
    amount: 120, is_paid: false, payment_method: 'PIX', due_date: amanha(), created_by: 'e2e',
  }).select('id').single<{ id: string }>()
  await como(financeiro!, browser, async p => {
    await p.goto(`/${slug}/financeiro?aba=a-receber`)
    const r = await chamarAcao(p, 'actions/financial.ts', 'markTransactionPaid', `/${slug}/financeiro`, [tx!.id, slug])
    expect(r.texto, 'a action não dá baixa sem a forma').toContain('Escolha a forma de pagamento.')
    const linha = p.locator('tr', { hasText: `combinado ${marca}` })
    await linha.getByRole('button', { name: /Pagar/ }).click()
    const janela = p.getByRole('dialog', { name: 'Receber' })
    await expect(janela.getByLabel('Forma de pagamento')).toHaveValue('PIX')
    await janela.getByLabel('Forma de pagamento').selectOption('CASH')
    await janela.getByRole('button', { name: 'Confirmar recebimento' }).click()
    await expect(janela).toHaveCount(0)
  })
  const { data: paga } = await db().from('financial_transactions').select('is_paid, payment_method').eq('id', tx!.id).single()
  expect(paga).toEqual({ is_paid: true, payment_method: 'CASH' })
})
