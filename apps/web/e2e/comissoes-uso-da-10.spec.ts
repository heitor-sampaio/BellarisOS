import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { responderAnamnese } from './apoio/anamnese'

/**
 * Os atritos das comissões da 10ª simulação (2026-11-10), da F51:
 * - A32: o "Fechar e pagar" no dia 10 dizia "até o fim de nov/2026", gravava
 *   "de 10/11 a 10/11" e não avisava que o mês estava em curso.
 * - A33: o "Meu faturamento" da Daniela não dizia por que a sessão do plano que
 *   ela atende fica fora, enquanto a comissão dela aparece.
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let dona: MembroDeTeste | null = null
let daniela: MembroDeTeste | null = null

async function como(browser: Browser, m: { estado: string }, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`cu10${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await b.from('users').update({ provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  expect((await b.from('procedures').update({ name: `${PREFIXO} Limpeza ${marca}`, price: 180 }).eq('id', rede.procedureId)).error).toBeNull()
  dona = await criarMembro(`cu10d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  daniela = await criarMembro(`cu10p${marca}`, { tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional', permissoes: [
    { modulo: 'agenda', nivel: 'VIEW', escopo: 'OWN' }, { modulo: 'financial', nivel: 'VIEW', escopo: 'OWN' },
  ] })
  expect((await b.from('commission_configs').upsert({
    tenant_id: rede.tenantId, desconta_insumos: false, desconta_taxa: false, base_com_pontos: 'PRECO', periodo: 'MENSAL',
  }, { onConflict: 'tenant_id' })).error).toBeNull()
  // Uma limpeza de R$ 180 a 30%, concluída e paga hoje: R$ 54 a pagar no mês em curso.
  const cliente = await rede.criarCliente('Tatiane')
  await responderAnamnese(cliente, rede.tenantId)
  const { data: ap, error } = await b.from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, professional_id: rede.professionalId, procedure_id: rede.procedureId,
    scheduled_at: new Date().toISOString(), duration_min: 30, price: 180, status: 'IN_PROGRESS', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  expect((await b.rpc('concluir_atendimento', {
    p_agendamento: ap!.id, p_tenant: rede.tenantId, p_ator: null, p_ator_nome: null,
    p_dados: { insumos: [], comissoes: [{ procedure_id: rede.procedureId, origem: 'AVULSO', treatment_plan_id: null, regra_tipo: 'PERCENTAGE', regra_valor: 30, preco: 180 }] },
  })).error).toBeNull()
  expect((await b.rpc('confirmar_pagamento_do_atendimento', {
    p_agendamento: ap!.id, p_tenant: rede.tenantId, p_ator: null, p_ator_nome: null,
    p_dados: { metodo: 'PIX', pontos: 0, desconto: 0, valor_final: 180 },
  })).error).toBeNull()
})

test.afterAll(async () => {
  await daniela?.limpar(); await dona?.limpar(); await rede?.limpar()
})

test('A32: o "Fechar e pagar" no mês em curso diz que paga até agora, e o fechamento diz até quando', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto('/admin/financeiro/comissoes')
    await p.getByRole('button', { name: 'Fechar e pagar' }).first().click()
    const pergunta = p.getByRole('group', { name: /Fechar as comissões de/ })
    await expect(pergunta).toContainText('até agora')
    await expect(pergunta).toContainText('ainda está em curso')
    await pergunta.getByRole('button', { name: 'Confirmar pagamento' }).click()
    const fechamento = p.locator('[data-fechamento]').first()
    await expect(fechamento).toContainText(/lançamentos de \d{2}\/\d{2}\/\d{4} até \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}/)
  })
})

test('A33: o "Meu faturamento" diz que a sessão de pacote ou de plano que ela atende fica fora, e onde ela aparece', async ({ browser }) => {
  await como(browser, daniela!, async p => {
    await p.goto(`/${slug}/dashboard`)
    const nota = p.locator('[data-fora-do-meu-faturamento]')
    await expect(nota).toContainText('sessão de pacote')
    await expect(nota).toContainText('comissões')
  })
})
