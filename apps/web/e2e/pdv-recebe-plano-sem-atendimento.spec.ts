import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * D3 da 25ª simulação: quem tem o PDV em Gerenciar e NÃO tem o Atendimento
 * não recebia o plano — "Receber o plano" dava 500 ("sem acesso", erro React
 * #441). O PDV é de quem recebe (`podeReceber`, vendas-financeiro.md PDV1 — o
 * Heitor, 13/11: "o pagamento acontece por dentro desse PDV, seja do que for"),
 * mas `montarCheckoutPlan` lia as sessões por `getTreatmentPlanSessions`, que
 * pede o Atendimento em Ver (a tela do atendimento, 2026-11-18).
 *
 * Aqui: a comanda do plano aceito abre para ela (`getCheckoutPlan`), com as
 * sessões. O controle é a Admin da rede.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let caixa: MembroDeTeste | null = null
let slug = ''
let cliente = ''
let plano = ''
const ARQ = 'actions/treatment-plans.ts'

async function como(m: MembroDeTeste, browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`pdvp${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  caixa = await criarMembro(`pdvc${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Só o PDV',
    permissoes: [{ modulo: 'cashier', nivel: 'MANAGE', escopo: 'ALL' }],
  })
  cliente = await rede.criarCliente('Plano no PDV')
  const { data, error } = await db().from('treatment_plans').insert({
    branch_id: rede.branchId, client_id: cliente, professional_id: rede.professionalId,
    status: 'ACCEPTED', name: `${PREFIXO} Plano no PDV ${marca}`,
  }).select('id').single<{ id: string }>()
  expect(error, 'plano aceito').toBeNull()
  plano = data!.id
  const { data: sessao, error: eS } = await db().from('treatment_plan_sessions')
    .insert({ plan_id: plano, sort_order: 0 }).select('id').single<{ id: string }>()
  expect(eS, 'sessão do plano').toBeNull()
  const { error: eP } = await db().from('treatment_plan_session_procedures')
    .insert({ session_id: sessao!.id, procedure_id: rede.procedureId, price: 321, sort_order: 0 })
  expect(eP, 'procedimento da sessão').toBeNull()
})

test.afterAll(async () => {
  test.setTimeout(120_000)
  const falhas: string[] = []
  if (plano) {
    await db().from('comandas').delete().eq('treatment_plan_id', plano)
    const sessoes = ((await db().from('treatment_plan_sessions').select('id').eq('plan_id', plano)).data ?? []).map(s => s.id as string)
    if (sessoes.length) {
      const rp = await db().from('treatment_plan_session_procedures').delete().in('session_id', sessoes)
      if (rp.error) falhas.push(`procedimentos das sessões: ${rp.error.message}`)
      const rs = await db().from('treatment_plan_sessions').delete().in('id', sessoes)
      if (rs.error) falhas.push(`sessões: ${rs.error.message}`)
    }
    await db().from('issued_documents').delete().eq('treatment_plan_id', plano)
    const r = await db().from('treatment_plans').delete().eq('id', plano)
    if (r.error) falhas.push(`plano: ${r.error.message}`)
  }
  await caixa?.limpar()
  await rede?.limpar()
  expect(falhas).toEqual([])
})

test('D3: quem tem só o PDV abre o "Receber o plano" (as sessões vêm junto)', async ({ browser }) => {
  const tela = `/${slug}/pdv`
  await como(caixa!, browser, async p => {
    await p.goto(tela)
    const r = await chamarAcao(p, ARQ, 'getCheckoutPlan', tela, [plano])
    expect(r.texto, 'chegou à action').not.toContain('Server action not found')
    expect(r.texto, 'não é "sem acesso"').not.toMatch(/sem acesso|NEXT_HTTP_ERROR|digest/i)
    expect(r.texto, 'o plano abre, com a sessão').toContain(plano)
    expect(r.texto, 'o preço da sessão').toContain('321')
  })
})
