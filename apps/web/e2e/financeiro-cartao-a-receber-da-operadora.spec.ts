import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { responderAnamnese } from './apoio/anamnese'
import { chamarAcao } from './apoio/acao-direta'
import { primeiraMaquininha } from './apoio/maquininha'

/**
 * O cartão de crédito em N vezes vira N parcelas A RECEBER DA OPERADORA, mês a
 * mês (F2c da 5ª simulação; decisões do Heitor, 2026-11-01: "no financeiro mês
 * a mês, como a receber" e "conta no mês do dia da venda").
 *
 * - a venda segue UM lançamento pago (a receita entra inteira no dia da venda,
 *   a comissão libera na hora — H4 — e os pontos saem na venda);
 * - a operadora deposita em parcelas: cada uma a receber a cada N dias
 *   corridos contados da venda (30 por padrão; a clínica muda em
 *   Configurações → Comissões — r2-fin-01, o Heitor: "como a operadora paga
 *   de verdade e configurável o prazo"), com a taxa da maquininha rateada;
 * - a cliente não deve nada: nem a ficha, nem o app, nem o Fechamento;
 * - a parcela vira recebida sozinha na data, e dá para marcar antes
 *   (antecipação) — sem somar receita;
 * - o estorno da venda cancela as que faltam e estorna as já recebidas.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let dona: MembroDeTeste | null = null
let cliente: ClienteDeTeste | null = null
let slug = ''
let proc = ''
let pacote = ''
/** A venda de R$ 1.100 no crédito 3x (o pagamento do avulso). */
let venda = ''
let atendimentoDaVenda = ''
const n = (v: unknown) => Number(v ?? 0)
const soma = (linhas: { amount: unknown }[] | null) => Math.round((linhas ?? []).reduce((s, c) => s + n(c.amount), 0) * 100) / 100

/** Hoje em Brasília, "AAAA-MM-DD". */
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
/** O mesmo dia, `k` meses depois (o dia 31 vira o último dia do mês curto), "AAAA-MM-DD". */
function maisMeses(dia: string, k: number) {
  const [a, m, d] = dia.split('-').map(Number) as [number, number, number]
  const alvo = new Date(Date.UTC(a, m - 1 + k, 1))
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate()
  alvo.setUTCDate(Math.min(d, ultimo))
  return alvo.toISOString().slice(0, 10)
}
/** `k` dias corridos depois, "AAAA-MM-DD". */
function maisDias(dia: string, k: number) {
  const [a, m, d] = dia.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(a, m - 1, d + k)).toISOString().slice(0, 10)
}

