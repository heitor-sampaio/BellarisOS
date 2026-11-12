import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Decisão 4 do Heitor (7ª simulação, 2026-11-05: "concordo"): a comissão de
 * VENDA do plano de tratamento. O Paulo (consultor) vendeu o plano de
 * R$ 3.672 da Larissa e não ganhou nada — o pacote tinha "Quem vendeu" e
 * comissão de venda, o plano não.
 *
 * - Configurações → Comissões → "Venda de plano": um percentual, VAZIO por
 *   padrão (princípio 6: sem comissão até a clínica pôr).
 * - O checkout do plano tem "Quem vendeu", nascendo vazio como nas outras
 *   vendas; vazio, pergunta antes ("não gera comissão de venda para ninguém").
 * - A comissão libera com o plano pago INTEIRO (H4): à vista, na hora; no
 *   crediário, com a última parcela — o mesmo caminho do pacote.
 *
 * Numa rede [e2e] própria.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
const n = (v: unknown) => Number(v ?? 0)
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let consultor: MembroDeTeste | null = null

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: dona!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** Um plano PROPOSTO de 2 sessões de R$ 2.200 (R$ 4.400). */
async function plano(rotulo: string) {
  const cliente = await rede!.criarCliente(rotulo)
  const { data: pl, error } = await db().from('treatment_plans').insert({
    branch_id: rede!.branchId, professional_id: rede!.professionalId, client_id: cliente,
    status: 'PROPOSED', name: `${PREFIXO} Plano ${rotulo} ${marca}`,
  }).select('id').single<{ id: string }>()
  expect(error, 'criar o plano').toBeNull()
  const { data: sessoes } = await db().from('treatment_plan_sessions')
    .insert([{ plan_id: pl!.id, sort_order: 0 }, { plan_id: pl!.id, sort_order: 1 }]).select('id')
  expect((await db().from('treatment_plan_session_procedures').insert(
    (sessoes ?? []).map(s => ({ session_id: s.id, procedure_id: rede!.procedureId, price: 2200 })))).error).toBeNull()
  return { planId: pl!.id, cliente }
}

/** A linha da comissão de venda do plano (sem atendimento) e o que ela já lançou. */
async function comissaoDaVenda(planId: string) {
  const { data, error } = await db().from('commission_lines')
    .select('id, professional_id, origem, preco, regra_tipo, regra_valor, status')
    .eq('treatment_plan_id', planId).is('appointment_id', null)
  expect(error).toBeNull()
  const linhas = []
  for (const l of data ?? []) {
    const { data: c } = await db().from('commissions').select('amount').eq('line_id', l.id)
    linhas.push({ ...l, lancado: Math.round((c ?? []).reduce((s, x) => s + n(x.amount), 0) * 100) / 100 })
  }
  return linhas
}

/** Do passo "Plano" ao "Pagamento" do checkout. */
async function abrirOPagamento(p: Page, planId: string) {
  await p.goto(`/admin/checkout/${planId}`)
  await p.getByRole('button', { name: 'Confirmar plano' }).click()
}

/** Da documentação (sem documentos nesta rede) ao fim, sem agendar. */
async function concluir(p: Page) {
  await p.getByRole('button', { name: 'Ir para o agendamento' }).click()
  await p.getByRole('button', { name: 'Concluir sem agendar' }).click()
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`cvp${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  expect((await db().from('procedures').update({ name: `${PREFIXO} Bioestimulador ${marca}`, price: 2200 }).eq('id', rede.procedureId)).error).toBeNull()
  dona = await criarMembro(`cvpd${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
  // O consultor vende e avalia; não tem o Financeiro (A48).
  consultor = await criarMembro(`cvpc${marca}`, {
    tenant: rede.tenantId, rotulo: 'Consultor',
    permissoes: [{ modulo: 'clients', nivel: 'VIEW' }, { modulo: 'crm', nivel: 'MANAGE' }],
  })
  const { data: u } = await db().from('users').select('name').eq('id', consultor.userId).single()
  expect(u?.name, 'o nome do consultor').toBeTruthy()
})

test.afterAll(async () => {
  const b = db()
  const falhas: string[] = []
  if (rede) {
    const { data: pls } = await b.from('treatment_plans').select('id').eq('branch_id', rede.branchId)
    const ids = (pls ?? []).map(p => p.id as string)
    if (ids.length) {
      const { data: ls } = await b.from('commission_lines').select('id').in('treatment_plan_id', ids)
      const linhas = (ls ?? []).map(l => l.id as string)
      for (const [o, q] of [
        ['comissões', linhas.length ? b.from('commissions').delete().in('line_id', linhas) : null],
        ['linhas', b.from('commission_lines').delete().in('treatment_plan_id', ids)],
      ] as const) {
        if (!q) continue
        const { error } = await q
        if (error) falhas.push(`${o}: ${error.message}`)
      }
    }
    const { error } = await b.from('commission_configs').delete().eq('tenant_id', rede.tenantId)
    if (error) falhas.push(`configuração: ${error.message}`)
  }
  await consultor?.limpar()
  await dona?.limpar()
  await rede?.limpar()
  expect(falhas).toEqual([])
})

