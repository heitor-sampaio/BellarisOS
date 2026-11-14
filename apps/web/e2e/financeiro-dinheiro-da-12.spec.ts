import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { addDaysTZ, addMonthsTZ, dayKeyTZ, endOfMonthTZ, startOfMonthTZ } from '../lib/datetime'

/**
 * A F59 — o dinheiro da 12ª simulação (2026-11-11): o estorno no dia em que o
 * dinheiro sai.
 *
 * - D2 (decidido pelo princípio 5, "o caixa e o faturamento, no dia em que o
 *   dinheiro entrou"): o estorno feito HOJE de um pagamento de ONTEM tirava o
 *   dinheiro de ontem (o Fechamento de 10/11, já fechado com "Bateu", foi de
 *   R$ 1.730 a R$ 1.100) e não aparecia como saída hoje. Agora o pagamento fica
 *   no dia dele (o parcial, pelo valor de antes) e o estorno é SAÍDA do dia em que
 *   foi feito; no mesmo dia, um anula o outro, como sempre. O faturamento segue:
 *   o estorno de outro mês é dedução do mês em que aconteceu.
 * - A33: o "estornar inteiro e lançar o usado de novo": o original fica no dia
 *   dele, e o relançado entra no dia do estorno.
 * - D3: o estorno de uma DESPESA não é "o que voltou às clientes": sai dos
 *   "Estornos do dia", a linha do Financeiro diz "Anula a despesa estornada", e
 *   o dinheiro que volta é ENTRADA no caixa do dia.
 * - A39: no Fechamento, quem só tem Recebimentos não lê a descrição nem o motivo
 *   de uma despesa.
 * - D9: o "caixa da lista" do Financeiro tem as exclusões da receita (o uso do
 *   crédito na clínica não é caixa).
 * - A45: o CSV dos lançamentos diz "Conta no caixa" — somar os "Sim" dá o caixa.
 * - A31: o estorno do crédito com bônus diz quanto foi usado e quanto disso foi
 *   do bônus.
 * - A57: no app, a compra de crédito estornada em parte diz o pago e o devolvido.
 *
 * As datas são gravadas pelo banco (o pagamento "de ontem" tem o `paid_at` de
 * ontem ao meio-dia); o estorno é feito agora, pelas funções de sempre.
 */

test.setTimeout(240_000)

const marca = Date.now().toString(36)
const db = () => banco()
const n = (v: unknown) => Number(v ?? 0)
let rede: OutraRede
let slug = ''
let dona: MembroDeTeste
let caixa: MembroDeTeste
let bruna: ClienteDeTeste
let carla = ''
let debora = ''
let ana = ''
let pagamentoDaAna = ''
let contraDaEnergia = ''

const agora = new Date()
const hoje = dayKeyTZ(agora)
const ontem = dayKeyTZ(addDaysTZ(agora, -1))
const ha3dias = dayKeyTZ(addDaysTZ(agora, -3))
const dia1DoMesPassado = dayKeyTZ(startOfMonthTZ(addMonthsTZ(startOfMonthTZ(agora), -1)))
const meioDia = (dia: string) => new Date(`${dia}T12:00:00-03:00`).toISOString()
const ddmm = (dia: string) => dia.slice(8, 10) + '/' + dia.slice(5, 7)

/**
 * O CAIXA ESPERADO, escrito à mão: cada dinheiro que entrou (+) ou saiu (−) da
 * receita, no dia em que se mexeu (princípio 5).
 */