async function comSessao(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

interface Parcela {
  id: string; transaction_id: string; parcela_numero: number; parcela_total: number
  valor: number; taxa_pct: number; taxa: number; liquido: number; estornado: number
  vencimento_dia: string; situacao: string
}
async function parcelasDa(tx: string): Promise<Parcela[]> {
  const { data, error } = await db().rpc('recebiveis_do_cartao_lista', {
    p_tenant: rede!.tenantId, p_branch_ids: null, p_from: null, p_to: null,
  })
  expect(error, 'ler as parcelas da operadora').toBeNull()
  return ((data ?? []) as Record<string, unknown>[])
    .filter(r => r.transaction_id === tx)
    .map(r => ({
      id: String(r.id), transaction_id: String(r.transaction_id), parcela_numero: n(r.parcela_numero), parcela_total: n(r.parcela_total),
      valor: n(r.valor), taxa_pct: n(r.taxa_pct), taxa: n(r.taxa), liquido: n(r.liquido), estornado: n(r.estornado),
      vencimento_dia: String(r.vencimento_dia), situacao: String(r.situacao),
    }))
    .sort((a, b) => a.parcela_numero - b.parcela_numero)
}
async function aReceberDaOperadora() {
  const { data, error } = await db().rpc('metrics_a_receber_da_operadora', {
    p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId], p_from: new Date(Date.now() - 86_400_000).toISOString(),
    p_to: new Date(Date.now() + 86_400_000).toISOString(),
  })
  expect(error, 'o a receber da operadora').toBeNull()
  return ((data ?? []) as Record<string, unknown>[]).find(r => r.branch_id == null) ?? {}
}
/** A receita paga do dia (a regra única, metrics_core.revenue_cash). */
async function receitaDeHoje() {
  const { data, error } = await db().rpc('metrics_core', {
    p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId],
    p_from: new Date(Date.now() - 6 * 3_600_000).toISOString(), p_to: new Date(Date.now() + 6 * 3_600_000).toISOString(),
  })
  expect(error, 'a receita do dia').toBeNull()
  return n((data as Record<string, unknown>[])[0]?.revenue_cash)
}
async function devidoDoAtendimento(ap: string) {
  const { data } = await db().from('commissions').select('amount').eq('appointment_id', ap)
  return soma(data)
}
async function atendimento(clientId: string) {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: clientId, professional_id: rede!.professionalId, procedure_id: proc,
    scheduled_at: new Date().toISOString(), duration_min: 30, price: 1100, status: 'IN_PROGRESS', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(error, 'criar o atendimento').toBeNull()
  return data!.id
}
async function concluir(ap: string, origem: 'AVULSO' | 'PACOTE') {
  const { error } = await db().rpc('concluir_atendimento', {
    p_agendamento: ap, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
    p_dados: { insumos: [], comissoes: [{ procedure_id: proc, origem, treatment_plan_id: null, regra_tipo: 'PERCENTAGE', regra_valor: 10, preco: 1100 }] },
  })
  expect(error, 'concluir').toBeNull()
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`cop${marca}`)
  proc = rede.procedureId
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('procedures').update({ name: `${PREFIXO} Laser ${marca}`, price: 1100 }).eq('id', proc)).error).toBeNull()
  cliente = await clienteComSessao(`copc${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  await responderAnamnese(cliente.clientId, rede.tenantId)
  expect((await db().from('users').update({ provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  expect((await db().from('commission_rules').insert({
    tenant_id: rede.tenantId, professional_id: rede.professionalId, procedure_id: null, type: 'PERCENTAGE', value: 10, is_active: true,
  })).error).toBeNull()
  // A taxa da maquininha no crédito 3x: 4,5%.
  expect((await db().from('payment_fees').insert({ tenant_id: rede.tenantId, metodo: 'CREDIT_CARD', parcelas: 3, taxa_pct: 4.5 })).error).toBeNull()
  // A fidelidade ligada: 1 ponto por real pago.
  const fid = await db().from('loyalty_configs').upsert({ tenant_id: rede.tenantId, enabled: true, points_per_real: 1, earn_mode: 'POR_REAL' }, { onConflict: 'tenant_id' })
  expect(fid.error, 'ligar a fidelidade').toBeNull()
  gestor = await criarMembro(`copg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestão',
    permissoes: [
      { modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' },
      { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'procedures', nivel: 'MANAGE' },
    ],
  })
  // O portal da rede manda ao /setup a rede sem onboarding.
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  dona = await criarMembro(`copd${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
  const { data, error } = await db().rpc('pacote_salvar', {
    p_tenant: rede.tenantId, p_id: null, p_nome: `${PREFIXO} Pacote cartão ${marca}`, p_preco: 3300, p_validade: null, p_ativo: true,
    p_itens: [{ procedure_id: proc, quantity: 3 }],
    p_comissao: { venda: null, execucao: { tipo: 'REGRA', valor: null } },
  })
  expect(error, 'criar o pacote').toBeNull()
  pacote = data as string
})

test.afterAll(async () => {
  const falhas: string[] = []
  if (rede) {
    const b = db()
    const passo = async (o: string, q: PromiseLike<{ error: { message: string } | null }>) => {
      const { error } = await q
      if (error) falhas.push(`${o}: ${error.message}`)
    }
    await passo('comissão', b.from('commission_lines').delete().eq('tenant_id', rede.tenantId))
    const { data: cps } = await b.from('client_packages').select('id').eq('branch_id', rede.branchId)
    const ids = (cps ?? []).map(c => c.id as string)
    if (ids.length) {
      await passo('sessões', b.from('package_sessions').delete().in('client_package_id', ids))
      await passo('lançamentos do pacote', b.from('financial_transactions').update({ client_package_id: null }).in('client_package_id', ids))
      await passo('pacotes do cliente', b.from('client_packages').delete().in('id', ids))
    }
    await passo('pacotes', b.from('service_packages').delete().eq('tenant_id', rede.tenantId))
    await passo('taxas', b.from('payment_fees').delete().eq('tenant_id', rede.tenantId))
  }
  await cliente?.limpar()
  await gestor?.limpar()
  await dona?.limpar()
  await rede?.limpar()
  expect(falhas).toEqual([])
})

test.describe.serial('cartão em N vezes: a receber da operadora, mês a mês', () => {
  test('a venda de R$ 1.100 no crédito 3x: 3 parcelas da operadora nos meses certos, comissão e pontos na hora, receita no dia da venda', async () => {
    const ap = await atendimento(cliente!.clientId)
    atendimentoDaVenda = ap
    await concluir(ap, 'AVULSO')
    const { data: tx, error } = await db().rpc('confirmar_pagamento_do_atendimento', {
      p_agendamento: ap, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
      p_dados: { metodo: 'CREDIT_CARD', cartao_vezes: 3, pontos: 0, desconto: 0, valor_final: 1100 },
    })
    expect(error, 'pagar em 3x').toBeNull()
    venda = tx as string

    // A venda é UM lançamento pago, como sempre.
    const { data: l } = await db().from('financial_transactions').select('is_paid, cartao_vezes, amount').eq('id', venda).single()
    expect(l).toEqual({ is_paid: true, cartao_vezes: 3, amount: 1100 })

    // A operadora: 3 parcelas, a cada 30 dias corridos da venda (o prazo
    // padrão, r2-fin-01), a taxa de 4,5% rateada.
    const hoje = hojeSP()
    const parcelas = await parcelasDa(venda)
    expect(parcelas.map(p => [p.parcela_numero, p.parcela_total, p.valor, p.vencimento_dia, p.situacao])).toEqual([
      [1, 3, 366.66, maisDias(hoje, 30), 'A_RECEBER'],
      [2, 3, 366.66, maisDias(hoje, 60), 'A_RECEBER'],
      [3, 3, 366.68, maisDias(hoje, 90), 'A_RECEBER'],
    ])
    expect(parcelas.every(p => p.taxa_pct === 4.5)).toBe(true)
    expect(Math.round(parcelas.reduce((s, p) => s + p.taxa, 0) * 100) / 100, 'a taxa de 4,5% sobre R$ 1.100').toBe(49.5)
    expect(Math.round(parcelas.reduce((s, p) => s + p.liquido, 0) * 100) / 100).toBe(1050.5)

    // A comissão libera na hora (H4): a quitação olha a VENDA, não as parcelas da operadora.
    expect(await devidoDoAtendimento(ap), 'comissão a pagar na hora').toBe(110)
    // Os pontos saem na venda: a cliente pagou tudo.
    const { data: ganho } = await db().from('loyalty_transactions').select('points').eq('transaction_id', venda).eq('kind', 'GANHO')
    expect(ganho?.map(g => g.points), 'os pontos da venda inteira').toEqual([1100])
    // A receita entra inteira no dia da venda.
    expect(await receitaDeHoje()).toBe(1100)
    // O a receber da operadora: tudo em aberto, nada no período de hoje.
    const op = await aReceberDaOperadora()
    expect([n(op.a_receber), n(op.em_aberto)]).toEqual([0, 1100])
  })

  test('a cliente não deve nada: nem a ficha, nem o Fechamento, nem o app', async ({ browser }) => {
    const { data: fin, error } = await db().rpc('metrics_financeiro_do_cliente', { p_tenant: rede!.tenantId, p_client: cliente!.clientId })
    expect(error).toBeNull()
    expect(n((fin as Record<string, unknown>[])[0]?.a_receber), 'a receber da cliente na ficha').toBe(0)
    const { data: ar, error: eAr } = await db().rpc('atendimentos_a_receber', { p_tenant: rede!.tenantId, p_unidade: rede!.branchId })
    expect(eAr).toBeNull()
    expect(((ar ?? []) as { appointment_id: string }[]).map(a => a.appointment_id), 'concluídos a receber do Fechamento').not.toContain(atendimentoDaVenda)
    const { data: aberto } = await db().rpc('metrics_a_receber_em_aberto', { p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId] })
    expect(n(((aberto ?? []) as Record<string, unknown>[]).find(r => r.branch_id == null)?.valor), 'a receber da cliente no Financeiro').toBe(0)

    await comSessao(browser, cliente!.estado, async p => {
      await p.goto(`/${slug}/cliente/financeiro`)
      await expect(p.getByRole('heading', { name: 'Financeiro' })).toBeVisible()
      await expect(p.getByText('Crédito 3x')).toBeVisible()
      await expect(p.getByText('Pago', { exact: true })).toHaveCount(1)
      await expect(p.getByText('Pendente', { exact: true })).toHaveCount(0)
    })
  })

  test('o Financeiro mostra os dois a receber, nomeados, e a parcela antecipada não soma receita', async ({ browser }) => {
    test.setTimeout(150_000)
    const hoje = hojeSP()
    const ate = maisMeses(hoje, 4)
    await comSessao(browser, gestor!.estado, async p => {
      await p.goto(`/admin/financeiro?period=custom&from=${hoje}&to=${ate}`)
      await expect(p.locator('[data-kpi="a-receber"]')).toContainText('A receber da cliente')
      const kpi = p.locator('[data-kpi="a-receber-operadora"]')
      await expect(kpi).toContainText('A receber da operadora')
      await expect(kpi).toContainText('R$ 1.100,00')

      const lista = p.locator('[data-recebiveis-da-operadora]')
      await expect(lista).toContainText('A cliente já pagou')
      const linhas = lista.locator('[data-parcela-da-operadora]')
      await expect(linhas).toHaveCount(3)
      const primeira = lista.locator('[data-parcela-da-operadora][data-numero="1"]')
      await expect(primeira).toContainText('1/3')
      await expect(primeira).toContainText('R$ 366,66')
      await expect(primeira).toContainText('A receber')

      // A operadora antecipou: marca à mão.
      await primeira.getByRole('button', { name: 'Marcar recebida' }).click()
      const dlg = p.getByRole('dialog', { name: 'Marcar a parcela como recebida' })
      await dlg.getByRole('button', { name: 'Marcar recebida' }).click()
      await expect(primeira).toContainText('Antecipada')
      await expect(kpi).toContainText('R$ 733,34')

      // Foi engano: "Desfazer" pede confirmação e a parcela volta a receber
      // (r2-fin-02, o Heitor: "mudar solicitando confirmação antes de desfazer").
      await primeira.getByRole('button', { name: 'Desfazer' }).click()
      const desfazer = p.getByRole('dialog', { name: 'Desfazer o recebimento da parcela' })
      await expect(desfazer).toContainText('volta para a receber')
      await desfazer.getByRole('button', { name: 'Voltar' }).click()
      await expect(desfazer).toBeHidden()
      await expect(primeira, 'sem confirmar, nada muda').toContainText('Antecipada')
      await primeira.getByRole('button', { name: 'Desfazer' }).click()
      await p.getByRole('dialog', { name: 'Desfazer o recebimento da parcela' }).getByRole('button', { name: 'Desfazer' }).click()
      await expect(primeira).toContainText('A receber')
      await expect(kpi).toContainText('R$ 1.100,00')

      // E marca de novo (o resto do spec segue com ela antecipada).
      await primeira.getByRole('button', { name: 'Marcar recebida' }).click()
      await p.getByRole('dialog', { name: 'Marcar a parcela como recebida' }).getByRole('button', { name: 'Marcar recebida' }).click()
      await expect(primeira).toContainText('Antecipada')
      await expect(kpi).toContainText('R$ 733,34')

      // O financeiro da unidade mostra o mesmo.
      await p.goto(`/${slug}/financeiro?period=custom&from=${hoje}&to=${ate}`)
      await expect(p.locator('[data-kpi="a-receber-operadora"]')).toContainText('R$ 733,34')
      await expect(p.locator('[data-recebiveis-da-operadora] [data-parcela-da-operadora]')).toHaveCount(3)
    })
    const parcelas = await parcelasDa(venda)
    expect(parcelas.map(x => x.situacao)).toEqual(['ANTECIPADA', 'A_RECEBER', 'A_RECEBER'])
    // A baixa da parcela NÃO soma receita: a venda já entrou inteira.
    expect(await receitaDeHoje()).toBe(1100)
  })

  test('quem só vê o Financeiro não marca a parcela recebida', async ({ browser }) => {
    const leitor = await criarMembro(`copl${marca}`, {
      tenant: rede!.tenantId, rotulo: 'Só vê', permissoes: [{ modulo: 'financial', nivel: 'VIEW' }],
    })
    try {
      const hoje = hojeSP()
      await comSessao(browser, leitor.estado, async p => {
        await p.goto(`/admin/financeiro?period=custom&from=${hoje}&to=${maisMeses(hoje, 4)}`)
        await expect(p.locator('[data-recebiveis-da-operadora] [data-parcela-da-operadora]')).toHaveCount(3)
        await expect(p.locator('[data-recebiveis-da-operadora]').getByRole('button', { name: 'Marcar recebida' })).toHaveCount(0)
        await expect(p.locator('[data-recebiveis-da-operadora]').getByRole('button', { name: 'Desfazer' })).toHaveCount(0)
        // Nem pela action.
        const primeira = (await parcelasDa(venda))[0]!
        const r = await chamarAcao(p, 'actions/financial.ts', 'desfazerRecebimentoDaParcelaDaOperadora', '/admin/financeiro', [primeira.id])
        expect(r.texto).not.toMatch(/"success":true/)
      })
      expect((await parcelasDa(venda))[0]!.situacao, 'quem só vê não desfaz').toBe('ANTECIPADA')
    } finally { await leitor.limpar() }
  })

  test('o estorno da venda cancela as parcelas a receber e estorna a já recebida', async () => {
    const { error } = await db().rpc('estornar_transacao', { p_transacao: venda, p_tenant: rede!.tenantId, p_ator: 'e2e', p_motivo: 'e2e' })
    expect(error, 'estornar').toBeNull()
    const parcelas = await parcelasDa(venda)
    expect(parcelas.map(x => [x.situacao, x.valor, x.estornado])).toEqual([
      ['ESTORNADA', 0, 366.66], ['CANCELADA', 0, 0], ['CANCELADA', 0, 0],
    ])
    expect(n((await aReceberDaOperadora()).em_aberto)).toBe(0)
    expect(await devidoDoAtendimento(atendimentoDaVenda), 'o estorno devolve a comissão, como sempre').toBe(0)
  })

  test('a clínica muda o prazo da operadora para 15 dias em Configurações → Comissões, e a próxima venda cai a cada 15 dias', async ({ browser }) => {
    await comSessao(browser, dona!.estado, async p => {
      await p.goto('/admin/settings?tab=comissoes')
      const campo = p.getByLabel('Prazo da operadora (dias)')
      await expect(campo, 'o padrão: 30 dias').toHaveValue('30')
      await campo.fill('15')
      await p.getByRole('button', { name: 'Salvar taxas' }).click()
      await expect(p.getByRole('status').filter({ hasText: 'Salvo.' })).toBeVisible()
    })
    expect((await primeiraMaquininha(rede!.tenantId)).prazo_dias, 'o prazo da maquininha (C75)').toBe(15)
    const { data, error } = await db().from('financial_transactions').insert({
      branch_id: rede!.branchId, client_id: cliente!.clientId, type: 'INCOME', category: 'Serviços',
      description: `${PREFIXO} Venda com prazo de 15 dias ${marca}`, amount: 300, payment_method: 'CREDIT_CARD', cartao_vezes: 2,
      is_paid: true, paid_at: new Date().toISOString(), created_by: 'e2e',
    }).select('id').single<{ id: string }>()
    expect(error).toBeNull()
    const hoje = hojeSP()
    expect((await parcelasDa(data!.id)).map(x => [x.valor, x.vencimento_dia])).toEqual([[150, maisDias(hoje, 15)], [150, maisDias(hoje, 30)]])
    // A venda que já existia não muda: o vencimento é retratado na venda.
    expect((await parcelasDa(venda)).map(x => x.vencimento_dia)).toEqual([maisDias(hoje, 30), maisDias(hoje, 60), maisDias(hoje, 90)])
    // Fora do intervalo, a action recusa.
    await comSessao(browser, dona!.estado, async p => {
      await p.goto('/admin/settings?tab=comissoes')
      const m = await primeiraMaquininha(rede!.tenantId)
      const r = await chamarAcao(p, 'actions/maquininhas.ts', 'salvarMaquininha', '/admin/settings', [{
        id: m.id, nome: 'Maquininha', taxas: m.taxas, maxVezes: m.max_vezes, prazoDias: 0, cobraPorBandeira: false, porBandeira: {},
      }])
      expect(r.texto).toContain('de 1 a 120 dias')
    })
    expect((await db().from('tenants').update({ cartao_prazo_dias: 30 }).eq('id', rede!.tenantId)).error).toBeNull()
  })

  test('a parcela vira recebida sozinha na data, sem ninguém clicar', async () => {
    const pago = new Date(Date.now() - 40 * 86_400_000).toISOString()
    const { data, error } = await db().from('financial_transactions').insert({
      branch_id: rede!.branchId, client_id: cliente!.clientId, type: 'INCOME', category: 'Serviços',
      description: `${PREFIXO} Venda antiga ${marca}`, amount: 200, payment_method: 'CREDIT_CARD', cartao_vezes: 2,
      is_paid: true, paid_at: pago, created_by: 'e2e',
    }).select('id').single<{ id: string }>()
    expect(error).toBeNull()
    const parcelas = await parcelasDa(data!.id)
    expect(parcelas.map(x => [x.valor, x.situacao])).toEqual([[100, 'RECEBIDA'], [100, 'A_RECEBER']])
    // A recebida na data não se desfaz: o "Desfazer" é só da antecipada (r2-fin-02).
    const { error: eD } = await db().rpc('recebivel_do_cartao_desfazer', { p_tenant: rede!.tenantId, p_recebivel: parcelas[0]!.id, p_ator: 'e2e' })
    expect(eD?.message).toMatch(/recebida na data/)
  })

  test('o pacote no crédito 3x cancelado com estorno: o cartão estorna o pagamento inteiro, as parcelas da operadora caem juntas, e o usado entra de novo (r2-fin-03)', async () => {
    const outra = await rede!.criarCliente('Pacote no cartão')
    await responderAnamnese(outra, rede!.tenantId)
    const { data: cp, error } = await db().rpc('pacote_vender', {
      p_tenant: rede!.tenantId, p_cliente: outra, p_pacote: pacote, p_unidade: rede!.branchId, p_ator: gestor!.userId,
      p_lancamentos: [{ amount: 3300, payment_method: 'CREDIT_CARD', is_paid: true, cartao_vezes: 3 }],
      p_sessoes: Array.from({ length: 3 }, () => ({ procedure_id: proc, preco: 1100 })),
    })
    expect(error, 'vender o pacote no cartão').toBeNull()
    const { data: tx } = await db().from('financial_transactions').select('id').eq('client_package_id', cp as string).single<{ id: string }>()
    expect((await parcelasDa(tx!.id)).map(x => x.valor)).toEqual([1100, 1100, 1100])

    // Uma sessão feita (R$ 1.100 usados), e o cancelamento devolve R$ 2.200.
    const ap = await atendimento(outra)
    expect((await db().from('package_sessions').update({ appointment_id: ap }).eq('client_package_id', cp as string).eq('session_number', 1)).error).toBeNull()
    await concluir(ap, 'PACOTE')
    const args = { p_tenant: rede!.tenantId, p_pacote: cp, p_ator: gestor!.userId, p_ator_nome: 'e2e', p_motivo: 'desistiu', p_destino: 'ESTORNO', p_agendamentos: null }
    const { data: previa, error: eP } = await db().rpc('pacote_cancelar', { ...args, p_esperado: 0, p_simular: true })
    expect(eP).toBeNull()
    expect(n((previa as Record<string, unknown>).devolver)).toBe(2200)
    // O estorno em parte do cartão não existe mais.
    const { error: eParcial } = await db().rpc('pacote_cancelar', { ...args, p_esperado: 2200, p_simular: false })
    expect(eParcial?.message).toMatch(/No cartão, o estorno é do pagamento inteiro/)
    const { error: eC } = await db().rpc('pacote_cancelar_devolvendo', {
      ...args, p_esperado: 2200, p_simular: false, p_estorno: 'INTEIRO', p_novo: { metodo: 'CREDIT_CARD', vezes: 2 },
    })
    expect(eC, 'cancelar estornando o cartão inteiro').toBeNull()

    // O pagamento no cartão foi estornado inteiro: as 3 parcelas da operadora caem.
    expect((await db().from('financial_transactions').select('amount, notes').eq('id', tx!.id).single()).data).toEqual({ amount: 3300, notes: 'Estornada' })
    expect((await parcelasDa(tx!.id)).map(x => [x.situacao, x.valor])).toEqual([['CANCELADA', 0], ['CANCELADA', 0], ['CANCELADA', 0]])
    // E o usado entrou de novo, no crédito 2x: duas parcelas novas da operadora.
    const { data: novo } = await db().from('financial_transactions').select('id, amount, cartao_vezes')
      .eq('client_package_id', cp as string).is('notes', null).eq('type', 'INCOME').single()
    expect({ v: n(novo!.amount), vezes: novo!.cartao_vezes }).toEqual({ v: 1100, vezes: 2 })
    expect((await parcelasDa(novo!.id)).map(x => [x.situacao, x.valor])).toEqual([['A_RECEBER', 550], ['A_RECEBER', 550]])
  })
})

/**
 * D4 da 6ª simulação: o crédito À VISTA também vira recebível da operadora —
 * a operadora deposita em 30 (ou no prazo da bandeira) dias, com a taxa do 1x,
 * como as N vezes. O débito e o Pix seguem recebidos no dia: não há prazo
 * configurado para eles (princípio 4 do CLAUDE.md, "não chutar número").
 *
 * D13: a taxa por parcela leva a sobra do arredondamento na última, como o
 * valor — Visa 2x de R$ 750 a 2,38% são 8,93 + 8,92 = R$ 17,85, o mesmo que o
 * Fechamento estima (era 8,93 + 8,93 = R$ 17,86).
 */
test.describe('F20: a sobra da taxa e a lista da operadora', () => {
  async function lancar(amount: number, metodo: string, extra: Record<string, unknown> = {}) {
    const { data, error } = await db().from('financial_transactions').insert({
      branch_id: rede!.branchId, client_id: cliente!.clientId, type: 'INCOME', category: 'Serviços',
      description: `${PREFIXO} Cartão ${metodo} ${amount} ${marca}`, amount, payment_method: metodo,
      is_paid: true, paid_at: new Date().toISOString(), created_by: 'e2e', ...extra,
    }).select('id').single<{ id: string }>()
    expect(error, 'lançar').toBeNull()
    return data!.id
  }

  test('D4: o crédito 1x vira UMA parcela da operadora, no prazo da bandeira e com a taxa do 1x; débito e Pix não', async () => {
    expect((await db().from('payment_fees').insert({ tenant_id: rede!.tenantId, metodo: 'CREDIT_CARD', parcelas: 1, taxa_pct: 1.19 })).error).toBeNull()
    expect((await db().from('tenants').update({ cartao_por_bandeira: { ELO: { prazo: 32, taxas: {} } } }).eq('id', rede!.tenantId)).error).toBeNull()
    try {
      const hoje = hojeSP()
      const elo = await lancar(1000, 'CREDIT_CARD', { cartao_bandeira: 'ELO' })
      expect((await parcelasDa(elo)).map(p => [p.parcela_numero, p.parcela_total, p.valor, p.taxa_pct, p.taxa, p.liquido, p.vencimento_dia, p.situacao]),
        'Elo 1x: o prazo de 32 dias da Elo, a taxa do 1x da regra geral').toEqual([
        [1, 1, 1000, 1.19, 11.9, 988.1, maisDias(hoje, 32), 'A_RECEBER'],
      ])
      const semBandeira = await lancar(100, 'CREDIT_CARD')
      expect((await parcelasDa(semBandeira)).map(p => [p.valor, p.taxa, p.vencimento_dia]), 'sem bandeira: o prazo geral').toEqual([
        [100, 1.19, maisDias(hoje, 30)],
      ])
      // O débito e o Pix: recebidos no dia, sem parcela da operadora.
      expect(await parcelasDa(await lancar(248, 'DEBIT_CARD', { cartao_bandeira: 'VISA' })), 'débito').toEqual([])
      expect(await parcelasDa(await lancar(100, 'PIX')), 'Pix').toEqual([])
      // O estorno do crédito 1x cancela a parcela, como no N vezes.
      expect((await db().rpc('estornar_transacao', { p_transacao: elo, p_tenant: rede!.tenantId, p_ator: 'e2e', p_motivo: 'e2e' })).error).toBeNull()
      expect((await parcelasDa(elo)).map(p => [p.situacao, p.valor])).toEqual([['CANCELADA', 0]])
    } finally {
      expect((await db().from('tenants').update({ cartao_por_bandeira: {} }).eq('id', rede!.tenantId)).error).toBeNull()
      expect((await db().from('payment_fees').delete().eq('tenant_id', rede!.tenantId).eq('metodo', 'CREDIT_CARD').eq('parcelas', 1)).error).toBeNull()
    }
  })

  test('D13: a sobra do arredondamento da taxa vai na última parcela (Visa 2x de R$ 750 a 2,38% = 8,93 + 8,92)', async () => {
    expect((await db().from('payment_fees').insert({ tenant_id: rede!.tenantId, metodo: 'CREDIT_CARD', parcelas: 2, taxa_pct: 2.38 })).error).toBeNull()
    try {
      const tx = await lancar(750, 'CREDIT_CARD', { cartao_vezes: 2, cartao_bandeira: 'VISA' })
      const parcelas = await parcelasDa(tx)
      expect(parcelas.map(p => [p.valor, p.taxa, p.liquido])).toEqual([[375, 8.93, 366.07], [375, 8.92, 366.08]])
      expect(Math.round(parcelas.reduce((s, p) => s + p.taxa, 0) * 100) / 100, 'a taxa da venda: 2,38% de R$ 750').toBe(17.85)
    } finally {
      expect((await db().from('payment_fees').delete().eq('tenant_id', rede!.tenantId).eq('metodo', 'CREDIT_CARD').eq('parcelas', 2)).error).toBeNull()
    }
  })

  test('D3: a lista mostra TODO o em aberto da operadora, por mês de depósito, e o cartão leva até ela (nos dois portais)', async ({ browser }) => {
    const tx = await lancar(600, 'CREDIT_CARD', { cartao_vezes: 2 })
    const parcelas = await parcelasDa(tx)
    expect(parcelas.map(p => p.situacao)).toEqual(['A_RECEBER', 'A_RECEBER'])
    const mesDe = (dia: string) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${dia}T12:00:00Z`))
    const descricao = `${PREFIXO} Cartão CREDIT_CARD 600 ${marca}`
    for (const rota of ['/admin/financeiro', `/${slug}/financeiro`]) {
      await comSessao(browser, gestor!.estado, async p => {
        // O período padrão (o mês): as duas parcelas vencem nos próximos meses.
        await p.goto(rota)
        const kpi = p.locator('[data-kpi="a-receber-operadora"]')
        const link = kpi.getByRole('link', { name: 'Ver as parcelas' })
        await expect(link).toHaveAttribute('href', '#recebiveis-da-operadora')
        const lista = p.locator('#recebiveis-da-operadora')
        const daVenda = lista.locator('[data-parcela-da-operadora]').filter({ hasText: descricao })
        await expect(daVenda).toHaveCount(2)
        for (const pa of parcelas) {
          await expect(lista.locator(`[data-mes-da-operadora="${pa.vencimento_dia.slice(0, 7)}"]`))
            .toContainText(new RegExp(mesDe(pa.vencimento_dia), 'i'))
        }
        // O "Marcar recebida" (a antecipação) está na lista, para quem lança.
        await expect(daVenda.getByRole('button', { name: 'Marcar recebida' })).toHaveCount(2)
        await link.click()
        await expect(p).toHaveURL(/#recebiveis-da-operadora$/)
      })
    }
  })
})