test('Configurações → Comissões: "Venda de plano" nasce vazia, e a clínica põe o percentual', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto('/admin/settings?tab=comissoes')
    const como_ = p.getByLabel('Como a comissão acontece')
    const campo = como_.getByLabel('Comissão na venda de plano (%)')
    await expect(campo, 'vazio por padrão (princípio 6)').toHaveValue('')
    await expect(como_.locator('[data-comissao-do-plano]')).toContainText('Vazio: vale a regra de venda de quem vendeu; sem ela, a venda do plano não gera comissão.')
    await campo.fill('5')
    await como_.getByRole('button', { name: 'Salvar' }).click()
    await expect(como_.getByRole('status')).toHaveText('Salvo.')
  })
  const { data } = await db().from('commission_configs').select('plano_pct').eq('tenant_id', rede!.tenantId).single()
  expect(n(data?.plano_pct)).toBe(5)
})

test('o checkout pago à vista com "Quem vendeu": 5% de R$ 4.400 para o consultor, na hora', async ({ browser }) => {
  test.setTimeout(150_000)
  const { planId } = await plano('Larissa')
  await como(browser, async p => {
    await abrirOPagamento(p, planId)
    const quem = p.getByLabel('Quem vendeu')
    await expect(quem, 'nasce vazio, como nas outras vendas').toHaveValue('')
    await quem.selectOption(consultor!.userId)
    await p.getByRole('button', { name: 'À vista' }).click()
    await p.getByRole('button', { name: 'Pix', exact: true }).click()
    await p.getByRole('button', { name: 'Ir para a documentação' }).click()
    await concluir(p)
  })
  await expect.poll(async () => (await db().from('treatment_plans').select('status, vendido_por').eq('id', planId).single()).data)
    .toEqual({ status: 'ACCEPTED', vendido_por: consultor!.userId })
  expect(await comissaoDaVenda(planId)).toEqual([expect.objectContaining({
    professional_id: consultor!.userId, origem: 'PLANO', regra_tipo: 'PERCENTAGE', status: 'ATIVA', lancado: 220,
  })])
  const [l] = await comissaoDaVenda(planId)
  expect(n(l!.preco)).toBe(4400)
  expect(n(l!.regra_valor)).toBe(5)

  // O extrato diz de onde veio: a venda do plano, da cliente.
  const { data: ext, error } = await db().rpc('comissoes_extrato_linhas', {
    p_tenant: rede!.tenantId, p_branch_ids: null, p_inicio: new Date(Date.now() - 864e5).toISOString(),
    p_fim: new Date(Date.now() + 864e5).toISOString(), p_profissional: consultor!.userId,
  })
  expect(error).toBeNull()
  expect((ext ?? []) as unknown[]).toEqual([expect.objectContaining({ origem: 'PLANO_VENDA', cliente: expect.stringContaining('Larissa'), amount: 220 })])
})

test('"Quem vendeu" vazio: a venda pergunta, e confirmada não gera comissão de venda', async ({ browser }) => {
  test.setTimeout(150_000)
  const { planId } = await plano('Mariana')
  await como(browser, async p => {
    await abrirOPagamento(p, planId)
    await p.getByRole('button', { name: 'À vista' }).click()
    await p.getByRole('button', { name: 'Pix', exact: true }).click()
    await p.getByRole('button', { name: 'Ir para a documentação' }).click()
    const pergunta = p.locator('[data-pergunta-da-venda]')
    await expect(pergunta).toContainText('Ninguém foi marcado em “Quem vendeu”')
    await pergunta.getByRole('button', { name: 'Vender assim' }).click()
    await concluir(p)
  })
  await expect.poll(async () => (await db().from('treatment_plans').select('status').eq('id', planId).single()).data?.status).toBe('ACCEPTED')
  expect(await comissaoDaVenda(planId)).toEqual([])
})