const RECEITA: { dia: string; valor: number; o_que: string }[] = [
  { dia: ontem, valor: 300, o_que: 'crédito da Bruna (Pix)' },
  { dia: hoje, valor: -136.36, o_que: 'estorno parcial do crédito da Bruna' },
  { dia: ontem, valor: 200, o_que: 'limpeza da Carla (dinheiro)' },
  { dia: hoje, valor: -200, o_que: 'estorno da limpeza da Carla' },
  { dia: hoje, valor: 89, o_que: 'venda de hoje' },
  { dia: hoje, valor: -89, o_que: 'estorno da venda de hoje' },
  { dia: dia1DoMesPassado, valor: 500, o_que: 'peeling do mês passado (Pix)' },
  { dia: hoje, valor: -500, o_que: 'estorno do peeling do mês passado' },
  { dia: ontem, valor: 100, o_que: 'crédito da Débora (Pix)' },
  { dia: hoje, valor: -100, o_que: 'estorno inteiro do crédito da Débora' },
  { dia: hoje, valor: 40, o_que: 'o usado da Débora, lançado de novo' },
  { dia: ha3dias, valor: 300, o_que: 'crédito da Ana (Pix)' },
]
const DESPESA: { dia: string; valor: number }[] = [
  { dia: hoje, valor: 780 }, { dia: hoje, valor: -780 },  // a energia duplicada, estornada no mesmo dia
  { dia: ontem, valor: 120 }, { dia: hoje, valor: -120 }, // o material de ontem, estornado hoje
]
const somaEntre = (lista: { dia: string; valor: number }[], de: string, ate: string) =>
  Math.round(lista.filter(l => l.dia >= de && l.dia <= ate).reduce((s, l) => s + l.valor * 100, 0)) / 100

const janela = (dia: string) => ({ p_from: new Date(`${dia}T00:00:00-03:00`).toISOString(), p_to: new Date(`${dia}T23:59:59.999-03:00`).toISOString() })

async function fechamento(dia: string) {
  const { data, error } = await db().rpc('metrics_fechamento_do_dia', { p_tenant: rede.tenantId, p_branch: rede.branchId, ...janela(dia) })
  expect(error).toBeNull()
  const linhas = (data ?? []) as { forma: string; entradas: number; saidas: number; saldo: number }[]
  return Object.fromEntries(linhas.map(l => [l.forma, { entradas: n(l.entradas), saidas: n(l.saidas), saldo: n(l.saldo) }]))
}

async function nucleo(de: string, ate: string) {
  const { data, error } = await db().rpc('metrics_core', {
    p_tenant: rede.tenantId, p_branch_ids: [rede.branchId],
    p_from: new Date(`${de}T00:00:00-03:00`).toISOString(), p_to: new Date(`${ate}T23:59:59.999-03:00`).toISOString(),
  })
  expect(error).toBeNull()
  const l = (Array.isArray(data) ? data[0] : data) as { revenue_cash: number; expenses_cash: number }
  return { receita: n(l.revenue_cash), despesa: n(l.expenses_cash) }
}

async function lancar(l: Record<string, unknown>) {
  const { data, error } = await db().from('financial_transactions').insert({
    branch_id: rede.branchId, type: 'INCOME', category: 'Procedimento', created_by: 'e2e', is_paid: true, ...l,
  }).select('id').single<{ id: string }>()
  expect(error, `lançar ${String(l.description)}`).toBeNull()
  return data!.id
}

async function estornar(id: string, motivo: string) {
  const { data, error } = await db().rpc('estornar_transacao', { p_transacao: id, p_tenant: rede.tenantId, p_ator: 'e2e', p_motivo: motivo })
  expect(error, `estornar ${motivo}`).toBeNull()
  return data as string
}

/** Vende crédito na clínica e põe o pagamento no dia dado (o banco grava "agora"). */
async function venderCredito(cliente: string, valor: number, bonus: number, dia: string) {
  const { data: venda, error } = await db().rpc('credito_vender', {
    p_tenant: rede.tenantId, p_cliente: cliente, p_unidade: rede.branchId, p_valor: valor,
    p_metodo: 'PIX', p_vezes: 1, p_bandeira: null, p_ator: null, p_ator_nome: 'e2e', p_bonus: bonus,
  })
  expect(error, 'vender o crédito').toBeNull()
  const { data: tx } = await db().from('financial_transactions').select('id').eq('credito_vendido_id', venda as string).single<{ id: string }>()
  expect((await db().from('financial_transactions').update({ paid_at: meioDia(dia) }).eq('id', tx!.id)).error).toBeNull()
  return { venda: venda as string, pagamento: tx!.id }
}

async function usarCredito(cliente: string, valor: number, dia: string | null) {
  await lancar({
    client_id: cliente, description: `${PREFIXO} Uso do crédito ${marca}`, amount: valor,
    payment_method: 'INTERNAL_CREDIT', paid_at: dia ? meioDia(dia) : new Date().toISOString(),
  })
}

