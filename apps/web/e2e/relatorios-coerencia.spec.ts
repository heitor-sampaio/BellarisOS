import { test, expect } from '@playwright/test'
import { banco, tenantId } from './apoio/banco'

/**
 * O mesmo indicador, no mesmo lugar, tem que dar o mesmo número.
 *
 * A tela de relatórios mostrava **dois faturamentos**: R$ 5.200 no cartão e
 * R$ 5.450 na legenda do gráfico logo abaixo. Não era erro de conta — eram
 * duas cópias da definição do indicador. O KPI somava em JS excluindo o
 * estorno; o gráfico somava o mesmo array sem excluir.
 *
 * Divergência de número é o defeito mais caro que este sistema pode ter: quem
 * opera não tem como saber qual dos dois acreditar, e a partir daí não
 * acredita em nenhum. Por isso o teste compara os TRÊS: o cartão, a legenda e
 * o banco.
 *
 * O banco é a referência, com a definição canônica do CLAUDE.md §13.1:
 * INCOME pago, estorno fora dos dois lados, eixo em `paid_at`.
 */

const brl = (texto: string): number => {
  const m = /R\$\s*([\d.]+,\d{2})/.exec(texto)
  const valor = m?.[1]
  if (!valor) throw new Error(`não achei um valor em reais em: ${texto.slice(0, 80)}`)
  return Number(valor.replace(/\./g, '').replace(',', '.'))
}

test('faturamento: cartão, legenda do gráfico e banco dizem o mesmo', async ({ page }) => {
  const db = banco()
  const tenant = await tenantId()

  // -- A referência ----------------------------------------------------------
  const { data: esperado, error } = await db.rpc('metrics_core', {
    p_tenant: tenant,
    p_branch_ids: null,
    p_from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
    p_to: new Date().toISOString(),
  })
  if (error) throw new Error(`metrics_core falhou: ${error.message}`)
  const receitaNoBanco = Number((esperado as { revenue_cash: number }[])[0]?.revenue_cash ?? 0)

  // -- A tela ----------------------------------------------------------------
  await page.goto('/admin/reports?period=month')

  // ⚠️ O rótulo aparece em maiúsculas por CSS (`text-transform`), mas no DOM
  // ele é "Faturamento": procurar pelo texto como se vê na tela não acha nada.
  // O primeiro do DOM é o do KPI; o do gráfico vem depois.
  const rotulo = page.getByText('Faturamento', { exact: true }).first()
  await expect(rotulo).toBeVisible()
  const cartao = rotulo.locator('xpath=ancestor::div[contains(@class,"card")][1]')

  // ⚠️ O número do KPI é ANIMADO (conta de 0 até o valor em ~900ms). Ler de
  // primeira pega o meio da animação — foi o que devolveu 3.100,42 de um
  // cartão que mostra 5.200,00.
  await expect
    .poll(async () => brl(await cartao.innerText()), {
      message: 'o cartão tem de bater com o banco',
      timeout: 10_000,
    })
    .toBe(receitaNoBanco)

  const doCartao = brl(await cartao.innerText())

  // A legenda do gráfico repete o total de cada série.
  const grafico = page.locator('div.card').filter({ hasText: 'Evolução do Período' }).first()
  const daLegenda = brl(await grafico.getByText(/R\$/).first().innerText())

  expect(daLegenda, 'a legenda do gráfico tem de bater com o cartão').toBeCloseTo(doCartao, 2)
})

/**
 * O estorno é a razão pela qual os dois números divergiam: ele sai dos DOIS
 * lados (a transação marcada `notes='Estornada'` e a contra-transação
 * `category='Estorno'`), e quem esquece de excluir um deles conta o estorno
 * duas vezes no resultado.
 *
 * Este teste prova que a regra vale na série do gráfico, e não só no total:
 * um estorno criado agora não pode aumentar o faturamento de nenhum dia.
 */
