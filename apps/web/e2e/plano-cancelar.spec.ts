import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { responderAnamnese } from './apoio/anamnese'
import { chamarAcao } from './apoio/acao-direta'

/**
 * CANCELAR O PLANO FECHADO (D4 da 9ª simulação; decisão 2 do Heitor,
 * 2026-11-07: "sim usa a mesma coisa do pacote, como ja expliquei, a diferenca
 * entre pacote e plano é que o plano é personalizado para o cliente conforme a
 * necessidade dele e o pacote é uma oferta de um conjunto de procedimentos
 * montado previsamente, os dois são, em essencia, conjuntos de procedimentos").
 *
 * A Luana fez 1 de 10 sessões e desistiu; o plano fechado não se cancelava, e
 * o "A receber" da clínica e o app dela seguiam com as parcelas. Agora a
 * MESMA regra do "Cancelar pacote": o usado vale o preço das sessões feitas no
 * plano (com o desconto), sem multa; o crediário que passa do usado cai antes;
 * o pago além do usado volta como estorno ou crédito, a escolher; as sessões
 * agendadas se cancelam ou ficam avulsas; a comissão de venda volta na
 * proporção. Uma transação (`plano_cancelar_devolvendo`), o Financeiro em
 * Gerenciar e a unidade ao alcance.
 *
 * O plano: 3 sessões — criolipólise R$ 585, drenagem R$ 144, criolipólise
 * R$ 585 (R$ 1.314, com o desconto) —, 10% de comissão de venda.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let soVe: MembroDeTeste | null = null
let cliente: ClienteDeTeste | null = null
let slug = ''
let crio = ''
let drenagem = ''
const planos: string[] = []
const agendamentos: string[] = []
const n = (v: unknown) => Number(v ?? 0)
const centavos = (v: number) => Math.round(v * 100) / 100
const daqui = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString()
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

async function comSessao<T>(browser: Browser, estado: string, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** O plano fechado, com as três sessões, o dinheiro e a comissão de venda do gestor. */
async function planoFechado(lancamentos: Record<string, unknown>[]) {
  const { data: pl, error } = await db().from('treatment_plans').insert({
    branch_id: rede!.branchId, client_id: cliente!.clientId, professional_id: rede!.professionalId,
    status: 'ACCEPTED', name: `${PREFIXO} Plano corporal ${marca}`, aceito_em: new Date().toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error, 'criar o plano').toBeNull()
  const plano = pl!.id
  planos.push(plano)
  const { data: sessoes, error: eS } = await db().from('treatment_plan_sessions').insert(
    [0, 1, 2].map(i => ({ plan_id: plano, sort_order: i })),
  ).select('id, sort_order')
  expect(eS).toBeNull()
  const ord = [...sessoes!].sort((a, b) => a.sort_order - b.sort_order)
  expect((await db().from('treatment_plan_session_procedures').insert([
    { session_id: ord[0]!.id, procedure_id: crio, price: 585, sort_order: 0 },
    { session_id: ord[1]!.id, procedure_id: drenagem, price: 144, sort_order: 0 },
    { session_id: ord[2]!.id, procedure_id: crio, price: 585, sort_order: 0 },
  ])).error).toBeNull()
  expect((await db().from('financial_transactions').insert(lancamentos.map(l => ({
    branch_id: rede!.branchId, client_id: cliente!.clientId, treatment_plan_id: plano, type: 'INCOME', category: 'Serviços',
    description: 'Plano de tratamento', created_by: 'e2e', ...l,
  })))).error, 'o dinheiro do plano').toBeNull()
  const { error: eC } = await db().rpc('plano_comissao_de_venda', { p_tenant: rede!.tenantId, p_plano: plano, p_vendedor: gestor!.userId })
  expect(eC, 'a comissão de venda do plano').toBeNull()
  return { plano, sessoes: ord.map(s => s.id as string) }
}

async function agendamento(proc: string, preco: number, extra: Record<string, unknown>) {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente!.clientId, professional_id: rede!.professionalId, procedure_id: proc,
    scheduled_at: new Date().toISOString(), duration_min: 60, price: preco, status: 'IN_PROGRESS', source: 'INTERNAL', ...extra,
  }).select('id').single<{ id: string }>()
  expect(error, 'criar o agendamento').toBeNull()
  agendamentos.push(data!.id)
  return data!.id
}
/** A sessão 1 (criolipólise) feita, concluída pelo banco como a tela faz. */
async function sessaoFeita(plano: string, sessao: string) {
  const ap = await agendamento(crio, 585, { treatment_plan_id: plano })
  expect((await db().from('treatment_plan_sessions').update({ appointment_id: ap }).eq('id', sessao)).error).toBeNull()
  const { error } = await db().rpc('concluir_atendimento', {
    p_agendamento: ap, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
    p_dados: { insumos: [], comissoes: [{ procedure_id: crio, origem: 'PLANO', treatment_plan_id: plano, regra_tipo: 'PERCENTAGE', regra_valor: 10, preco: 585 }] },
  })
  expect(error, 'concluir a sessão').toBeNull()
  return ap
}
/** A sessão 2 (drenagem) agendada para depois de amanhã. */
async function sessaoAgendada(plano: string, sessao: string) {
  const ap = await agendamento(drenagem, 144, { treatment_plan_id: plano, status: 'SCHEDULED', scheduled_at: daqui(2), duration_min: 50 })
  expect((await db().from('treatment_plan_sessions').update({ appointment_id: ap }).eq('id', sessao)).error).toBeNull()
  return ap
}
async function lancamentos(plano: string) {
  const { data } = await db().from('financial_transactions').select('id, amount, is_paid, notes, parcela_numero')
    .eq('treatment_plan_id', plano).eq('type', 'INCOME').order('created_at').order('parcela_numero', { nullsFirst: true })
  return (data ?? []).map(t => ({ v: n(t.amount), pago: t.is_paid, notes: t.notes }))
}
async function comissaoDaVenda(plano: string) {
  const { data: l, error } = await db().from('commission_lines').select('id, status')
    .eq('treatment_plan_id', plano).is('appointment_id', null).eq('origem', 'PLANO').single()
  expect(error, 'a linha da venda do plano').toBeNull()
  const { data: c } = await db().from('commissions').select('amount').eq('line_id', l!.id)
  return { status: l!.status as string, lancado: centavos((c ?? []).reduce((s, x) => s + n(x.amount), 0)) }
}
async function credito() {
  const { data } = await db().from('internal_credits').select('amount').eq('client_id', cliente!.clientId)
  return centavos((data ?? []).reduce((s, c) => s + n(c.amount), 0))
}
async function vendaDoPlano(plano: string) {
  const dia = hoje()
  const { data, error } = await db().rpc('metrics_vendas', {
    p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId], p_from: `${dia}T00:00:00-03:00`, p_to: `${dia}T23:59:59-03:00`,
  })
  expect(error).toBeNull()
  return ((data ?? []) as { id: string; valor: number }[]).find(v => v.id === plano)
}
async function abrirCancelamento(p: Page) {
  await p.goto(`/admin/clients/${cliente!.clientId}`)
  await p.getByRole('button', { name: 'Cancelar plano' }).first().click()
  const dlg = p.getByRole('dialog', { name: 'Cancelar plano' })
  await expect(dlg.locator('[data-conta-do-cancelamento]')).toBeVisible()
  return dlg
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`plcan${marca}`)
  crio = rede.procedureId
  expect((await db().from('procedures').update({ name: `${PREFIXO} Criolipólise ${marca}`, price: 650, duration_min: 60 }).eq('id', crio)).error).toBeNull()
  const { data: dr, error: eD } = await db().from('procedures').insert({
    tenant_id: rede.tenantId, name: `${PREFIXO} Drenagem ${marca}`, category: 'Corporal', price: 160, duration_min: 50, is_active: true,
  }).select('id').single<{ id: string }>()
  expect(eD, 'a drenagem').toBeNull()
  drenagem = dr!.id
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  cliente = await clienteComSessao(`plcanc${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  await responderAnamnese(cliente.clientId, rede.tenantId)
  expect((await db().from('commission_configs').upsert({ tenant_id: rede.tenantId, plano_pct: 10 }, { onConflict: 'tenant_id' })).error).toBeNull()
  const tudo = [
    { modulo: 'procedures', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' },
    { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'medical_records', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' },
  ] as const
  gestor = await criarMembro(`plcang${marca}`, { tenant: rede.tenantId, rotulo: 'Gestão', permissoes: [...tudo] })
  soVe = await criarMembro(`plcanv${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'financial', nivel: 'VIEW' }, { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  const b = db()
  if (rede) await b.from('commission_lines').delete().eq('tenant_id', rede.tenantId)
  if (planos.length) {
    await b.from('financial_transactions').delete().in('treatment_plan_id', planos)
    await b.from('treatment_plans').delete().in('id', planos)
  }
  if (agendamentos.length) {
    await b.from('appointment_history').delete().in('appointment_id', agendamentos)
    await b.from('appointments').delete().in('id', agendamentos)
  }
  await gestor?.limpar(); await soVe?.limpar(); await cliente?.limpar()
  if (rede) await b.from('commission_configs').delete().eq('tenant_id', rede.tenantId)
  await rede?.limpar()
})