async function como(browser: Browser, m: { estado: MembroDeTeste['estado'] }, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 }, acceptDownloads: true })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`d12${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  dona = await criarMembro(`d12d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  caixa = await criarMembro(`d12c${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Caixa', permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }],
  })
  bruna = await clienteComSessao(`d12b${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  carla = await rede.criarCliente('Carla')
  debora = await rede.criarCliente('Debora')
  ana = await rede.criarCliente('Ana')

  // D2 (o Time A): o crédito da Bruna, R$ 300 + R$ 30 de bônus no Pix ONTEM,
  // R$ 180 usados, estornado HOJE na proporção: voltam R$ 136,36.
  const credito = await venderCredito(bruna.clientId, 300, 30, ontem)
  await usarCredito(bruna.clientId, 180, null)
  const { data: previa, error: eP } = await b.rpc('credito_estornar_venda', {
    p_tenant: rede.tenantId, p_venda: credito.venda, p_ator: null, p_ator_nome: 'e2e', p_motivo: 'Desistiu [e2e]',
    p_esperado: null, p_simular: true, p_estorno: null, p_novo: null, p_bonus: 'PROPORCIONAL',
  })
  expect(eP).toBeNull()
  expect(n((previa as { volta: number }).volta)).toBe(136.36)
  expect((await b.rpc('credito_estornar_venda', {
    p_tenant: rede.tenantId, p_venda: credito.venda, p_ator: null, p_ator_nome: 'e2e', p_motivo: 'Desistiu [e2e]',
    p_esperado: 136.36, p_simular: false, p_estorno: 'PARCIAL', p_novo: null, p_bonus: 'PROPORCIONAL',
  })).error).toBeNull()

  // D2 inteiro: a limpeza da Carla, R$ 200 em dinheiro ONTEM, estornada HOJE.
  await estornar(await lancar({ client_id: carla, description: `${PREFIXO} Limpeza da Carla ${marca}`, amount: 200, payment_method: 'CASH', paid_at: meioDia(ontem) }), 'Cobrada duas vezes [e2e]')
  // No mesmo dia, como sempre: um anula o outro.
  await estornar(await lancar({ client_id: carla, description: `${PREFIXO} Venda de hoje ${marca}`, amount: 89, payment_method: 'PIX', paid_at: new Date().toISOString() }), 'Lançada por engano [e2e]')
  // O faturamento: o peeling do mês passado, estornado HOJE.
  await estornar(await lancar({ client_id: carla, description: `${PREFIXO} Peeling do mês passado ${marca}`, amount: 500, payment_method: 'PIX', paid_at: meioDia(dia1DoMesPassado) }), 'Reclamação [e2e]')

  // A33: o crédito da Débora, R$ 100 no Pix ONTEM, R$ 40 usados, estornado
  // INTEIRO hoje — e o usado lançado de novo, hoje.
  const daDebora = await venderCredito(debora, 100, 0, ontem)
  await usarCredito(debora, 40, null)
  expect((await b.rpc('credito_estornar_venda', {
    p_tenant: rede.tenantId, p_venda: daDebora.venda, p_ator: null, p_ator_nome: 'e2e', p_motivo: 'Inteiro [e2e]',
    p_esperado: 60, p_simular: false, p_estorno: 'INTEIRO', p_novo: { metodo: 'PIX', vezes: 1 }, p_bonus: null,
  })).error).toBeNull()

  // D3: a energia paga em duplicidade, estornada no mesmo dia; e o material de
  // ontem, estornado hoje (o dinheiro volta ao caixa hoje).
  const energia = await lancar({ type: 'EXPENSE', category: 'Contas (energia, água, internet)', description: `${PREFIXO} Energia elétrica duplicada ${marca}`, amount: 780, payment_method: 'PIX', paid_at: new Date().toISOString() })
  contraDaEnergia = await estornar(energia, 'Conta paga duas vezes [e2e]')
  await estornar(await lancar({ type: 'EXPENSE', category: 'Outros', description: `${PREFIXO} Material de ontem ${marca}`, amount: 120, payment_method: 'CASH', paid_at: meioDia(ontem) }), 'Devolvido ao fornecedor [e2e]')

  // A31: o crédito da Ana, R$ 300 + R$ 30 de bônus há 3 dias, R$ 180 usados (não estornado).
  pagamentoDaAna = (await venderCredito(ana, 300, 30, ha3dias)).pagamento
  await usarCredito(ana, 180, ha3dias)
})

