import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { abrirVendaNoPdv } from './apoio/vender'
import { chamarAcao } from './apoio/acao-direta'

/**
 * A20 da 11ª simulação — o bônus no crédito na clínica, DECIDIDO pelo Heitor
 * (2026-11-10): "No estorno sai o bonus junto, a clinica decide se integral ou
 * parcial" (e "não vamos fazer as clinicas perderem dinheiro"). A Marta quis
 * vender R$ 500 de crédito que vira R$ 550.
 *
 * - "Bônus (opcional)" no "Crédito na clínica", vazio por padrão;
 * - o caixa e o faturamento recebem só o pago (R$ 500), os pontos são sobre o pago;
 * - o saldo fica R$ 550, com o bônus como concessão LIGADA à venda;
 * - a tela e o app dizem "R$ 500,00 pagos + R$ 50,00 de bônus";
 * - no estorno o bônus SAI junto: inteiro ou na proporção do que volta, a
 *   clínica escolhe; nunca se devolve mais do que se recebeu.
 *
 * E o A55: a venda do crédito avisa que a cliente não tem acesso ao app (a
 * Daniela não entrou e não via o saldo).
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let slug = ''
let dona: MembroDeTeste
let recepcao: MembroDeTeste
let daniela: ClienteDeTeste
let rosana = ''
const n = (v: unknown) => Number(v ?? 0)

async function como(browser: Browser, estado: MembroDeTeste['estado'], fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const saldoDe = async (cliente: string) => {
  const { data, error } = await db().from('internal_credits').select('amount').eq('client_id', cliente)
  expect(error).toBeNull()
  return Math.round((data ?? []).reduce((s, r) => s + n(r.amount), 0) * 100) / 100
}
const pontosDe = async (cliente: string) => {
  const { data, error } = await db().rpc('saldo_de_pontos', { p_cliente: cliente, p_unidade: null })
  expect(error).toBeNull()
  return n(data)
}
const pagamentoDoCredito = async (cliente: string) => {
  const { data, error } = await db().from('financial_transactions').select('id, amount')
    .eq('client_id', cliente).not('credito_vendido_id', 'is', null).eq('type', 'INCOME')
    .order('created_at').limit(1).maybeSingle<{ id: string; amount: number }>()
  expect(error).toBeNull()
  return data!
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`bon${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await b.from('loyalty_configs').upsert(
    { tenant_id: rede.tenantId, enabled: true, points_per_real: 1, earn_mode: 'POR_REAL' }, { onConflict: 'tenant_id' })).error).toBeNull()
  dona = await criarMembro(`bond${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  recepcao = await criarMembro(`bonr${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepcao',
    permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }],
  })
  daniela = await clienteComSessao(`bonc${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  rosana = await rede.criarCliente('Rosana')
})

test.afterAll(async () => {
  await daniela?.limpar(); await dona?.limpar(); await recepcao?.limpar()
  await rede?.limpar()
})

test('A20: R$ 500 pagos + R$ 50 de bônus — o caixa e os pontos sobre o pago, o saldo de R$ 550, a ficha e o app dizem', async ({ browser }) => {
  await como(browser, recepcao.estado, async p => {
    const dlg = await abrirVendaNoPdv(p, `/${slug}`, daniela.clientId)
    await dlg.getByRole('button', { name: 'Crédito na rede', exact: true }).click()
    // Vazio por padrão.
    await expect(dlg.getByLabel('Bônus (opcional)')).toHaveValue('')
    // A55: a Daniela tem acesso ao app — nada a avisar.
    await expect(dlg.locator('[data-sem-acesso-ao-app]')).toHaveCount(0)
    await dlg.getByLabel('Valor do crédito').fill('500')
    await dlg.getByLabel('Bônus (opcional)').fill('50')
    await expect(dlg.locator('[data-conta-do-bonus]')).toContainText(/R\$\s500,00 pagos \+ R\$\s50,00 de bônus/)
    await expect(dlg.locator('[data-conta-do-bonus]')).toContainText(/R\$\s550,00/)
    await dlg.getByRole('radio', { name: 'Pix', exact: true }).click()
    // O caixa recebe só o pago.
    await dlg.getByRole('button', { name: /^Vender por R\$\s500,00/ }).click()
    await expect(p.getByText(/Venda registrada: Crédito na clínica/)).toBeVisible({ timeout: 15_000 })
  })
  const tx = await pagamentoDoCredito(daniela.clientId)
  expect(n(tx.amount)).toBe(500)
  expect(await saldoDe(daniela.clientId)).toBe(550)
  const { data: venda } = await db().from('creditos_vendidos').select('valor, bonus').eq('client_id', daniela.clientId).single()
  expect([n(venda!.valor), n(venda!.bonus)]).toEqual([500, 50])
  // O bônus é uma concessão LIGADA à venda (sem dinheiro).
  const { data: bonus } = await db().from('internal_credits').select('amount, concedido, credito_vendido_id').eq('client_id', daniela.clientId).eq('concedido', true)
  expect((bonus ?? []).map(c => [n(c.amount), !!c.credito_vendido_id])).toEqual([[50, true]])
  await expect.poll(() => pontosDe(daniela.clientId)).toBe(500)

  // A ficha e o app dizem.
  await como(browser, dona.estado, async p => {
    await p.goto(`/${slug}/clients/${daniela.clientId}?aba=financeiro`)
    await expect(p.getByText(/R\$\s500,00 pagos \+ R\$\s50,00 de bônus/).first()).toBeVisible()
  })
  await como(browser, daniela.estado, async p => {
    await p.goto(`/${slug}/cliente/financeiro`)
    await expect(p.locator('[data-credito-interno]')).toContainText(/R\$\s550,00/)
    await expect(p.locator('[data-credito-interno]')).toContainText(/R\$\s500,00 pagos \+ R\$\s50,00 de bônus/)
  })
})

test('A20: no estorno o bônus sai junto — na proporção, a clínica escolhe; nunca volta mais do que entrou', async ({ browser }) => {
  // A Daniela usa R$ 130 (sobram R$ 420 dos R$ 550).
  expect((await db().from('financial_transactions').insert({
    branch_id: rede.branchId, client_id: daniela.clientId, type: 'INCOME', category: 'Serviços', description: 'Drenagem paga com crédito [e2e]',
    amount: 130, is_paid: true, paid_at: new Date().toISOString(), payment_method: 'INTERNAL_CREDIT', created_by: dona.userId,
  })).error).toBeNull()
  expect(await saldoDe(daniela.clientId)).toBe(420)
  await como(browser, dona.estado, async p => {
    await p.goto(`/${slug}/financeiro`)
    const linha = p.locator('[data-lancamento]', { hasText: 'Crédito na clínica' }).filter({ hasText: '500,00' }).first()
    await linha.getByRole('button', { name: 'Estornar' }).click()
    const dlg = p.getByRole('dialog', { name: 'Estornar a venda de crédito na clínica?' })
    const comoSai = dlg.locator('[data-como-sai-o-bonus]')
    // As duas opções, com a conta de cada uma (do banco).
    await expect(comoSai.getByRole('radio', { name: /Inteiro.*R\$\s50,00.*volta R\$\s370,00/ })).toBeVisible()
    await expect(comoSai.getByRole('radio', { name: /proporção.*R\$\s38,18.*volta R\$\s381,82/ })).toBeVisible()
    // Sem escolher, não confirma.
    await dlg.getByLabel('Motivo do estorno').fill('Desistiu [e2e]')
    await expect(dlg.getByRole('button', { name: 'Confirmar estorno' })).toBeDisabled()
    await comoSai.getByRole('radio', { name: /proporção/ }).check()
    await expect(dlg.locator('[data-conta-do-estorno-do-credito]')).toContainText(/Volta à cliente\s*R\$\s381,82/)
    await expect(dlg.locator('[data-conta-do-estorno-do-credito]')).toContainText(/Bônus que sai\s*R\$\s38,18/)
    await dlg.getByRole('radio', { name: /Estorno parcial/ }).check()
    await dlg.getByRole('button', { name: 'Confirmar estorno' }).click()
    await expect(dlg).toBeHidden({ timeout: 15_000 })
  })
  const tx = await pagamentoDoCredito(daniela.clientId)
  expect(n(tx.amount)).toBe(118.18)
  const { data: contra } = await db().from('financial_transactions').select('amount').eq('client_id', daniela.clientId).eq('category', 'Estorno')
  expect((contra ?? []).map(c => n(c.amount))).toEqual([381.82])
  // Saiu do crédito o que voltou e o bônus da proporção: nada sobra da venda devolvida.
  expect(await saldoDe(daniela.clientId)).toBe(0)
  await expect.poll(() => pontosDe(daniela.clientId)).toBe(118)
})

test('A20: o bônus inteiro — e sem escolher, o estorno com bônus recusa', async ({ browser }) => {
  const rota = `/${slug}/pdv`
  await como(browser, recepcao.estado, async p => {
    const r = await chamarAcao(p, 'actions/credito-na-clinica.ts', 'venderCredito', rota, [rosana, rede.branchId, '200', { forma: 'AVISTA', metodo: 'PIX' }, null, '20'])
    expect(r.texto).toContain('vendaId')
  })
  expect(await saldoDe(rosana)).toBe(220)
  const tx = await pagamentoDoCredito(rosana)
  await como(browser, dona.estado, async p => {
    const sem = await chamarAcao(p, 'actions/credito-na-clinica.ts', 'estornarVendaDeCredito', `/${slug}/financeiro`,
      [tx.id, { motivo: 'e2e', estorno: null, novo: null, esperado: 200 }])
    expect(sem.texto).toContain('bônus')
    const r = await chamarAcao(p, 'actions/credito-na-clinica.ts', 'estornarVendaDeCredito', `/${slug}/financeiro`,
      [tx.id, { motivo: 'e2e', estorno: null, novo: null, esperado: 200, bonus: 'INTEIRO' }])
    expect(r.texto).toContain('"volta":200')
  })
  expect(await saldoDe(rosana)).toBe(0)
})

test('A55: a venda do crédito avisa que a cliente não tem acesso ao app', async ({ browser }) => {
  await como(browser, recepcao.estado, async p => {
    const dlg = await abrirVendaNoPdv(p, `/${slug}`, rosana)
    await dlg.getByRole('button', { name: 'Crédito na rede', exact: true }).click()
    const aviso = dlg.locator('[data-sem-acesso-ao-app]')
    await expect(aviso).toContainText('não tem acesso ao app')
    await expect(aviso.getByRole('link', { name: /Dar acesso ao app/ })).toHaveAttribute('href', new RegExp(`/clients/${rosana}\\?aba=dados`))
  })
})
