import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { euVendiOPlano } from './apoio/vender'

/**
 * A comanda do plano no PDV (a revisão do Heitor, 2026-11-13 — PDV4 e PT1a–PT1c
 * do plano de adaptação, `docs/revisao.md`).
 *
 * O Heitor: "a partir do momento que a cliente aceita o plano, ela precisa daí
 * pagar e agendar as sessões" e, sobre o aceite, "essa parte de perguntar forma
 * de pagamento no aceite não sei se é o ideal". E a ordem: "primeiro colhe
 * assinatura, depois paga".
 *
 * - "Aceitar plano" é só "quero fazer": nenhum dinheiro, nenhum agendamento; a
 *   comanda do plano nasce no PDV com o valor inteiro.
 * - O PDV recebe o plano: a forma, o contrato com ela, e só então o dinheiro.
 * - Sai o "Fechar checkout": o plano proposto não se recebe sem o aceite.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let monta: MembroDeTeste | null = null
let balcao: MembroDeTeste | null = null
let slug = ''

async function como(m: MembroDeTeste, browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`pdvp${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  monta = await criarMembro(`pdvpm${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Monta',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'medical_records', nivel: 'MANAGE' }],
  })
  balcao = await criarMembro(`pdvpb${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Balcão',
    permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'cashier', nivel: 'MANAGE' }],
  })
})
test.afterAll(async () => {
  if (!rede) return
  await db().from('treatment_plans').delete().eq('branch_id', rede.branchId)
  await monta?.limpar()
  await balcao?.limpar()
  await rede.limpar()
})

test('PT1b: "Aceitar plano" é só o aceite — sem dinheiro, e a comanda do plano nasce no PDV com o valor inteiro', async ({ browser }) => {
  const { planId, clientId } = await rede!.criarPlanoProposto('Aceite', { semTermo: true })
  await como(monta!, browser, async p => {
    await p.goto(`/${slug}/planejamentos/${planId}`)
    await expect(p.getByRole('button', { name: 'Fechar checkout' })).toHaveCount(0)
    await p.getByRole('button', { name: 'Aceitar plano' }).click()
    // Nenhuma janela de pagamento: o aceite é só o aceite.
    await expect(p.getByRole('dialog', { name: 'Checkout' })).toHaveCount(0)
    await expect(p.locator('[data-plano-falta-receber]')).toContainText('PDV')
  })
  expect((await db().from('treatment_plans').select('status').eq('id', planId).single()).data!.status).toBe('ACCEPTED')
  const { data: dinheiro } = await db().from('financial_transactions').select('id').eq('treatment_plan_id', planId)
  expect(dinheiro ?? [], 'o aceite não lança dinheiro').toHaveLength(0)
  const { data: comandas } = await db().from('comandas').select('origem, client_id, treatment_plan_id, cancelada_em').eq('treatment_plan_id', planId)
  expect(comandas).toHaveLength(1)
  expect(comandas![0]).toMatchObject({ origem: 'PLANO', client_id: clientId, cancelada_em: null })
})

test('PDV4/PT1c: o PDV recebe o plano aceito — a forma, o contrato, e só então o dinheiro', async ({ browser }) => {
  const { planId } = await rede!.criarPlanoProposto('Receber', { semTermo: true })
  await como(monta!, browser, async p => {
    await p.goto(`/${slug}/planejamentos/${planId}`)
    const r = await chamarAcao(p, 'actions/treatment-plans.ts', 'aceitarPlano', `/${slug}/planejamentos/${planId}`, [planId])
    expect(r.status).toBe(200)
  })
  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/pdv`)
    const linha = p.locator('[data-lista-de-comandas] .pdv-linha', { hasText: `Cliente Receber` })
    await expect(linha).toContainText('50,00')
    await linha.click()
    await p.getByRole('button', { name: 'Receber o plano' }).click()
    const janela = p.getByRole('dialog', { name: 'Receber o plano' })
    await janela.getByRole('button', { name: /Confirmar plano/ }).click()
    // Sem o "Receber no atendimento": aqui é o PDV, recebe-se.
    await expect(janela.getByRole('button', { name: 'Receber no atendimento' })).toHaveCount(0)
    await janela.getByRole('button', { name: 'À vista' }).click()
    await janela.getByRole('button', { name: 'Pix', exact: true }).click()
    await euVendiOPlano(p)
    await janela.getByRole('button', { name: 'Ir para a documentação' }).click()
    // Sem agendamento aqui: as sessões se agendam depois, pelo plano.
    await janela.getByRole('button', { name: 'Receber o plano' }).click()
    await expect(janela).toHaveCount(0)
    await p.getByRole('link', { name: 'Pagas hoje' }).click()
    await expect(p.locator('[data-lista-de-comandas] .pdv-linha', { hasText: `Cliente Receber` })).toContainText('Paga')
  })
  const { data: fts } = await db().from('financial_transactions').select('amount, is_paid, payment_method').eq('treatment_plan_id', planId)
  expect(fts).toHaveLength(1)
  expect(fts![0]).toMatchObject({ is_paid: true, payment_method: 'PIX' })
  expect(Number(fts![0]!.amount)).toBe(50)
  const { data: ags } = await db().from('appointments').select('id').eq('treatment_plan_id', planId)
  expect(ags ?? [], 'receber não agenda').toHaveLength(0)
})

test('PDV4: o plano proposto não se recebe sem o aceite, e o aceito não se recebe duas vezes', async ({ browser }) => {
  const { planId } = await rede!.criarPlanoProposto('Duas', { semTermo: true })
  const pix = { forma: 'AVISTA', metodo: 'PIX' }
  await como(balcao!, browser, async p => {
    const rota = `/${slug}/pdv`
    await p.goto(rota)
    const proposto = await chamarAcao(p, 'actions/treatment-plans.ts', 'checkoutTreatmentPlan', rota, [planId, pix, [], slug])
    expect(proposto.texto).toContain('Aceite o plano')
    expect((await db().from('financial_transactions').select('id').eq('treatment_plan_id', planId)).data ?? []).toHaveLength(0)

    await db().from('treatment_plans').update({ status: 'ACCEPTED' }).eq('id', planId)
    const primeira = await chamarAcao(p, 'actions/treatment-plans.ts', 'checkoutTreatmentPlan', rota, [planId, pix, [], slug])
    expect((await db().from('financial_transactions').select('id').eq('treatment_plan_id', planId)).data ?? [], `o aceito se recebe: ${primeira.texto.slice(0, 300)}`).toHaveLength(1)
    const segunda = await chamarAcao(p, 'actions/treatment-plans.ts', 'checkoutTreatmentPlan', rota, [planId, pix, [], slug])
    expect(segunda.texto).toContain('já foi recebido')
  })
  expect((await db().from('financial_transactions').select('id').eq('treatment_plan_id', planId)).data ?? []).toHaveLength(1)
})