test.afterAll(async () => {
  await bruna?.limpar(); await dona?.limpar(); await caixa?.limpar()
  await rede?.limpar()
})

test('D2 e A33: o pagamento fica no dia dele, e o estorno é saída do dia em que foi feito', async () => {
  // Ontem não mudou com o estorno de hoje: o crédito da Bruna pelos R$ 300 de
  // antes, o da Débora e a limpeza da Carla inteiros; a saída do material.
  const deOntem = await fechamento(ontem)
  expect(deOntem.PIX, 'ontem, Pix: R$ 300 da Bruna + R$ 100 da Débora').toEqual({ entradas: 400, saidas: 0, saldo: 400 })
  expect(deOntem.CASH, 'ontem, dinheiro: a limpeza da Carla, e o material pago').toEqual({ entradas: 200, saidas: 120, saldo: 80 })
  // Hoje: os estornos de pagamentos de outros dias são saídas; o relançado da
  // Débora entra; o material estornado volta ao caixa (entrada); a venda e a
  // energia de hoje, estornadas hoje, se anulam.
  const deHoje = await fechamento(hoje)
  expect(deHoje.PIX, 'hoje, Pix').toEqual({ entradas: 40, saidas: 736.36, saldo: -696.36 })
  expect(deHoje.CASH, 'hoje, dinheiro').toEqual({ entradas: 120, saidas: 200, saldo: -80 })
  expect(deHoje.TOTAL, 'hoje, o total').toEqual({ entradas: 160, saidas: 936.36, saldo: -776.36 })

  // O faturamento segue o mesmo: o estorno do mês passado é dedução DESTE mês.
  for (const [de, ate] of [[ontem, ontem], [hoje, hoje], [dia1DoMesPassado, dia1DoMesPassado]]) {
    const r = await nucleo(de!, ate!)
    expect(r.receita, `receita de ${de} a ${ate}`).toBe(somaEntre(RECEITA, de!, ate!))
    expect(r.despesa, `despesa de ${de} a ${ate}`).toBe(somaEntre(DESPESA, de!, ate!))
  }
  const inicioDoMes = dayKeyTZ(startOfMonthTZ(agora))
  const fimDoMesPassado = dayKeyTZ(endOfMonthTZ(addMonthsTZ(startOfMonthTZ(agora), -1)))
  expect((await nucleo(dia1DoMesPassado, fimDoMesPassado)).receita, 'o mês passado não muda').toBe(somaEntre(RECEITA, dia1DoMesPassado, fimDoMesPassado))
  expect((await nucleo(inicioDoMes, hoje)).receita, 'este mês tem a dedução').toBe(somaEntre(RECEITA, inicioDoMes, hoje))
})

test('D2 e D3: o Fechamento de ontem não muda; o de hoje mostra a saída e diz de que dia era o pagamento', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto(`/${slug}/pdv?fechar=1&dia=${ontem}`)
    await expect(p.locator('[data-forma="PIX"]')).toContainText('R$ 400,00')
    await expect(p.locator('[data-forma="TOTAL"]')).toContainText('R$ 600,00')

    await p.goto(`/${slug}/pdv?fechar=1&dia=${hoje}`)
    await expect(p.locator('[data-forma="PIX"]')).toContainText(/R\$\s736,36/)
    // CX5: os estornos moram nos "Detalhes do dia", recolhidos.
    await p.locator('[data-detalhes-do-dia] summary').click()
    const estornos = p.locator('[data-estornos-do-dia]')
    // D3: o que voltou às clientes — sem a despesa estornada.
    await expect(estornos).toContainText(/R\$\s1\.025,36/)
    await expect(estornos).not.toContainText('Energia elétrica duplicada')
    await expect(estornos).not.toContainText('Material de ontem')
    const daCarla = estornos.locator('[data-estorno-do-dia]', { hasText: 'Limpeza da Carla' })
    await expect(daCarla).toContainText(`Pagamento de ${ddmm(ontem)}`)
    await expect(estornos.locator('[data-estorno-do-dia]', { hasText: 'Venda de hoje' })).toContainText('Pagamento deste dia')

    // O CSV do Fechamento (no Financeiro desde o CX6): o estorno com o dia do pagamento.
    await p.goto(`/${slug}/financeiro?period=today`)
    await p.getByRole('button', { name: 'CSV do fechamento do dia' }).click()
    const janela = p.getByRole('dialog', { name: 'CSV do fechamento do dia' })
    await janela.getByLabel('Dia').fill(hoje)
    const [arquivo] = await Promise.all([p.waitForEvent('download'), janela.getByRole('button', { name: 'Baixar' }).click()])
    const fs = await import('node:fs/promises')
    const texto = await fs.readFile((await arquivo.path())!, 'utf8')
    expect(texto).toContain('Descrição;Forma;Valor;Motivo;Pagamento de')
    expect(texto).not.toContain('Energia elétrica duplicada')
  })
})

