import { test, expect, type Browser, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { responderAnamnese } from './apoio/anamnese'
import { chamarAcao } from './apoio/acao-direta'

/**
 * O pagamento parcial da comissão (A21 da 10ª simulação; decisão do Heitor,
 * 2026-11-10: "concordo com marcar e desmarcar"). A dona queria pagar parte da
 * comissão da Camila agora e o resto depois:
 * - o "Fechar e pagar" lista os lançamentos da pessoa, TODOS MARCADOS, e o
 *   "Pagar agora" se recalcula ao desmarcar;
 * - o desmarcado continua "a pagar" e volta marcado no próximo fechamento;
 * - não há valor digitado: o lançamento é pago inteiro ou fica;
 * - o extrato, o "Minhas comissões" e o CSV dizem pago/a pagar por lançamento.
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let camila: MembroDeTeste | null = null
let outra: MembroDeTeste | null = null
let slug = ''

async function como(browser: Browser, m: { estado: string }, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** Um atendimento da profissional, concluído e pago no Pix: a comissão fica a pagar. */
async function atendimentoPago(profissional: string, procedimento: string, preco: number, pct: number) {
  const b = db()
  const cliente = await rede!.criarCliente(`Cli ${preco} ${Math.random().toString(36).slice(2, 6)}`)
  await responderAnamnese(cliente, rede!.tenantId)
  const { data: ap, error } = await b.from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, professional_id: profissional, procedure_id: procedimento,
    scheduled_at: new Date(Date.now() - 3 * 3600_000).toISOString(), duration_min: 30, price: preco, status: 'IN_PROGRESS', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  expect((await b.rpc('concluir_atendimento', {
    p_agendamento: ap!.id, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
    p_dados: { insumos: [], comissoes: [{ procedure_id: procedimento, origem: 'AVULSO', treatment_plan_id: null, regra_tipo: 'PERCENTAGE', regra_valor: pct, preco }] },
  })).error).toBeNull()
  expect((await b.rpc('confirmar_pagamento_do_atendimento', {
    p_agendamento: ap!.id, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
    p_dados: { metodo: 'PIX', pontos: 0, desconto: 0, valor_final: preco },
  })).error).toBeNull()
}

let limpeza = ''
let drenagem = ''

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`cpp${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  limpeza = rede.procedureId
  expect((await b.from('procedures').update({ name: `${PREFIXO} Limpeza ${marca}`, price: 180 }).eq('id', limpeza)).error).toBeNull()
  const { data: dr, error: eDr } = await b.from('procedures')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Drenagem ${marca}`, category: 'e2e', duration_min: 30, price: 100 })
    .select('id').single<{ id: string }>()
  expect(eDr).toBeNull()
  drenagem = dr!.id
  dona = await criarMembro(`cppd${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  camila = await criarMembro(`cppc${marca}`, { tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional', permissoes: [
    { modulo: 'agenda', nivel: 'VIEW', escopo: 'OWN' }, { modulo: 'financial', nivel: 'VIEW', escopo: 'OWN' },
  ] })
  outra = await criarMembro(`cppo${marca}`, { tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional 2', permissoes: [] })
  expect((await b.from('users').update({ provides_services: true }).in('id', [camila.userId, outra.userId])).error).toBeNull()
  expect((await b.from('commission_configs').upsert({
    tenant_id: rede.tenantId, desconta_insumos: false, desconta_taxa: false, base_com_pontos: 'PRECO', periodo: 'MENSAL',
  }, { onConflict: 'tenant_id' })).error).toBeNull()
  // A Camila: Limpeza R$ 180 a 30% = R$ 54 e Drenagem R$ 100 a 30% = R$ 30 → R$ 84 a pagar.
  await atendimentoPago(camila.userId, limpeza, 180, 30)
  await atendimentoPago(camila.userId, drenagem, 100, 30)
  // A outra profissional: R$ 20 (alvo do id de outra pessoa).
  await atendimentoPago(outra.userId, drenagem, 100, 20)
})

test.afterAll(async () => {
  await outra?.limpar(); await camila?.limpar(); await dona?.limpar(); await rede?.limpar()
})

/** Os campos de uma linha do CSV (";", com as aspas do RFC 4180: "base cheia (…; …)" é um campo só). */
function camposDoCsv(linha: string): string[] {
  const campos: string[] = []
  let atual = ''
  let entreAspas = false
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]!
    if (entreAspas) {
      if (c === '"' && linha[i + 1] === '"') { atual += '"'; i++ }
      else if (c === '"') entreAspas = false
      else atual += c
    } else if (c === '"') entreAspas = true
    else if (c === ';') { campos.push(atual); atual = '' }
    else atual += c
  }
  campos.push(atual)
  return campos
}

const lancamentosDa = async (profissional: string) => {
  const { data, error } = await db().from('commissions').select('id, amount, status, payout_id, line_id')
    .eq('professional_id', profissional).order('amount', { ascending: false })
  expect(error).toBeNull()
  return (data ?? []) as { id: string; amount: number; status: string; payout_id: string | null }[]
}

test('A21: o "Fechar e pagar" lista os lançamentos marcados; desmarcar recalcula, e o desmarcado fica a pagar', async ({ browser }) => {
  test.setTimeout(120_000)
  await como(browser, dona!, async p => {
    await p.goto('/admin/financeiro/comissoes')
    const card = p.locator(`[data-comissoes-de="${camila!.userId}"]`)
    await card.getByRole('button', { name: 'Fechar e pagar' }).click()
    const pergunta = p.getByRole('group', { name: /Fechar as comissões de/ })
    const caixas = pergunta.getByRole('checkbox')
    await expect(caixas).toHaveCount(2)
    for (const c of await caixas.all()) await expect(c).toBeChecked()
    const total = pergunta.locator('[data-pagar-agora]')
    await expect(total).toContainText(/R\$\s84,00/)
    // Desmarcar a Drenagem: o total vira R$ 54.
    await pergunta.getByRole('checkbox', { name: /Drenagem/ }).uncheck()
    await expect(total).toContainText(/R\$\s54,00/)
    // Sem valor digitado: nenhum campo de valor no fechamento.
    await expect(pergunta.getByRole('textbox')).toHaveCount(0)
    await pergunta.getByRole('button', { name: 'Confirmar pagamento' }).click()
    await expect(p.locator('[data-fechamento]').first()).toContainText(/R\$\s54,00/)
  })
  const lancs = await lancamentosDa(camila!.userId)
  expect(lancs.map(l => [Number(l.amount), l.status])).toEqual([[54, 'PAID'], [30, 'OPEN']])

  // O próximo fechamento traz o desmarcado, marcado.
  await como(browser, dona!, async p => {
    await p.goto('/admin/financeiro/comissoes')
    const card = p.locator(`[data-comissoes-de="${camila!.userId}"]`)
    await card.getByRole('button', { name: /Extrato/ }).click()
    const doExtrato = card.locator('[data-lancamento="LIBERACAO"]')
    await expect(doExtrato.filter({ hasText: 'Limpeza' })).toContainText(/Paga em \d{2}\/\d{2}\/\d{4}/)
    await expect(doExtrato.filter({ hasText: 'Drenagem' })).toContainText('A pagar')
    await card.getByRole('button', { name: 'Fechar e pagar' }).click()
    const pergunta = p.getByRole('group', { name: /Fechar as comissões de/ })
    await expect(pergunta.getByRole('checkbox')).toHaveCount(1)
    await expect(pergunta.getByRole('checkbox', { name: /Drenagem/ })).toBeChecked()
    await expect(pergunta.locator('[data-pagar-agora]')).toContainText(/R\$\s30,00/)
  })
})

test('A21: o CSV e o "Minhas comissões" dizem pago e a pagar por lançamento', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto('/admin/financeiro/comissoes')
    const [baixado] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Exportar CSV' }).click()])
    const csv = await readFile((await baixado.path())!, 'utf8')
    const [cab, ...resto] = csv.replace(/^﻿/, '').split('\r\n').map(camposDoCsv)
    const col = (nome: string) => cab!.indexOf(nome)
    expect(col("Pago em")).toBeGreaterThanOrEqual(0)
    const daCamila = resto.filter(l => l[col('Tipo')] === 'Liberação' && l[col('Valor')] !== '20,00')
    const limpezaCsv = daCamila.find(l => l[col('Procedimento')]?.includes('Limpeza'))!
    const drenagemCsv = daCamila.find(l => l[col('Procedimento')]?.includes('Drenagem'))!
    expect(limpezaCsv[col('Situação')]).toBe('Paga')
    expect(limpezaCsv[col('Pago em')]).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
    expect(drenagemCsv[col('Situação')]).toBe('A pagar')
    expect(drenagemCsv[col('Pago em')]).toBe('')
  })
  await como(browser, camila!, async p => {
    await p.goto(`/${slug}/financeiro/comissoes`)
    await p.getByRole('button', { name: /Extrato/ }).first().click()
    const linhas = p.locator('[data-lancamento="LIBERACAO"]')
    await expect(linhas.filter({ hasText: 'Limpeza' })).toContainText(/Paga em \d{2}\/\d{2}\/\d{4}/)
    await expect(linhas.filter({ hasText: 'Drenagem' })).toContainText('A pagar')
  })
})

test('A21: o fechamento recusa o lançamento de outra pessoa, o já pago e a lista vazia', async ({ browser }) => {
  const daOutra = (await lancamentosDa(outra!.userId))[0]!
  // Um lançamento aberto da Camila (o que sobrou do teste de cima, ou o primeiro, rodando sozinho).
  const aberto = (await lancamentosDa(camila!.userId)).find(l => l.status === 'OPEN')!
  const periodo = `${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date())}-01`
  await como(browser, dona!, async p => {
    const fechar = (ids: string[]) => chamarAcao(p, 'actions/comissoes.ts', 'fecharComissoes', '/admin/financeiro/comissoes',
      [camila!.userId, rede!.branchId, periodo, 'PIX', ids])
    // O de outra pessoa e a lista vazia: recusados, nada se paga.
    expect((await fechar([daOutra.id])).texto).toMatch(/já foi pago ou mudou/)
    expect((await fechar([])).texto).toMatch(/Escolha ao menos um lançamento/)
    expect((await lancamentosDa(camila!.userId)).find(l => l.id === aberto.id)!.status).toBe('OPEN')
    // O escolhido se paga (o controle); o mesmo de novo — já pago — é recusado.
    expect((await fechar([aberto.id])).texto).toContain('"ok":true')
    expect((await lancamentosDa(camila!.userId)).find(l => l.id === aberto.id)!.status).toBe('PAID')
    expect((await fechar([aberto.id])).texto).toMatch(/já foi pago ou mudou/)
  })
  // O da outra segue a pagar.
  expect((await lancamentosDa(outra!.userId))[0]!.status).toBe('OPEN')
})
