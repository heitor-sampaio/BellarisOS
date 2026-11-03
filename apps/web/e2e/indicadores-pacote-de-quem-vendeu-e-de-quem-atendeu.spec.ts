import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { responderAnamnese } from './apoio/anamnese'

/**
 * O pacote em dois números (revisão de 03/11):
 *
 * - r2-ven-15, VENDA: "o pacote soma inteiro para quem vendeu, é óbvio, não
 *   faz nem sentido não ser assim". O pacote e o pré-pago entram inteiros no
 *   "Meu faturamento" de quem VENDEU (`sold_by`), pelo pagamento; a sessão de
 *   pacote que ela atende NÃO soma de novo.
 * - r2-ind-01, EXECUÇÃO: "Somar também o pacote, rateado por sessão feita". No
 *   ranking por procedimento e por profissional, a sessão de pacote entra com
 *   o valor do rateio dela (`package_sessions.preco`), no dia da sessão, para
 *   quem ATENDEU.
 *
 * A Dra. Paula vende um pacote de R$ 900 (3 × R$ 300) e um pré-pago de
 * R$ 200, atende a sessão 1 do pacote e um avulso de R$ 100; a Renata atende
 * a sessão 2.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let paula: MembroDeTeste | null = null
let slug = ''
let cliente = ''
let proc = ''
let pacote = ''
let prePago = ''
let plano = ''
const de = () => new Date(Date.now() - 86_400_000).toISOString()
const ate = () => new Date(Date.now() + 86_400_000).toISOString()
const n = (v: unknown) => Number(v ?? 0)

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: paula!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
async function atendimento(profissional: string, preco: number) {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, professional_id: profissional, procedure_id: proc,
    scheduled_at: new Date().toISOString(), duration_min: 30, price: preco, status: 'IN_PROGRESS', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(error, 'criar o atendimento').toBeNull()
  return data!.id
}
async function concluir(ap: string, origem: 'AVULSO' | 'PACOTE', preco: number) {
  const { error } = await db().rpc('concluir_atendimento', {
    p_agendamento: ap, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
    p_dados: { insumos: [], comissoes: [{ procedure_id: proc, origem, treatment_plan_id: null, regra_tipo: 'PERCENTAGE', regra_valor: 10, preco }] },
  })
  expect(error, 'concluir').toBeNull()
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`pqv${marca}`)
  proc = rede.procedureId
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('procedures').update({ name: `${PREFIXO} Laser ${marca}`, price: 300 }).eq('id', proc)).error).toBeNull()
  paula = await criarMembro(`pqvp${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [{ modulo: 'financial', nivel: 'VIEW', escopo: 'OWN' }, { modulo: 'agenda', nivel: 'VIEW', escopo: 'OWN' }],
  })
  expect((await db().from('users').update({ provides_services: true }).in('id', [paula.userId, rede.professionalId])).error).toBeNull()
  cliente = await rede.criarCliente('Carla')
  await responderAnamnese(cliente, rede.tenantId)

  // O pacote de R$ 900, vendido pela Paula, no Pix.
  const { data: sp, error: eSp } = await db().rpc('pacote_salvar', {
    p_tenant: rede.tenantId, p_id: null, p_nome: `${PREFIXO} Pacote 3 lasers ${marca}`, p_preco: 900, p_validade: null, p_ativo: true,
    p_itens: [{ procedure_id: proc, quantity: 3 }], p_comissao: { venda: null, execucao: { tipo: 'REGRA', valor: null } },
  })
  expect(eSp, 'criar o pacote').toBeNull()
  const { data: cp, error: eCp } = await db().rpc('pacote_vender', {
    p_tenant: rede.tenantId, p_cliente: cliente, p_pacote: sp as string, p_unidade: rede.branchId, p_ator: paula.userId,
    p_lancamentos: [{ amount: 900, payment_method: 'PIX', is_paid: true }],
    p_sessoes: Array.from({ length: 3 }, () => ({ procedure_id: proc, preco: 300 })),
  })
  expect(eCp, 'vender o pacote').toBeNull()
  pacote = cp as string
  expect((await db().from('client_packages').select('sold_by').eq('id', pacote).single()).data?.sold_by, 'quem vendeu o pacote').toBe(paula.userId)

  // O pré-pago de R$ 200, vendido pela Paula.
  const { data: pp, error: ePp } = await db().rpc('procedimento_vender', {
    p_tenant: rede.tenantId, p_cliente: cliente, p_procedimento: proc, p_unidade: rede.branchId,
    p_ator: paula.userId, p_quantidade: 1, p_desconto: 100, p_validade_dias: null,
    p_lancamentos: [{ amount: 200, payment_method: 'PIX', is_paid: true }], p_unidades: [{ preco: 200 }],
  })
  expect(ePp, 'vender o pré-pago').toBeNull()
  prePago = pp as string
  expect((await db().from('procedure_sales').select('sold_by').eq('id', pp as string).single()).data?.sold_by, 'quem vendeu o pré-pago').toBe(paula.userId)

  // A sessão 1 do pacote, a Paula atende; a sessão 2, a Renata.
  for (const [numero, quem] of [[1, paula.userId], [2, rede.professionalId]] as const) {
    const ap = await atendimento(quem, 300)
    expect((await db().from('package_sessions').update({ appointment_id: ap }).eq('client_package_id', pacote).eq('session_number', numero)).error).toBeNull()
    await concluir(ap, 'PACOTE', 300)
  }
  // E um avulso de R$ 100 da Paula, pago no Pix.
  const avulso = await atendimento(paula.userId, 100)
  await concluir(avulso, 'AVULSO', 100)
  const { error: ePg } = await db().rpc('confirmar_pagamento_do_atendimento', {
    p_agendamento: avulso, p_tenant: rede.tenantId, p_ator: null, p_ator_nome: null,
    p_dados: { metodo: 'PIX', cartao_vezes: 1, pontos: 0, desconto: 0, valor_final: 100 },
  })
  expect(ePg, 'pagar o avulso').toBeNull()
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
    if (pacote) {
      await passo('sessões', b.from('package_sessions').delete().eq('client_package_id', pacote))
      await passo('lançamentos do pacote', b.from('financial_transactions').update({ client_package_id: null }).eq('client_package_id', pacote))
      await passo('pacote da cliente', b.from('client_packages').delete().eq('id', pacote))
    }
    await passo('pacotes', b.from('service_packages').delete().eq('tenant_id', rede.tenantId))
    if (plano) {
      const { data: ss } = await b.from('treatment_plan_sessions').select('id').eq('plan_id', plano)
      const sIds = (ss ?? []).map(s => s.id as string)
      if (sIds.length) await passo('procedimentos da sessão', b.from('treatment_plan_session_procedures').delete().in('session_id', sIds))
      await passo('sessões do plano', b.from('treatment_plan_sessions').delete().eq('plan_id', plano))
      await passo('plano', b.from('treatment_plans').delete().eq('id', plano))
    }
    const { data: vendas } = await b.from('procedure_sales').select('id').eq('tenant_id', rede.tenantId)
    const vIds = (vendas ?? []).map(v => v.id as string)
    if (vIds.length) {
      await passo('lançamentos do pré-pago', b.from('financial_transactions').update({ procedure_sale_id: null }).in('procedure_sale_id', vIds))
      await passo('unidades', b.from('procedure_sale_units').delete().in('sale_id', vIds))
      await passo('pré-pagos', b.from('procedure_sales').delete().in('id', vIds))
    }
  }
  await paula?.limpar()
  await rede?.limpar()
  expect(falhas).toEqual([])
})

test('r2-ven-15: o pacote e o pré-pago entram inteiros no "Meu faturamento" de quem vendeu, e a sessão que ela atende não soma de novo', async ({ browser }) => {
  const p = { p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId], p_from: de(), p_to: ate() }

  // A Paula: R$ 900 do pacote + R$ 200 do pré-pago + R$ 100 do avulso. A sessão 1 (R$ 300) não entra de novo.
  const { data: dela, error } = await db().rpc('metrics_core', { ...p, p_professional_id: paula!.userId })
  expect(error).toBeNull()
  expect(n(dela![0]!.revenue_cash), 'o faturamento da Paula').toBe(1200)
  const { data: serie } = await db().rpc('metrics_series', { ...p, p_granularity: 'month', p_professional_id: paula!.userId })
  expect((serie as { revenue: number }[]).reduce((s, x) => s + n(x.revenue), 0), 'o gráfico do "Meu faturamento"').toBe(1200)
  const { data: pagas } = await db().rpc('metrics_receitas_pagas', { ...p, p_professional_id: paula!.userId })
  expect((pagas as { amount: number }[]).reduce((s, t) => s + n(t.amount), 0)).toBe(1200)

  // A Renata atendeu a sessão 2, mas não vendeu nada: o pacote não é faturamento dela.
  const { data: daRenata } = await db().rpc('metrics_core', { ...p, p_professional_id: rede!.professionalId })
  expect(n(daRenata![0]!.revenue_cash), 'o faturamento da Renata').toBe(0)
  // A clínica: o mesmo dinheiro, uma vez só.
  const { data: clinica } = await db().rpc('metrics_core', p)
  expect(n(clinica![0]!.revenue_cash)).toBe(1200)

  await como(browser, async pg => {
    await pg.goto(`/${slug}/dashboard`)
    await expect(pg.getByRole('heading', { name: 'Meu faturamento' })).toBeVisible()
    await expect(pg.getByText('R$ 1.200 no semestre')).toBeVisible()
  })
})

test('r2-ind-01: no ranking por procedimento e por profissional (execução), a sessão de pacote entra pelo rateio, para quem atendeu', async () => {
  const p = { p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId], p_from: de(), p_to: ate() }

  // Por profissional: a Paula fez o avulso (R$ 100) e a sessão 1 (R$ 300); a Renata, a sessão 2 (R$ 300).
  const { data: profs, error: e1 } = await db().rpc('metrics_top_professionals', { ...p, p_limit: 10 })
  expect(e1).toBeNull()
  const porId = Object.fromEntries((profs as { professional_id: string; appointments: number; revenue: number }[])
    .map(x => [x.professional_id, [n(x.appointments), n(x.revenue)]]))
  expect(porId[paula!.userId], 'a Paula: 2 atendimentos, R$ 400').toEqual([2, 400])
  expect(porId[rede!.professionalId], 'a Renata: 1 atendimento, R$ 300').toEqual([1, 300])

  // Por procedimento: 3 execuções, R$ 700 (o pré-pago ainda não foi feito; vendido, não é execução).
  const { data: procs, error: e2 } = await db().rpc('metrics_top_procedures', { ...p, p_limit: 10 })
  expect(e2).toBeNull()
  expect((procs as { procedure_id: string; appointments: number; revenue: number }[]).map(x => [x.procedure_id, n(x.appointments), n(x.revenue)]))
    .toEqual([[proc, 3, 700]])

  // Os Relatórios (aba Procedimentos): as tabelas e o total do "% do Total".
  const { data: rel, error: e3 } = await db().rpc('metrics_relatorio', {
    ...p, p_prev_from: de(), p_prev_to: de(), p_aba: 'procedimentos', p_granularidade: 'day',
  })
  expect(e3).toBeNull()
  const r = rel as { por_procedimento: { receita: number; execucoes: number }[]; por_profissional: { nome: string; receita: number; atendimentos: number }[]; receita_dos_atendimentos: number }
  expect(r.por_procedimento.map(x => [n(x.receita), n(x.execucoes)])).toEqual([[700, 3]])
  expect(r.por_profissional.map(x => [n(x.receita), n(x.atendimentos)]).sort((a, b) => b[0]! - a[0]!)).toEqual([[400, 2], [300, 1]])
  expect(n(r.receita_dos_atendimentos)).toBe(700)
  const { data: cat, error: e4 } = await db().rpc('metrics_receita_por_categoria_de_procedimento', p)
  expect(e4).toBeNull()
  expect((cat as { receita: number }[]).reduce((s, c) => s + n(c.receita), 0), 'a receita por categoria fecha com a tabela').toBe(700)

  // Com o recorte da Paula ("só os meus"): a execução dela.
  const { data: dela } = await db().rpc('metrics_top_professionals', { ...p, p_limit: 10, p_professional_id: paula!.userId })
  expect((dela as { revenue: number }[]).map(x => n(x.revenue))).toEqual([400])
})

// r3-f13-07 (o Heitor, revisão de 03/11: "para quem atende, sessão de pacote,
// de pré-pago ou de plano é o mesmo trabalho"): a unidade PRÉ-PAGA usada e a
// sessão de PLANO (vendido) feita também entram no ranking de execução, pelo
// rateio — a parte da unidade (`procedure_sale_units.preco`) e a soma dos
// procedimentos da sessão no plano —, no dia da sessão, para quem atendeu. O
// "Meu faturamento" (venda) não muda: nenhuma das duas tem lançamento.
test('r3-f13-07: a unidade pré-paga e a sessão de plano feitas também entram no ranking, pelo rateio — e o faturamento de venda não muda', async () => {
  const p = { p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId], p_from: de(), p_to: ate() }
  const concluirSemComissao = async (ap: string) => {
    const { error } = await db().rpc('concluir_atendimento', {
      p_agendamento: ap, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null, p_dados: { insumos: [], comissoes: [] },
    })
    expect(error, 'concluir').toBeNull()
  }

  // A Renata atende a unidade pré-paga (R$ 200).
  const apPp = await atendimento(rede!.professionalId, 200)
  expect((await db().from('procedure_sale_units').update({ appointment_id: apPp }).eq('sale_id', prePago)).error).toBeNull()
  await concluirSemComissao(apPp)
  expect((await db().from('procedure_sale_units').select('status').eq('sale_id', prePago).single()).data?.status, 'a unidade foi usada').toBe('USADA')

  // A Paula atende a sessão 1 de um plano vendido: dois procedimentos na sessão, R$ 100 + R$ 50.
  const { data: tp, error: eTp } = await db().from('treatment_plans').insert({
    client_id: cliente, branch_id: rede!.branchId, professional_id: paula!.userId, status: 'ACCEPTED', name: `${PREFIXO} Plano ${marca}`,
  }).select('id').single<{ id: string }>()
  expect(eTp, 'criar o plano').toBeNull()
  plano = tp!.id
  const apPl = await atendimento(paula!.userId, 150)
  const { data: ses, error: eSes } = await db().from('treatment_plan_sessions').insert({ plan_id: plano, sort_order: 1, appointment_id: apPl }).select('id').single<{ id: string }>()
  expect(eSes, 'a sessão do plano').toBeNull()
  expect((await db().from('treatment_plan_session_procedures').insert([
    { session_id: ses!.id, procedure_id: proc, price: 100, sort_order: 1 },
    { session_id: ses!.id, procedure_id: proc, price: 50, sort_order: 2 },
  ])).error).toBeNull()
  await concluirSemComissao(apPl)

  // Por profissional: a Paula, o avulso + a sessão de pacote + a de plano (100 + 300 + 150);
  // a Renata, a sessão de pacote + a unidade pré-paga (300 + 200).
  const { data: profs } = await db().rpc('metrics_top_professionals', { ...p, p_limit: 10 })
  const porId = Object.fromEntries((profs as { professional_id: string; appointments: number; revenue: number }[])
    .map(x => [x.professional_id, [n(x.appointments), n(x.revenue)]]))
  expect(porId[paula!.userId], 'a Paula: 3 atendimentos, R$ 550').toEqual([3, 550])
  expect(porId[rede!.professionalId], 'a Renata: 2 atendimentos, R$ 500').toEqual([2, 500])

  const { data: procs } = await db().rpc('metrics_top_procedures', { ...p, p_limit: 10 })
  expect((procs as { procedure_id: string; appointments: number; revenue: number }[]).map(x => [x.procedure_id, n(x.appointments), n(x.revenue)]))
    .toEqual([[proc, 5, 1050]])

  const { data: rel } = await db().rpc('metrics_relatorio', {
    ...p, p_prev_from: de(), p_prev_to: de(), p_aba: 'procedimentos', p_granularidade: 'day',
  })
  const r = rel as { por_procedimento: { receita: number; execucoes: number }[]; por_profissional: { receita: number; atendimentos: number }[]; receita_dos_atendimentos: number }
  expect(r.por_procedimento.map(x => [n(x.receita), n(x.execucoes)])).toEqual([[1050, 5]])
  expect(r.por_profissional.map(x => [n(x.receita), n(x.atendimentos)]).sort((a, b) => b[0]! - a[0]!)).toEqual([[550, 3], [500, 2]])
  expect(n(r.receita_dos_atendimentos)).toBe(1050)
  const { data: cat } = await db().rpc('metrics_receita_por_categoria_de_procedimento', p)
  expect((cat as { receita: number }[]).reduce((s, c) => s + n(c.receita), 0), 'a receita por categoria fecha com a tabela').toBe(1050)

  // A VENDA não muda: o "Meu faturamento" da Paula continua R$ 1.200, o da Renata R$ 0, o da clínica R$ 1.200.
  const { data: dela } = await db().rpc('metrics_core', { ...p, p_professional_id: paula!.userId })
  expect(n(dela![0]!.revenue_cash)).toBe(1200)
  const { data: daRenata } = await db().rpc('metrics_core', { ...p, p_professional_id: rede!.professionalId })
  expect(n(daRenata![0]!.revenue_cash)).toBe(0)
  const { data: clinica } = await db().rpc('metrics_core', p)
  expect(n(clinica![0]!.revenue_cash)).toBe(1200)
})