test('estorno não infla a série do gráfico', async ({ page: _page }) => {
  const db = banco()
  const tenant = await tenantId()

  const janela = {
    p_tenant: tenant,
    p_branch_ids: null,
    p_from: new Date(Date.now() - 86_400_000 * 2).toISOString(),
    p_to: new Date(Date.now() + 86_400_000).toISOString(),
    p_granularity: 'day',
  }

  const somaDaSerie = async () => {
    const { data, error } = await db.rpc('metrics_series', janela)
    if (error) throw new Error(`metrics_series falhou: ${error.message}`)
    return (data as { revenue: number }[]).reduce((s, p) => s + Number(p.revenue), 0)
  }

  const antes = await somaDaSerie()

  // Uma receita paga e o estorno dela, o par completo.
  const { data: unidade } = await db
    .from('branches').select('id').eq('tenant_id', tenant).eq('is_active', true).limit(1).single()

  const { data: receita, error: erroReceita } = await db
    .from('financial_transactions')
    .insert({
      branch_id: unidade!.id, type: 'INCOME', category: 'Serviço',
      description: `[e2e] coerência ${Date.now().toString(36)}`,
      amount: 777, is_paid: true, paid_at: new Date().toISOString(), created_by: 'e2e',
    })
    .select('id, description')
    .single()
  if (erroReceita) throw new Error(erroReceita.message)

  const { data: contraId, error: erroEstorno } = await db.rpc('estornar_transacao', {
    p_transacao: receita!.id, p_tenant: tenant, p_ator: 'e2e',
  })
  if (erroEstorno) throw new Error(erroEstorno.message)

  try {
    const depois = await somaDaSerie()
    expect(depois, 'receita estornada não pode somar na série').toBeCloseTo(antes, 2)
  } finally {
    await db.from('financial_transactions').delete().eq('id', contraId as string)
    await db.from('financial_transactions').delete().eq('id', receita!.id)
  }
})

/**
 * O financeiro da unidade mede o mesmo que o da rede.
 *
 * Os KPIs desta tela eram somados sobre a LISTA de lançamentos, filtrada por
 * `created_at`. Enquanto tudo é criado e pago no mesmo dia, bate; a primeira
 * parcela criada num mês e paga no outro põe o número em dois lugares
 * diferentes — e o checkout de plano cria exatamente isso.
 *
 * O "ticket médio" desta tela também era outra conta (receita ÷ nº de
 * lançamentos), que sobe quando alguém paga em duas parcelas e desce quando
 * paga numa.
 */
test('financeiro da unidade bate com o núcleo do mês', async ({ page }) => {
  const db = banco()
  const tenant = await tenantId()

  const { data: unidade } = await db
    .from('branches').select('id, slug, name')
    .eq('tenant_id', tenant).eq('is_active', true)
    .order('name').limit(1).single()

  const inicioDoMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const { data: nucleo, error } = await db.rpc('metrics_core', {
    p_tenant: tenant, p_branch_ids: [unidade!.id], p_from: inicioDoMes, p_to: new Date().toISOString(),
  })
  if (error) throw new Error(`metrics_core falhou: ${error.message}`)

  const c = (nucleo as Record<string, number>[])[0]!
  const receita = Number(c.revenue_cash)
  const ticket  = Number(c.appointments_completed) > 0
    ? Number(c.service_revenue) / Number(c.appointments_completed)
    : 0

  await page.goto(`/${unidade!.slug}/financeiro?period=month`)

  const cartao = (rotulo: string) =>
    page.getByText(rotulo, { exact: true }).first()
      .locator('xpath=ancestor::div[contains(@class,"card")][1]')

  await expect
    .poll(async () => brl(await cartao('Receita Bruta').innerText()),
      { message: 'receita da unidade × núcleo', timeout: 10_000 })
    .toBe(receita)

  await expect
    .poll(async () => brl(await cartao('Ticket médio').innerText()),
      { message: 'ticket médio da unidade × definição do §13.1', timeout: 10_000 })
    .toBeCloseTo(ticket, 2)
})
