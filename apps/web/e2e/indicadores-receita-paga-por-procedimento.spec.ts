import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D3 da 5ª simulação: o ranking "Receita bruta" por procedimento e por
 * profissional NÃO era a receita. Somava o PREÇO dos concluídos — o avulso
 * concluído e não pago (o laser de R$ 650), a sessão de pacote já vendida
 * (R$ 550) e o preço sem o desconto (a limpeza de R$ 220 cobrada a R$ 200) —,
 * ao lado do cartão de receita, que é o pago. Agora é a receita PAGA dos
 * atendimentos: o que entrou pela regra única (`metrics_receitas_pagas`)
 * ligado a um atendimento, pelo procedimento e pela profissional dele.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let limpeza = '', laser = ''
const agora = new Date().toISOString()
const de = new Date(Date.now() - 86_400_000).toISOString()
const ate = new Date(Date.now() + 86_400_000).toISOString()

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function concluido(cliente: string, procedimento: string, preco: number) {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: procedimento, professional_id: rede!.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: preco, scheduled_at: agora, completed_at: agora,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`rp${marca}`)
  gestor = await criarMembro(`rpg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestora',
    permissoes: [{ modulo: 'financial', nivel: 'VIEW' }, { modulo: 'agenda', nivel: 'VIEW' }, { modulo: 'reports', nivel: 'VIEW' }],
  })
  expect((await db().from('role_report_tabs').insert([
    { tenant_id: rede.tenantId, role_id: gestor.roleId, tab: 'procedimentos' },
    { tenant_id: rede.tenantId, role_id: gestor.roleId, tab: 'profissionais' },
  ])).error).toBeNull()
  const procs = await db().from('procedures').insert([
    { tenant_id: rede.tenantId, name: `[e2e] Limpeza ${marca}`, category: 'Facial', duration_min: 30, price: 220 },
    { tenant_id: rede.tenantId, name: `[e2e] Laser ${marca}`, category: 'Laser', duration_min: 30, price: 650 },
  ]).select('id, price')
  expect(procs.error).toBeNull()
  limpeza = procs.data!.find(p => Number(p.price) === 220)!.id
  laser = procs.data!.find(p => Number(p.price) === 650)!.id

  const carla = await rede.criarCliente('Carla'), otavio = await rede.criarCliente('Otavio')
  // A limpeza de R$ 220, cobrada a R$ 200 (desconto de R$ 20).
  const ag = await concluido(carla, limpeza, 220)
  expect((await db().from('financial_transactions').insert({
    branch_id: rede.branchId, client_id: carla, appointment_id: ag, type: 'INCOME', category: 'Serviços', sale_discount: 20,
    description: `[e2e] limpeza ${marca}`, amount: 200, payment_method: 'PIX', is_paid: true, paid_at: agora, created_by: 'e2e',
  })).error).toBeNull()
  // O laser avulso concluído e NÃO pago.
  await concluido(otavio, laser, 650)
})
test.afterAll(async () => {
  await db().from('financial_transactions').delete().eq('branch_id', rede!.branchId)
  await gestor?.limpar(); await rede?.limpar()
})

test('o ranking por procedimento e por profissional é a receita PAGA dos atendimentos', async ({ browser }) => {
  const p = { p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId], p_from: de, p_to: ate }

  const { data: procs, error: e1 } = await db().rpc('metrics_top_procedures', { ...p, p_limit: 10 })
  expect(e1).toBeNull()
  const porId = new Map((procs as { procedure_id: string; revenue: number; appointments: number }[]).map(x => [x.procedure_id, x]))
  expect([Number(porId.get(limpeza)!.revenue), Number(porId.get(laser)!.revenue)]).toEqual([200, 0])
  expect(Number(porId.get(laser)!.appointments)).toBe(1)

  const { data: profs, error: e2 } = await db().rpc('metrics_top_professionals', { ...p, p_limit: 10 })
  expect(e2).toBeNull()
  expect(Number((profs as { revenue: number }[])[0]!.revenue)).toBe(200)

  const { data: rel, error: e3 } = await db().rpc('metrics_relatorio', {
    ...p, p_prev_from: de, p_prev_to: de, p_aba: 'procedimentos', p_granularidade: 'day',
  })
  expect(e3).toBeNull()
  const r = rel as { por_procedimento: { nome: string; receita: number; execucoes: number }[]; por_profissional: { receita: number }[]; receita_dos_atendimentos: number }
  expect(r.por_procedimento.map(x => [x.nome.replace(` ${marca}`, ''), Number(x.receita), Number(x.execucoes)]).sort())
    .toEqual([['[e2e] Laser', 0, 1], ['[e2e] Limpeza', 200, 1]])
  expect(Number(r.receita_dos_atendimentos)).toBe(200)
  expect(r.por_profissional.map(x => Number(x.receita))).toEqual([200])

  const { data: cat, error: e4 } = await db().rpc('metrics_receita_por_categoria_de_procedimento', p)
  expect(e4).toBeNull()
  expect((cat as { categoria: string; receita: number }[]).map(c => [c.categoria, Number(c.receita)])).toEqual([['Facial', 200]])

  // A tela: o nome diz a conta.
  await como(browser, async pg => {
    await pg.goto('/admin/reports?period=month&tab=procedimentos')
    await expect(pg.getByRole('columnheader', { name: 'Receita dos atendimentos' })).toBeVisible()
    await expect(pg.getByRole('row', { name: new RegExp(`Limpeza ${marca}`) })).toContainText('200,00')
    // A55: o ticket da aba é o do sistema (por CLIENTE) e diz isso; a média
    // por execução vem ao lado: 200 pagos ÷ 2 execuções.
    const kpi = (r: string) => pg.getByText(r, { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"card")][1]')
    await expect(kpi('Ticket médio por cliente')).toContainText('200,00')
    await expect(kpi('Ticket médio por cliente').getByRole('button', { name: 'Como o ticket médio é contado' })).toBeVisible()
    await expect(kpi('Média por execução')).toContainText('100,00')
    await pg.goto('/admin/reports?period=month&tab=profissionais')
    await expect(pg.getByText('Receita dos atendimentos por profissional')).toBeVisible()
    await expect(pg.getByText('Receita Gerada')).toHaveCount(0)
  })
})

// O Heitor, à decisão da F17 (opção a): "contar no dia que foi feita". O
// ranking e o relatório de EXECUÇÃO contam a receita do avulso no dia em que
// o atendimento foi FEITO, não no do pagamento — como a sessão de pacote
// (princípio 5: "sem execução, sem valor"). A Limpeza concluída em 31/10 e
// paga em 03/11: outubro "Limpeza · 1 execução · R$ 180"; novembro nada dela.
// O caixa (a regra única de receita) continua no dia do pagamento.
test('o avulso pago noutro mês conta no mês em que foi FEITO — e o caixa segue no do pagamento', async () => {
  const cliente = await rede!.criarCliente('Noutro mes')
  const { data: ag, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: limpeza, professional_id: rede!.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 180,
    scheduled_at: '2021-10-31T13:00:00-03:00', completed_at: '2021-10-31T13:40:00-03:00',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  expect((await db().from('financial_transactions').insert({
    branch_id: rede!.branchId, client_id: cliente, appointment_id: ag!.id, type: 'INCOME', category: 'Serviços',
    description: `[e2e] limpeza paga depois ${marca}`, amount: 180, payment_method: 'PIX', is_paid: true,
    paid_at: '2021-11-03T12:00:00-03:00', created_by: 'e2e',
  })).error).toBeNull()

  const outubro = { p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId], p_from: '2021-10-01T00:00:00-03:00', p_to: '2021-10-31T23:59:59-03:00' }
  const novembro = { p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId], p_from: '2021-11-01T00:00:00-03:00', p_to: '2021-11-30T23:59:59-03:00' }
  const conta = async (p: typeof outubro) => {
    const [procs, profs, rel, cat] = await Promise.all([
      db().rpc('metrics_top_procedures', { ...p, p_limit: 10 }),
      db().rpc('metrics_top_professionals', { ...p, p_limit: 10 }),
      db().rpc('metrics_relatorio', { ...p, p_prev_from: p.p_from, p_prev_to: p.p_from, p_aba: 'procedimentos', p_granularidade: 'day' }),
      db().rpc('metrics_receita_por_categoria_de_procedimento', p),
    ])
    for (const r of [procs, profs, rel, cat]) expect(r.error).toBeNull()
    const r = rel.data as { por_procedimento: { nome: string; receita: number; execucoes: number }[]; por_profissional: { receita: number; atendimentos: number }[]; receita_dos_atendimentos: number }
    return {
      procedimentos: (procs.data as { procedure_name: string; appointments: number; revenue: number }[])
        .map(x => [x.procedure_name.replace(` ${marca}`, ''), Number(x.appointments), Number(x.revenue)]),
      profissionais: (profs.data as { appointments: number; revenue: number }[]).map(x => [Number(x.appointments), Number(x.revenue)]),
      relatorio: r.por_procedimento.map(x => [x.nome.replace(` ${marca}`, ''), Number(x.execucoes), Number(x.receita)]),
      porProfissional: r.por_profissional.map(x => [Number(x.atendimentos), Number(x.receita)]),
      receitaDosAtendimentos: Number(r.receita_dos_atendimentos),
      categorias: (cat.data as { categoria: string; receita: number }[]).map(c => [c.categoria, Number(c.receita)]),
    }
  }
  expect(await conta(outubro), 'outubro: a execução e o dinheiro dela').toEqual({
    procedimentos: [['[e2e] Limpeza', 1, 180]], profissionais: [[1, 180]],
    relatorio: [['[e2e] Limpeza', 1, 180]], porProfissional: [[1, 180]],
    receitaDosAtendimentos: 180, categorias: [['Facial', 180]],
  })
  expect(await conta(novembro), 'novembro: nada — nenhuma linha com valor e 0 execuções').toEqual({
    procedimentos: [], profissionais: [], relatorio: [], porProfissional: [], receitaDosAtendimentos: 0, categorias: [],
  })
  // O caixa: o pagamento de 03/11 é receita de novembro.
  const { data: caixa, error: ec } = await db().rpc('metrics_receitas_pagas', { ...novembro, p_professional_id: null })
  expect(ec).toBeNull()
  expect((caixa as { amount: number }[]).reduce((s, t) => s + Number(t.amount), 0), 'o caixa de novembro tem os R$ 180').toBe(180)
})