test('no crediário a comissão espera a última parcela (H4), e libera quando ela entra', async ({ browser }) => {
  test.setTimeout(150_000)
  const { planId } = await plano('Patrícia')
  await como(browser, async p => {
    await abrirOPagamento(p, planId)
    await p.getByLabel('Quem vendeu').selectOption(consultor!.userId)
    await p.getByRole('button', { name: 'Entrada + parcelas' }).click()
    await p.getByRole('button', { name: 'Pix', exact: true }).click()
    await p.getByLabel('Entrada', { exact: true }).fill('1000')
    await p.getByLabel('Parcelas do saldo').selectOption('2')
    await p.getByRole('button', { name: 'Ir para a documentação' }).click()
    await concluir(p)
  })
  // O ACCEPTED sai ANTES da comissão (`plano_comissao_de_venda`, outra
  // gravação, que marca o `vendido_por` na mesma transação da linha): esperar
  // só o status lia a linha no meio (completa de 10/11, F48). É o do à vista.
  await expect.poll(async () => (await db().from('treatment_plans').select('status, vendido_por').eq('id', planId).single()).data)
    .toEqual({ status: 'ACCEPTED', vendido_por: consultor!.userId })
  expect(await comissaoDaVenda(planId), 'a linha existe e ainda não lançou nada').toEqual([expect.objectContaining({ lancado: 0, status: 'ATIVA' })])

  const { data: parcelas } = await db().from('financial_transactions').select('id').eq('treatment_plan_id', planId).eq('is_paid', false).order('parcela_numero')
  expect(parcelas ?? []).toHaveLength(2)
  for (const [i, f] of (parcelas ?? []).entries()) {
    expect((await db().from('financial_transactions').update({ is_paid: true, paid_at: new Date().toISOString(), payment_method: 'PIX' }).eq('id', f.id)).error).toBeNull()
    const esperado = i === 0 ? 0 : 220
    await expect.poll(async () => (await comissaoDaVenda(planId))[0]?.lancado, `depois da parcela ${i + 1}`).toBe(esperado)
  }
})

// D4 da 9ª (decisão 2 do Heitor: "usa a mesma coisa do pacote"): o cancelamento
// do plano fechado é o do pacote — a comissão de venda volta na proporção do que
// caiu. Sem sessão feita, cai tudo: nada fica lançado.
test('o plano cancelado depois de vendido não é venda: a comissão de venda volta', async ({ browser }) => {
  test.setTimeout(150_000)
  const { planId, cliente } = await plano('Renata')
  await como(browser, async p => {
    await abrirOPagamento(p, planId)
    await p.getByLabel('Quem vendeu').selectOption(consultor!.userId)
    await p.getByRole('button', { name: 'À vista' }).click()
    await p.getByRole('button', { name: 'Pix', exact: true }).click()
    await p.getByRole('button', { name: 'Ir para a documentação' }).click()
    await concluir(p)
  })
  await expect.poll(async () => (await comissaoDaVenda(planId))[0]?.lancado).toBe(220)
  await como(browser, async p => {
    const previa = await chamarAcao(p, 'actions/treatment-plans.ts', 'previaDoCancelamentoDoPlano', `/admin/clients/${cliente}`, [planId])
    const devolver = Number(/"devolver":([\d.]+)/.exec(previa.texto)?.[1])
    expect(devolver, 'nada feito: volta tudo').toBeGreaterThan(0)
    const r = await chamarAcao(p, 'actions/treatment-plans.ts', 'cancelarPlano', `/admin/clients/${cliente}`,
      [planId, { motivo: 'desistiu', destino: 'CREDITO', agendamentos: null, esperado: devolver }])
    expect(r.texto).toMatch(/"ok":true/)
  })
  await expect.poll(async () => (await db().from('treatment_plans').select('status').eq('id', planId).single()).data?.status).toBe('CANCELLED')
  expect(await comissaoDaVenda(planId)).toEqual([expect.objectContaining({ lancado: 0 })])
})

// A48 da 7ª: o cargo Consultor vende e não via as próprias comissões —
// "Minhas comissões" é o Financeiro em "Ver, só os próprios" (comissoes.md), e
// a tela de Cargos não dizia. Decidido pelo princípio 3 (nada de regra
// escondida) e pelo 1 (a clínica decide pelo cargo): o resumo do cargo diz.
test('A48: o resumo do cargo sem o Financeiro diz como a pessoa vê as próprias comissões', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto('/admin/settings?tab=permissions')
    await p.getByText(`Consultor cvpc${marca}`).first().click()
    await expect(p.getByRole('heading', { name: new RegExp(`Consultor cvpc${marca}`) })).toBeVisible()
    await expect(p.locator('[data-sem-minhas-comissoes]'))
      .toContainText('Não vê as próprias comissões. Para ver, Financeiro em “Ver”, só os próprios: vira “Minhas comissões”.')
  })
})