test('A39: quem só tem Recebimentos vê a saída pela forma, sem a descrição nem o motivo da despesa', async ({ browser }) => {
  await como(browser, caixa, async p => {
    await p.goto(`/${slug}/pdv?fechar=1&dia=${hoje}`)
    await expect(p.locator('[data-forma="TOTAL"]')).toBeVisible()
    await expect(p.getByText('Energia elétrica duplicada')).toHaveCount(0)
    await expect(p.getByText('Conta paga duas vezes')).toHaveCount(0)
  })
})

test('D3, D9 e A45: a linha diz "Anula a despesa estornada"; o caixa da lista é o caixa; o CSV diz o que conta', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto(`/${slug}/financeiro?period=today`)
    await expect(p.locator(`[data-lancamento="${contraDaEnergia}"]`)).toContainText('Anula a despesa estornada')
    // O caixa da lista de hoje é o saldo do Fechamento de hoje: o uso do
    // crédito (R$ 180 da Bruna, R$ 40 da Débora) não é caixa.
    await expect(p.locator('[data-total-da-lista]')).toContainText(/caixa da lista\s*−R\$\s776,36/)

    const [arquivo] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Exportar CSV' }).first().click()])
    const fs = await import('node:fs/promises')
    const linhas = (await fs.readFile((await arquivo.path())!, 'utf8')).replace(/^﻿/, '').split('\r\n').map(l => l.split(';'))
    const cab = linhas[0]!
    const iValor = cab.indexOf('Valor'), iConta = cab.indexOf('Conta no caixa'), iDesc = cab.indexOf('Descrição')
    expect(iConta, 'a coluna "Conta no caixa"').toBeGreaterThan(-1)
    const doUso = linhas.find(l => (l[iDesc] ?? '').includes('Uso do crédito'))
    expect(doUso?.[iConta]).toBe('Não')
    const soma = linhas.slice(1).filter(l => l[iConta] === 'Sim')
      .reduce((s, l) => s + Math.round(Number((l[iValor] ?? '0').replace(',', '.')) * 100), 0) / 100
    expect(soma, 'somar os "Sim" dá o caixa').toBe(-776.36)
  })
})

test('A31: o estorno do crédito com bônus diz quanto foi usado e quanto disso foi do bônus', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto(`/${slug}/financeiro?period=7d`)
    await p.locator(`[data-lancamento="${pagamentoDaAna}"]`).getByRole('button', { name: 'Estornar' }).click()
    const dlg = p.getByRole('dialog', { name: 'Estornar a venda de crédito na clínica?' })
    await dlg.locator('[data-como-sai-o-bonus]').getByRole('radio', { name: /proporção/ }).check()
    await expect(dlg.locator('[data-conta-do-estorno-do-credito]')).toContainText(/R\$\s180,00 usados, R\$\s16,36 deles do bônus/)
    await dlg.getByRole('button', { name: 'Voltar' }).click()
  })
})

test('A57: no app, a compra de crédito estornada em parte diz o pago e o devolvido', async ({ browser }) => {
  await como(browser, bruna, async p => {
    await p.goto(`/${slug}/cliente/financeiro`)
    await expect(p.getByText(/R\$\s300,00 pagos · R\$\s136,36 devolvidos/)).toBeVisible()
  })
})
