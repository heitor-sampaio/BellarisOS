import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Um número, uma conta — os indicadores da simulação de 2026-10-28 (rede de
 * duas unidades), numa rede `[e2e]` própria:
 *
 * - D10: Oportunidades dizia "0% de conversão · 2 viraram clientes" e o
 *   dashboard e os Relatórios, 66,7% ("2 de 3 leads convertidos"). O quadro
 *   contava só a etapa de GANHO e somava no navegador; a conversão agora é a
 *   de lib/metrics (`converted`: o lead que virou cliente), no recorte que o
 *   quadro mostra (o funil de agora; "só os meus" vê os dele e os sem dono).
 * - D11: o ticket médio dizia "receita ÷ atendimentos", e a conta é a receita
 *   de SERVIÇO ÷ os atendimentos COBRADOS. O rótulo acompanha a conta.
 * - D12: o dashboard da unidade, "Clientes no mês", fechava em "agora" e
 *   deixava de fora os agendamentos de mais tarde e o cancelado de amanhã.
 * - D17: Relatórios → Estoque por categoria escondia o produto sem categoria
 *   ("Sem dados no período" com R$ 5.562 em estoque).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let gestor: MembroDeTeste
let sdr: MembroDeTeste
let slug = ''
let funil = ''
const leads: string[] = []

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const brl = (t: string) => Number((/R\$\s*(-?[\d.]+(?:,\d{2})?)/.exec(t)?.[1] ?? 'NaN').replace(/\./g, '').replace(',', '.'))
const cartao = (p: Page, rotulo: string) =>
  p.getByText(rotulo, { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"card")][1]')
/** O número no fim da linha do card "Clientes no mês". */
const etapa = async (p: Page, nome: string) => (await p.locator(`[data-etapa="${nome}"]`).innerText()).replace(/\D/g, '')
/** O resumo embaixo do título "Oportunidades". */
const resumoDoQuadro = (p: Page) =>
  p.getByRole('heading', { name: 'Oportunidades', exact: true }).locator('xpath=following-sibling::p[1]')

