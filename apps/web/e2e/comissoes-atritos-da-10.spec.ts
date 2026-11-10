import { test, expect, type Browser, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { responderAnamnese } from './apoio/anamnese'

/**
 * D3 da 10ª simulação (2026-11-10), da F49: o extrato e o CSV da comissão
 * escreviam "base sem a taxa da maquininha: R$ 420,00 · 40%" ao lado de
 * R$ 165,48 — o PREÇO onde dizia "base", e ninguém refazia a conta (40% de 420
 * dá 168). No CSV, a venda do plano cancelado dizia Base 1.700 e Previsto 35
 * (5% dos 700 que ficaram). Agora a base é a EFETIVA — a que a conta usou
 * (`private.comissao_conta`): o preço − o desconto − a taxa − os insumos, na
 * proporção do que ficou do plano/pacote cancelado —, com o que saiu dela.
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let atendimentoId = ''
let planoId = ''
const n = (v: unknown) => Number(v)

async function como(browser: Browser, m: { estado: string }, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, acceptDownloads: true })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`cm10${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  expect((await b.from('users').update({ provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  expect((await b.from('procedures').update({ name: `${PREFIXO} Microagulhamento ${marca}`, price: 420 }).eq('id', rede.procedureId)).error).toBeNull()
  dona = await criarMembro(`cm10d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  // A base sem a taxa da maquininha; o Pix a 1,5%.
  expect((await b.from('commission_configs').upsert({
    tenant_id: rede.tenantId, desconta_insumos: false, desconta_taxa: true, base_com_pontos: 'PRECO', periodo: 'MENSAL',
  }, { onConflict: 'tenant_id' })).error).toBeNull()
  expect((await b.rpc('comissao_taxas_definir', { p_tenant: rede.tenantId, p_taxas: [{ metodo: 'PIX', parcelas: 1, taxa_pct: 1.5 }] })).error).toBeNull()

  // O Microagulhamento de R$ 420 a 40%, concluído e pago no Pix: 40% de 413,70 = 165,48.
  const cliente = await rede.criarCliente('Camila')
  await responderAnamnese(cliente, rede.tenantId)
  const { data: ap, error: eAp } = await b.from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, professional_id: rede.professionalId, procedure_id: rede.procedureId,
    scheduled_at: new Date().toISOString(), duration_min: 30, price: 420, status: 'IN_PROGRESS', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(eAp).toBeNull()
  atendimentoId = ap!.id
  expect((await b.rpc('concluir_atendimento', {
    p_agendamento: atendimentoId, p_tenant: rede.tenantId, p_ator: null, p_ator_nome: null,
    p_dados: { insumos: [], comissoes: [{ procedure_id: rede.procedureId, origem: 'AVULSO', treatment_plan_id: null, regra_tipo: 'PERCENTAGE', regra_valor: 40, preco: 420 }] },
  })).error).toBeNull()
  expect((await b.rpc('confirmar_pagamento_do_atendimento', {
    p_agendamento: atendimentoId, p_tenant: rede.tenantId, p_ator: null, p_ator_nome: null,
    p_dados: { metodo: 'PIX', pontos: 0, desconto: 0, valor_final: 420 },
  })).error).toBeNull()

  // A venda do plano de R$ 1.700, cancelado com R$ 1.000 devolvidos: a comissão
  // de venda (5%) vale sobre os R$ 700 que ficaram.
  const outra = await rede.criarCliente('Tatiane')
  const { data: pl, error: ePl } = await b.from('treatment_plans').insert({
    branch_id: rede.branchId, professional_id: rede.professionalId, client_id: outra, status: 'CANCELLED',
    name: `${PREFIXO} Plano ${marca}`, valor_cancelado: 1000, cancelado_em: new Date().toISOString(),
  }).select('id').single<{ id: string }>()
  expect(ePl).toBeNull()
  planoId = pl!.id
  const { data: s } = await b.from('treatment_plan_sessions').insert({ plan_id: planoId, sort_order: 0 }).select('id').single<{ id: string }>()
  expect((await b.from('treatment_plan_session_procedures').insert({ session_id: s!.id, procedure_id: rede.procedureId, price: 1700 })).error).toBeNull()
  expect((await b.from('commission_lines').insert({
    tenant_id: rede.tenantId, branch_id: rede.branchId, professional_id: rede.professionalId, origem: 'PLANO',
    treatment_plan_id: planoId, regra_tipo: 'PERCENTAGE', regra_valor: 5, modo: 'INTEGRAL', preco: 1700,
  })).error).toBeNull()
  expect((await b.from('financial_transactions').insert({
    branch_id: rede.branchId, client_id: outra, treatment_plan_id: planoId, type: 'INCOME', category: 'Plano de tratamento',
    description: 'Plano', amount: 700, is_paid: true, paid_at: new Date().toISOString(), payment_method: 'CASH', created_by: 'e2e',
  })).error).toBeNull()
})

test.afterAll(async () => {
  await dona?.limpar(); await rede?.limpar()
})

test('D3: o extrato devolve a base EFETIVA — a que a conta usou — e o que saiu dela', async () => {
  const { data, error } = await db().rpc('comissoes_extrato_com_base', {
    p_tenant: rede!.tenantId, p_branch_ids: null, p_inicio: new Date(Date.now() - 864e5).toISOString(),
    p_fim: new Date(Date.now() + 864e5).toISOString(), p_profissional: rede!.professionalId,
  })
  expect(error).toBeNull()
  const linhas = (data ?? []) as Record<string, unknown>[]
  const avulso = linhas.find(l => l.appointment_id === atendimentoId)!
  expect(n(avulso.amount)).toBe(165.48)
  expect(n(avulso.preco)).toBe(420)
  expect(n(avulso.base)).toBe(413.7)
  expect(n(avulso.base_taxa)).toBe(6.3)
  expect(n(avulso.base)).toBeCloseTo(n(avulso.amount) / 0.4, 1)
  const plano = linhas.find(l => l.origem === 'PLANO_VENDA')!
  expect(n(plano.preco)).toBe(1700)
  expect(n(plano.base)).toBe(700)
  expect(n(plano.amount)).toBe(35)
})

test('D3: na tela e no CSV, "base" é a efetiva, com o preço e o que saiu dela', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto('/admin/financeiro/comissoes')
    await p.getByRole('button', { name: /Extrato/ }).first().click()
    const linha = p.locator('[data-lancamento="LIBERACAO"]').filter({ hasText: 'Microagulhamento' })
    await expect(linha).toContainText(/base sem a taxa da maquininha[^:]*: R\$\s413,70/)
    await expect(linha).toContainText(/R\$\s420,00 − R\$\s6,30 da taxa/)
    await expect(linha).toContainText('40%')
    const [baixado] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Exportar CSV' }).click()])
    const csv = await readFile((await baixado.path())!, 'utf8')
    const [cab, ...resto] = csv.replace(/^﻿/, '').split('\r\n').map(l => l.split(';'))
    const col = (nome: string) => cab!.indexOf(nome)
    expect(col('Preço')).toBeGreaterThanOrEqual(0)
    const micro = resto.find(l => l[col('Procedimento')]?.includes('Microagulhamento') && l[col('Tipo')] === 'Liberação')!
    expect(micro[col('Preço')]).toBe('420,00')
    expect(micro[col('Base')]).toBe('413,70')
    expect(micro[col('Taxa da maquininha')]).toBe('6,30')
    const plano = resto.find(l => l[col('Origem')]?.startsWith('Venda do plano'))!
    expect(plano[col('Preço')]).toBe('1700,00')
    expect(plano[col('Base')]).toBe('700,00')
  })
})
