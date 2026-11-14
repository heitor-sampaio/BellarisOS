import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { chamarAcao } from './apoio/acao-direta'
import { receberPlanoNoPdv } from './apoio/vender'

/**
 * O checkout do plano numa transação só (C32 do levantamento das regras,
 * 2026-11-12). Os lançamentos, os agendamentos, as sessões, o ACCEPTED e a
 * comissão de venda eram gravações separadas, e o status só mudava no fim,
 * sem conferir que ainda era PROPOSED: duas abas ao mesmo tempo, ou uma falha
 * no meio seguida de "tentar de novo", gravavam o dinheiro duas vezes.
 *
 * - Duas chegadas ao mesmo tempo: uma fecha, a outra ouve que o plano já foi
 *   fechado, e o dinheiro entra uma vez (`plano_checkout` trava o plano).
 * - "Quem vendeu" continua escolhido ao reabrir o checkout em outra aba (A13
 *   da 13ª simulação): fica no plano desde a documentação.
 * - O checkout diz a comissão de venda antes de vender (C42), como o pacote.
 *
 * Numa rede [e2e] própria.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let consultor: MembroDeTeste | null = null
let nomeDoConsultor = ''

async function como<T>(browser: Browser, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: dona!.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** Um plano PROPOSTO de 2 sessões de R$ 1.000 (R$ 2.000). */
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
    (sessoes ?? []).map(s => ({ session_id: s.id, procedure_id: rede!.procedureId, price: 1000 })))).error).toBeNull()
  return pl!.id
}

async function lancamentos(planId: string) {
  const { data, error } = await db().from('financial_transactions').select('amount, is_paid')
    .eq('treatment_plan_id', planId).gt('amount', 0)
  expect(error).toBeNull()
  return (data ?? []).map(t => `${Number(t.amount)}:${t.is_paid}`).sort()
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`pct${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  dona = await criarMembro(`pctd${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
  consultor = await criarMembro(`pctc${marca}`, {
    tenant: rede.tenantId, rotulo: 'Consultor',
    permissoes: [{ modulo: 'clients', nivel: 'VIEW' }, { modulo: 'crm', nivel: 'MANAGE' }],
  })
  const { data: u } = await db().from('users').select('name').eq('id', consultor.userId).single()
  nomeDoConsultor = (u?.name as string) ?? ''
  // A "Venda de plano" da clínica: 5% (o consultor não tem regra própria).
  expect((await db().from('commission_configs').upsert({ tenant_id: rede.tenantId, plano_pct: 5 }, { onConflict: 'tenant_id' })).error).toBeNull()
})

test.afterAll(async () => {
  const b = db()
  if (rede) {
    const { data: pls } = await b.from('treatment_plans').select('id').eq('branch_id', rede.branchId)
    const ids = (pls ?? []).map(p => p.id as string)
    if (ids.length) {
      const { data: ls } = await b.from('commission_lines').select('id').in('treatment_plan_id', ids)
      const linhas = (ls ?? []).map(l => l.id as string)
      if (linhas.length) await b.from('commissions').delete().in('line_id', linhas)
      await b.from('commission_lines').delete().in('treatment_plan_id', ids)
    }
    await b.from('commission_configs').delete().eq('tenant_id', rede.tenantId)
  }
  await consultor?.limpar()
  await dona?.limpar()
  await rede?.limpar()
})

/** O receber do plano mora no PDV (fase 3, PT1b): é a rota das actions dele. */
const PDV = '/admin/pdv'

async function aceitar(p: Page, planId: string) {
  const r = await chamarAcao(p, 'actions/treatment-plans.ts', 'aceitarPlano', PDV, [planId])
  expect(r.texto, 'o aceite passou').not.toContain('"error"')
}

test('duas chegadas ao mesmo tempo: uma recebe o plano, a outra ouve que já foi recebido, e o dinheiro entra uma vez', async ({ browser }) => {
  test.setTimeout(150_000)
  const planId = await plano('Concorrente')
  const rota = PDV
  const respostas = await como(browser, async p => {
    await p.goto(rota)
    await aceitar(p, planId)
    return Promise.all([1, 2].map(() => chamarAcao(p, 'actions/treatment-plans.ts', 'checkoutTreatmentPlan', rota,
      [planId, { forma: 'AVISTA', metodo: 'PIX' }, [], '', null, null])))
  })
  const textos = respostas.map(r => r!.texto)
  expect(textos.filter(t => t.includes('"transactionId":"')), 'uma chegada recebe').toHaveLength(1)
  expect(textos.filter(t => /já foi recebido/.test(t)), 'a outra ouve que o plano já foi recebido').toHaveLength(1)
  expect(await lancamentos(planId), 'R$ 2.000 uma vez, não duas').toEqual(['2000:true'])
  const { data: pl } = await db().from('treatment_plans').select('status').eq('id', planId).single()
  expect(pl?.status).toBe('ACCEPTED')
})

test('o checkout diz a comissão de venda de quem vendeu, e "Quem vendeu" volta escolhido em outra aba', async ({ browser }) => {
  test.setTimeout(150_000)
  const planId = await plano('Retomada')
  await como(browser, async p => {
    const janela = await receberPlanoNoPdv(p, '/admin', planId)
    await janela.getByRole('button', { name: 'Confirmar plano' }).click()
    await janela.getByLabel('Quem vendeu').selectOption(consultor!.userId)
    // C42: a regra antes de vender — a da clínica, porque o consultor não tem a dele.
    await expect(janela.locator('[data-comissao-da-venda]'))
      .toHaveText(`Comissão de venda de ${nomeDoConsultor}: 5% do vendido — da clínica. Sai quando a venda estiver paga inteira.`)
    await janela.getByRole('button', { name: 'À vista' }).click()
    await janela.getByRole('button', { name: 'Pix', exact: true }).click()
    await janela.getByRole('button', { name: 'Ir para a documentação' }).click()
    await expect(janela.getByRole('button', { name: 'Receber o plano' })).toBeEnabled()
  })
  // Outra aba (o sessionStorage é da aba): o que foi escolhido continua escolhido.
  await como(browser, async p => {
    const janela = await receberPlanoNoPdv(p, '/admin', planId)
    await janela.getByRole('button', { name: 'Confirmar plano' }).click()
    await expect(janela.getByLabel('Quem vendeu'), 'A13: o vendedor escolhido volta').toHaveValue(consultor!.userId)
  })
})

test('C38: o crediário do checkout vai até o limite da rede (padrão 12); acima, a venda é recusada', async ({ browser }) => {
  test.setTimeout(150_000)
  const planId = await plano('Crediario')
  const rota = PDV
  const venc = new Date(Date.now() + 30 * 86_400_000).toISOString()
  const r = await como(browser, async p => {
    await p.goto(rota)
    await aceitar(p, planId)
    return chamarAcao(p, 'actions/treatment-plans.ts', 'checkoutTreatmentPlan', rota,
      [planId, { forma: 'PARCELADO', metodo: 'PIX', entrada: 200, parcelas: 13, primeiroVencimento: venc }, [], '', null, null])
  })
  expect(r.texto).toContain('A clínica divide o crediário em até 12x')
  expect(await lancamentos(planId), 'nada gravado').toEqual([])
})