test.beforeAll(async () => {
  test.setTimeout(240_000)
  rede = await criarOutraRede(`uc${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug

  gestor = await criarMembro(`ucg${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
  sdr = await criarMembro(`ucs${marca}`, {
    tenant: rede.tenantId, rotulo: 'SDR',
    permissoes: [{ modulo: 'crm', nivel: 'MANAGE', escopo: 'OWN' }],
  })

  // -- D10: um funil com ganho e perda, e três leads em "Novo" ------------
  // Dois viraram cliente sem o card ir para a etapa de ganho (é o caso da
  // simulação: converte-se o lead e o card fica onde estava).
  const f = await b.from('crm_funnels').insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Funil ${marca}`, is_default: true }).select('id').single<{ id: string }>()
  expect(f.error).toBeNull(); funil = f.data!.id
  const etapas = await b.from('crm_stages').insert([
    { tenant_id: rede.tenantId, funnel_id: funil, name: 'Novo', position: 0, outcome: 'OPEN' },
    { tenant_id: rede.tenantId, funnel_id: funil, name: 'Fechado', position: 1, outcome: 'WON' },
    { tenant_id: rede.tenantId, funnel_id: funil, name: 'Perdido', position: 2, outcome: 'LOST' },
  ]).select('id, position')
  expect(etapas.error).toBeNull()
  const novo = (etapas.data as { id: string; position: number }[]).find(e => e.position === 0)!.id
  const lead = async (nome: string, owner: string | null, cliente: string | null) => {
    const { data, error } = await b.from('leads').insert({
      tenant_id: rede.tenantId, name: `${PREFIXO} ${nome} ${marca}`, phone: '5548' + String(Date.now() + leads.length).slice(-9),
      crm_stage_id: novo, owner_id: owner, client_id: cliente, source: 'Instagram',
    }).select('id').single<{ id: string }>()
    expect(error, 'criar a oportunidade').toBeNull()
    leads.push(data!.id)
  }
  await lead('Ana', gestor.userId, await rede.criarCliente('Lead Ana'))   // do gestor, virou cliente
  await lead('Bia', null, await rede.criarCliente('Lead Bia'))            // sem dono, virou cliente
  await lead('Cris', null, null)                                          // sem dono, ainda não

  // -- D11: uma limpeza de R$ 180 (paga) e uma avaliação de R$ 0 ------------
  const pr = await b.from('procedures')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Limpeza ${marca}`, category: 'e2e', duration_min: 30, price: 180 })
    .select('id').single<{ id: string }>()
  expect(pr.error).toBeNull()
  const joana = await rede.criarCliente('Joana')
  const agora = new Date().toISOString()
  for (const [procedimento, preco] of [[pr.data!.id, 180], [rede.procedureId, 0]] as const) {
    const { data, error } = await b.from('appointments').insert({
      branch_id: rede.branchId, client_id: joana, procedure_id: procedimento, professional_id: rede.professionalId,
      status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: preco, scheduled_at: agora, completed_at: agora,
    }).select('id').single<{ id: string }>()
    expect(error, 'concluído').toBeNull()
    if (preco > 0) {
      const { error: eT } = await b.from('financial_transactions').insert({
        branch_id: rede.branchId, client_id: joana, appointment_id: data!.id, type: 'INCOME', category: 'Serviços',
        description: `[e2e] limpeza ${marca}`, amount: 180, payment_method: 'PIX', is_paid: true, paid_at: agora, created_by: 'e2e',
      })
      expect(eT, 'pagamento').toBeNull()
    }
  }

  // -- D12: um marcado e um cancelado mais adiante, ainda neste mês -----------
  const fimDoMes = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()).slice(0, 7)}-01T00:00:00-03:00`)
  fimDoMes.setUTCMonth(fimDoMes.getUTCMonth() + 1)
  const quando = new Date(Math.min(Date.now() + 26 * 3600_000, fimDoMes.getTime() - 3600_000))
  for (const status of ['SCHEDULED', 'CANCELLED']) {
    const { error } = await b.from('appointments').insert({
      branch_id: rede.branchId, client_id: joana, procedure_id: rede.procedureId, professional_id: rede.professionalId,
      status, source: 'CLIENT_APP', duration_min: 30, price: 0, scheduled_at: quando.toISOString(),
    })
    expect(error, 'agendar').toBeNull()
  }

  // -- D17: R$ 10 × 10 com categoria e R$ 10 × 10 sem ----------------------
  const comCategoria = await rede.criarProduto('Com categoria', 10)
  const semCategoria = await rede.criarProduto('Sem categoria', 10)
  expect((await b.from('products').update({ cost_price: 10, category: 'Insumos e2e' }).eq('id', comCategoria)).error).toBeNull()
  expect((await b.from('products').update({ cost_price: 10, category: null }).eq('id', semCategoria)).error).toBeNull()
})

test.afterAll(async () => {
  const b = db()
  if (rede) {
    await b.from('financial_transactions').delete().eq('branch_id', rede.branchId)
    await b.from('appointments').delete().eq('branch_id', rede.branchId)
    if (leads.length) {
      await b.from('lead_events').delete().in('lead_id', leads)
      await b.from('leads').delete().in('id', leads)
    }
    await b.from('contacts').delete().eq('tenant_id', rede.tenantId)
  }
  await sdr?.limpar(); await gestor?.limpar(); await rede?.limpar()
})

test.describe('D10: a conversão de Oportunidades é a de lib/metrics', () => {
  test('o quadro da rede diz 66,7% (2 de 3 viraram clientes), como o dashboard', async ({ browser }) => {
    await como(browser, gestor, async p => {
      await p.goto(`/admin/oportunidades?funil=${funil}`)
      await expect(resumoDoQuadro(p)).toContainText('66,7% de conversão')
      await expect(resumoDoQuadro(p)).toContainText('2 de 3 viraram clientes')

      // O controle: o dashboard (lib/metrics) diz o mesmo.
      await p.goto(`/admin/dashboard?period=month&funil=${funil}`)
      await expect(cartao(p, 'Taxa de conversão')).toContainText('66,7%')
      await expect(cartao(p, 'Taxa de conversão')).toContainText('2 de 3 leads convertidos')
    })
  })

  test('"só os meus" conta o que o quadro mostra: os dele e os sem dono (1 de 2)', async ({ browser }) => {
    await como(browser, sdr, async p => {
      await p.goto(`/${slug}/oportunidades?funil=${funil}`)
      await expect(resumoDoQuadro(p)).toContainText('50,0% de conversão')
      await expect(resumoDoQuadro(p)).toContainText('1 de 2 viraram clientes')
    })
  })
})

test.describe('D11: o rótulo do ticket médio acompanha a conta', () => {
  test('dashboard da rede: "receita de serviço ÷ atendimentos cobrados", R$ 180', async ({ browser }) => {
    await como(browser, gestor, async p => {
      await p.goto('/admin/dashboard?period=month')
      const ticket = cartao(p, 'Ticket médio')
      await expect.poll(async () => brl(await ticket.innerText()), { timeout: 10_000 }).toBe(180)
      await expect(ticket).toContainText('receita de serviço ÷ atendimentos cobrados')
      await expect(ticket).not.toContainText('receita ÷ atendimentos')
      // O ranking de clientes divide o PAGO pelos concluídos — outra conta,
      // outro nome (a ficha da cliente é que tem o ticket dela).
      const ranking = cartao(p, 'Ranking — Valor gasto')
      await expect(ranking).toContainText('Média por atend.')
      await expect(ranking).not.toContainText('Ticket médio')
      // O número não mudou quando a conta foi para lib/metrics (frente F): a Joana
      // pagou R$ 180 em dois concluídos (um de R$ 0) — R$ 90 por atendimento.
      await expect(ranking.locator('tr').filter({ hasText: `Joana uc${marca}` })).toContainText(/R\$\s*90,00/)
    })
  })

  test('dashboard da unidade: o ticket diz quantos atendimentos COBRADOS ele divide', async ({ browser }) => {
    await como(browser, gestor, async p => {
      await p.goto(`/${slug}/dashboard`)
      const ticket = cartao(p, 'Ticket médio')
      await expect.poll(async () => brl(await ticket.innerText()), { timeout: 10_000 }).toBe(180)
      await expect(ticket).toContainText('1 atendimento cobrado')
      await expect(ticket).not.toContainText('atendimentos concluídos')
    })
  })

  test('Relatórios → Procedimentos: o "Ticket Médio" é o do sistema (R$ 180, não R$ 90)', async ({ browser }) => {
    await como(browser, gestor, async p => {
      await p.goto('/admin/reports?tab=procedimentos&period=month')
      const ticket = cartao(p, 'Ticket Médio')
      await expect.poll(async () => brl(await ticket.innerText()), { timeout: 10_000 }).toBe(180)
      // A coluna da tabela é por execução, e diz isso.
      await expect(p.getByText('Média por execução', { exact: true })).toBeVisible()
      // A linha da limpeza: R$ 180 por execução e 100% da receita (a avaliação
      // de R$ 0, R$ 0 e 0%). A conta mora em lib/metrics desde a frente F.
      const limpeza = p.locator('tr').filter({ hasText: `Limpeza ${marca}` })
      await expect(limpeza).toContainText(/R\$\s*180,00[\s\S]*R\$\s*180,00[\s\S]*100\.0%/)
    })
  })
})

test('D12: "Clientes no mês" conta os agendamentos até o FIM do mês, com o cancelado de amanhã', async ({ browser }) => {
  await como(browser, gestor, async p => {
    await p.goto(`/${slug}/dashboard`)
    // Os 2 concluídos de agora, o marcado e o cancelado de mais adiante.
    await expect.poll(() => etapa(p, 'Agendamentos'), { timeout: 10_000 }).toBe('4')
    expect(await etapa(p, 'Concluídos')).toBe('2')
    expect(await etapa(p, 'Cancelados/faltas')).toBe('1')
  })
})

test.describe('D17: o produto sem categoria entra no gráfico de estoque', () => {
  test('o banco: uma fatia "Sem categoria", e as fatias somam o valor em estoque', async () => {
    const de = new Date(Date.now() - 30 * 86_400_000).toISOString(), ate = new Date(Date.now() + 86_400_000).toISOString()
    const { data, error } = await db().rpc('metrics_relatorio', {
      p_tenant: rede.tenantId, p_branch_ids: [rede.branchId], p_from: de, p_to: ate,
      p_prev_from: de, p_prev_to: de, p_aba: 'estoque', p_granularidade: 'day',
    })
    expect(error).toBeNull()
    const r = data as { valor_em_estoque: number; valor_por_categoria: { categoria: string; valor: number }[] }
    expect(Number(r.valor_em_estoque)).toBe(200)
    expect(r.valor_por_categoria.map(c => [c.categoria, Number(c.valor)]).sort()).toEqual([['Insumos e2e', 100], ['Sem categoria', 100]])
  })

  test('a tela: "Sem categoria" na legenda de "Valor em Estoque por Categoria"', async ({ browser }) => {
    await como(browser, gestor, async p => {
      await p.goto('/admin/reports?tab=estoque&period=month')
      const grafico = p.getByText('Valor em Estoque por Categoria', { exact: true }).locator('xpath=ancestor::div[contains(@class,"card")][1]')
      await expect(grafico).toContainText('Sem categoria')
      await expect(grafico).toContainText('Insumos e2e')
    })
  })
})
