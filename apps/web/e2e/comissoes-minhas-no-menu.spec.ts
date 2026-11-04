import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { responderAnamnese } from './apoio/anamnese'
import { apagarAgendamentos } from './apoio/limpeza'

/**
 * A52 e A41 da 6ª simulação (2026-11-04): a profissional com o financeiro
 * "só os meus" — que na prática é só "Minhas comissões" — via no menu
 * "Financeiro" (uma tela só de comissões, R$ 0,00) e no dashboard o cartão
 * "Faturamento do mês R$ 0". E os três "faturamentos" dela não diziam o que
 * cada um conta.
 *
 * Agora o menu diz "Minhas comissões" e leva direto a elas; o dashboard da
 * unidade tem o cartão "Minhas comissões" (o a pagar do período, o mesmo
 * número da tela) e o faturamento dela se chama "Meu faturamento do mês", com
 * a dica do que conta (a VENDA dela, no dia do pagamento). Quem vê o financeiro
 * de todos continua com "Financeiro" e "Faturamento do mês".
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dela: MembroDeTeste | null = null
let gestor: MembroDeTeste | null = null
let slug = ''
let cliente = ''

async function comSessao<T>(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(120_000)
  rede = await criarOutraRede(`cmm${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  cliente = await rede.criarCliente('Comissao')
  await db().from('commission_configs').upsert({ tenant_id: rede.tenantId, periodo: 'MENSAL' }, { onConflict: 'tenant_id' })
  dela = await criarMembro(`cmmd${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [{ modulo: 'financial', nivel: 'VIEW', escopo: 'OWN' }, { modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' }],
  })
  gestor = await criarMembro(`cmmg${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Gerente',
    permissoes: [{ modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', dela.userId)).error).toBeNull()
  // Um atendimento dela, concluído e pago: 10% de R$ 300 = R$ 30 a pagar.
  const { data: ap, error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, professional_id: dela.userId, procedure_id: rede.procedureId,
    scheduled_at: new Date().toISOString(), duration_min: 30, price: 300, status: 'IN_PROGRESS', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  await responderAnamnese(cliente, rede.tenantId)
  expect((await db().rpc('concluir_atendimento', {
    p_agendamento: ap!.id, p_tenant: rede.tenantId, p_ator: null, p_ator_nome: null,
    p_dados: { insumos: [], comissoes: [{ procedure_id: rede.procedureId, origem: 'AVULSO', treatment_plan_id: null, regra_tipo: 'PERCENTAGE', regra_valor: 10, preco: 300 }] },
  })).error).toBeNull()
  expect((await db().rpc('confirmar_pagamento_do_atendimento', {
    p_agendamento: ap!.id, p_tenant: rede.tenantId, p_ator: null, p_ator_nome: null,
    p_dados: { metodo: 'PIX', pontos: 0, desconto: 0, valor_final: 300 },
  })).error).toBeNull()
})

test.afterAll(async () => {
  if (rede) {
    const { data: aps } = await db().from('appointments').select('id').eq('branch_id', rede.branchId)
    const ids = (aps ?? []).map(a => a.id as string)
    await db().from('commissions').delete().in('appointment_id', ids)
    await db().from('commission_lines').delete().in('appointment_id', ids)
    await db().from('financial_transactions').delete().in('appointment_id', ids)
    expect(await apagarAgendamentos(ids)).toEqual([])
  }
  await gestor?.limpar(); await dela?.limpar(); await rede?.limpar()
})

test('a profissional "só as minhas": o menu e o dashboard dizem "Minhas comissões"', async ({ browser }) => {
  await comSessao(browser, dela!, async p => {
    await p.goto(`/${slug}/dashboard`)
    const menu = p.locator('nav, aside').first()
    await expect(menu.getByRole('link', { name: 'Minhas comissões' })).toBeVisible()
    await expect(menu.getByRole('link', { name: 'Financeiro', exact: true })).toHaveCount(0)

    const card = p.locator('[data-minhas-comissoes]')
    await expect(card).toContainText('Minhas comissões')
    await expect(card).toContainText('R$ 30')
    await expect(p.getByText('Faturamento do mês', { exact: true })).toHaveCount(0)
    await expect(p.getByText('Meu faturamento do mês')).toBeVisible()

    await menu.getByRole('link', { name: 'Minhas comissões' }).click()
    await expect(p).toHaveURL(new RegExp(`/${slug}/financeiro/comissoes`))
    await expect(p.getByRole('heading', { name: 'Minhas comissões' })).toBeVisible()
  })
})

test('quem vê o financeiro de todos continua com "Financeiro" e "Faturamento do mês"', async ({ browser }) => {
  await comSessao(browser, gestor!, async p => {
    await p.goto(`/${slug}/dashboard`)
    await expect(p.locator('nav, aside').first().getByRole('link', { name: 'Financeiro', exact: true })).toBeVisible()
    await expect(p.getByText('Faturamento do mês', { exact: true })).toBeVisible()
    await expect(p.locator('[data-minhas-comissoes]')).toHaveCount(0)
  })
})