test.describe.serial('cancelar o plano fechado', () => {
  test('D4 pela ficha: entrada de R$ 500 + 2 × R$ 407, 1 sessão feita — as parcelas que passam do usado caem, a agendada se cancela, e o app não cobra mais', async ({ browser }) => {
    const { plano, sessoes } = await planoFechado([
      { amount: 500, payment_method: 'PIX', is_paid: true, paid_at: new Date().toISOString() },
      ...[1, 2].map(i => ({ amount: 407, is_paid: false, due_date: daqui(30 * i), parcela_numero: i, parcela_total: 2 })),
    ])
    await sessaoFeita(plano, sessoes[0]!)
    const agendada = await sessaoAgendada(plano, sessoes[1]!)

    await comSessao(browser, gestor!.estado, async p => {
      const dlg = await abrirCancelamento(p)
      const conta = dlg.locator('[data-conta-do-cancelamento]')
      await expect(conta).toContainText('2 de 3 sessões restantes')
      await expect(conta).toContainText('R$ 729,00')
      await expect(conta).toContainText('Usado: R$ 585,00')
      await expect(conta).toContainText('Parcelas a receber que caem')
      await expect(conta.locator('[data-a-devolver]')).toContainText('R$ 0,00')
      await expect(dlg.locator('[data-agendamentos-do-pacote]')).toContainText('1 sessão já agendada')
      await dlg.getByLabel('Motivo do cancelamento *').fill('Desistiu do tratamento')
      await expect(dlg.getByRole('button', { name: 'Cancelar plano' }), 'sem dizer o que fazer com o agendamento, não cancela').toBeDisabled()
      await dlg.getByRole('radio', { name: /Cancelar os agendamentos/ }).check()
      await dlg.getByRole('button', { name: 'Cancelar plano' }).click()
      await expect(dlg).toBeHidden()

      // A ficha: o plano saiu do "Tratamento em andamento" e o cancelamento está no histórico.
      await expect(p.getByText('Nenhum pacote ativo.')).toBeVisible()
      await p.getByRole('tab', { name: 'Histórico' }).click()
      await expect(p.getByText(/Plano cancelado:/)).toBeVisible()
    })

    const { data: tp } = await db().from('treatment_plans').select('status, cancelado_em, valor_cancelado, cancelamento_motivo').eq('id', plano).single()
    expect({ status: tp!.status, cancelado: !!tp!.cancelado_em, valor: n(tp!.valor_cancelado), motivo: tp!.cancelamento_motivo })
      .toEqual({ status: 'CANCELLED', cancelado: true, valor: 729, motivo: 'Desistiu do tratamento' })
    expect(await lancamentos(plano), 'cai R$ 729: a 2ª parcela inteira, e a 1ª fica com R$ 85')
      .toEqual([
        { v: 500, pago: true, notes: null },
        { v: 85, pago: false, notes: null },
        { v: 407, pago: false, notes: 'Estornada' },
      ])
    const { data: ag } = await db().from('appointments').select('status, cancellation_reason').eq('id', agendada).single()
    expect(ag!.status).toBe('CANCELLED')
    expect(ag!.cancellation_reason).toContain('Desistiu do tratamento')
    expect(await credito(), 'nada a devolver').toBe(0)
    expect(await comissaoDaVenda(plano), 'a venda ainda aguarda os R$ 85: nada lançado, e a linha segue viva').toEqual({ status: 'ATIVA', lancado: 0 })
    expect(n((await vendaDoPlano(plano))?.valor), 'nas Vendas, o plano vale o usado').toBe(585)
    const { data: fin } = await db().rpc('metrics_financeiro_do_plano', { p_tenant: rede!.tenantId, p_plan: plano })
    expect(n((fin as { a_receber: number }[])[0]?.a_receber), 'o a receber do plano é o que sobrou do usado').toBe(85)

    // Os R$ 85 entram: a comissão de venda libera sobre o usado (10% de R$ 585).
    const { data: aberta } = await db().from('financial_transactions').select('id').eq('treatment_plan_id', plano).eq('is_paid', false).is('notes', null).single()
    expect((await db().from('financial_transactions').update({ is_paid: true, paid_at: new Date().toISOString(), payment_method: 'PIX' }).eq('id', aberta!.id)).error).toBeNull()
    await expect.poll(async () => (await comissaoDaVenda(plano)).lancado).toBe(58.5)

    // O app da Luana: sem o cartão do plano ("N sessões a agendar"), e o pagamento diz que o plano foi cancelado.
    await comSessao(browser, cliente!.estado, async p => {
      await p.goto(`/${slug}/cliente/home`)
      await expect(p.getByRole('heading').first()).toBeVisible()
      await expect(p.locator('[data-plano-fechado]')).toHaveCount(0)
      await p.goto(`/${slug}/cliente/financeiro`)
      await expect(p.locator('[data-plano-cancelado]').first()).toContainText('Plano cancelado em')
    })

    // Não se cancela duas vezes.
    await comSessao(browser, gestor!.estado, async p => {
      await p.goto(`/admin/clients/${cliente!.clientId}`)
      const r = await chamarAcao(p, 'actions/treatment-plans.ts', 'cancelarPlano', `/admin/clients/${cliente!.clientId}`,
        [plano, { motivo: 'De novo', destino: null, agendamentos: null, esperado: 0 }])
      expect(r.texto).toMatch(/já foi cancelado/i)
    })
  })

  test('D4 à vista no Pix: o pago além do usado volta em estorno parcial, e a sessão agendada fica avulsa com o preço dela', async ({ browser }) => {
    const { plano, sessoes } = await planoFechado([
      { amount: 1314, payment_method: 'PIX', is_paid: true, paid_at: new Date().toISOString() },
    ])
    await sessaoFeita(plano, sessoes[0]!)
    const agendada = await sessaoAgendada(plano, sessoes[1]!)
    expect((await comissaoDaVenda(plano)).lancado, 'antes: 10% do plano pago').toBe(131.4)

    await comSessao(browser, gestor!.estado, async p => {
      const dlg = await abrirCancelamento(p)
      await expect(dlg.locator('[data-a-devolver]')).toContainText('R$ 729,00')
      await dlg.getByLabel('Motivo do cancelamento *').fill('Mudou de cidade')
      await dlg.getByRole('radio', { name: /^Estorno —/ }).check()
      await dlg.getByRole('radio', { name: /Estorno parcial/ }).check()
      await dlg.getByRole('radio', { name: /Manter como avulso/ }).check()
      await dlg.getByRole('button', { name: 'Cancelar plano' }).click()
      await expect(dlg).toBeHidden()
    })

    expect(await lancamentos(plano), 'o Pix fica com o usado').toEqual([{ v: 585, pago: true, notes: null }])
    const { data: estorno } = await db().from('financial_transactions').select('amount, type, payment_method')
      .eq('client_id', cliente!.clientId).eq('category', 'Estorno').order('created_at', { ascending: false }).limit(1).single()
    expect({ v: n(estorno!.amount), tipo: estorno!.type, forma: estorno!.payment_method }).toEqual({ v: 729, tipo: 'EXPENSE', forma: 'PIX' })
    const { data: ag } = await db().from('appointments').select('status, price, treatment_plan_id').eq('id', agendada).single()
    expect({ status: ag!.status, preco: n(ag!.price), plano: ag!.treatment_plan_id }, 'fica avulso, com o preço da sessão')
      .toEqual({ status: 'SCHEDULED', preco: 144, plano: null })
    expect(await comissaoDaVenda(plano), 'a comissão de venda: 10% do usado, liberada').toEqual({ status: 'ATIVA', lancado: 58.5 })
  })

  test('D4: quem não tem o Financeiro em Gerenciar não cancela o plano (nem vê o botão)', async ({ browser }) => {
    const { plano } = await planoFechado([{ amount: 1314, payment_method: 'PIX', is_paid: true, paid_at: new Date().toISOString() }])
    await comSessao(browser, soVe!.estado, async p => {
      await p.goto(`/admin/clients/${cliente!.clientId}`)
      await expect(p.locator('[data-quem-cancela-o-pacote]')).toContainText('Cancelar o plano é de quem tem o Financeiro em Gerenciar')
      await expect(p.getByRole('button', { name: 'Cancelar plano' })).toHaveCount(0)
      const r = await chamarAcao(p, 'actions/treatment-plans.ts', 'cancelarPlano', `/admin/clients/${cliente!.clientId}`,
        [plano, { motivo: 'Tentativa', destino: 'CREDITO', agendamentos: null, esperado: 1314 }])
      expect(r.texto).not.toMatch(/"ok":true/)
    })
    expect((await db().from('treatment_plans').select('status').eq('id', plano).single()).data!.status).toBe('ACCEPTED')
  })
})
