import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O Fechamento do dia no PDV (a revisão do Heitor, 2026-11-13 — CX4, CX5 e
 * CX6 do plano de adaptação, `docs/revisao.md`; o Heitor: "Blz pode ser
 * assim"). A regra: o que a cliente paga na frente de quem está no balcão
 * passa pelo PDV; o resto é do Financeiro.
 *
 * - CX4: "Fechar o dia" mora no PDV (`/pdv?fechar=1`), uma linha por forma de
 *   pagamento — o que o sistema registrou × o que foi conferido. O Dinheiro é
 *   obrigatório; as outras formas, opcionais: em branco é "não conferido"
 *   (princípio 4), nunca "bateu". `/fechamento` leva para lá.
 * - CX5: os avisos ficam dois (comanda aberta; dinheiro depois do
 *   fechamento). "Por quem recebeu" e os estornos ficam num detalhe recolhido.
 * - CX6: as taxas estimadas, a venda sem taxa e o CSV do fechamento vão para
 *   o Financeiro.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let contadora: MembroDeTeste | null = null
let slug = ''
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

async function como(m: MembroDeTeste, browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const lancar = async (linhas: Record<string, unknown>[]) => {
  const agora = new Date().toISOString()
  const { error } = await db().from('financial_transactions').insert(linhas.map(l => ({
    branch_id: rede!.branchId, type: 'INCOME', category: 'Atendimento', is_paid: true, paid_at: agora, created_by: 'e2e', ...l,
  })))
  expect(error).toBeNull()
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`pfd${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  // O Pix a 1% (a taxa estimada do Financeiro); o débito sem taxa cadastrada.
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString(), pix_taxa_pct: 1 }).eq('id', rede.tenantId)).error).toBeNull()
  // Quem está no balcão: só o PDV (cashier) em Gerenciar — recebe e fecha.
  recepcao = await criarMembro(`pfdr${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Balcão', permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }],
  })
  // Quem só vê o Financeiro de todos: vê o fechamento, não fecha nem recebe.
  contadora = await criarMembro(`pfdc${marca}`, {
    tenant: rede.tenantId, rotulo: 'Só vê o Financeiro', permissoes: [{ modulo: 'financial', nivel: 'VIEW' }],
  })
  // O dia: R$ 120 no Pix, R$ 100 no débito, R$ 50 em dinheiro.
  await lancar([
    { description: `Peeling ${marca}`, amount: 120, payment_method: 'PIX' },
    { description: `Laser ${marca}`, amount: 100, payment_method: 'DEBIT_CARD' },
    { description: `Limpeza ${marca}`, amount: 50, payment_method: 'CASH' },
  ])
  // Uma comanda aberta: o atendimento concluído sem pagamento (o gatilho a cria).
  const cliente = await rede.criarCliente('Comanda aberta')
  const { error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, professional_id: rede.professionalId, procedure_id: rede.procedureId,
    scheduled_at: new Date(Date.now() - 60 * 60_000).toISOString(), started_at: new Date().toISOString(), completed_at: new Date().toISOString(),
    duration_min: 30, price: 180, status: 'COMPLETED', source: 'INTERNAL',
  })
  expect(error).toBeNull()
})
test.afterAll(async () => {
  await recepcao?.limpar(); await contadora?.limpar(); await rede?.limpar()
})

test('CX4: o "Fechar o dia" do PDV abre o fechamento no PDV, linha por forma, e grava o conferido', async ({ browser }) => {
  await como(recepcao!, browser, async p => {
    await p.goto(`/${slug}/pdv`)
    await p.getByRole('link', { name: 'Fechar o dia' }).click()
    await expect(p).toHaveURL(new RegExp(`/${slug}/pdv\\?fechar=1`))
    await expect(p.getByRole('heading', { name: 'PDV' })).toBeVisible()
    await expect(p.getByRole('link', { name: 'Voltar às comandas' })).toBeVisible()

    // Registrado × conferido: o Pix registrou R$ 120; o dinheiro, R$ 50 na gaveta.
    await expect(p.locator('[data-forma="PIX"] [data-registrado]')).toContainText('120,00')
    await expect(p.locator('[data-forma="CASH"] [data-registrado]')).toContainText('50,00')
    await expect(p.locator('[data-forma="DEBIT_CARD"] [data-registrado]')).toContainText('100,00')

    await p.getByLabel('Dinheiro contado (R$)').fill('50')
    await p.getByLabel('Conferido em Pix').fill('100')
    // O débito fica em branco: não conferido.
    await p.getByRole('button', { name: 'Fechar o dia' }).click()
    await expect(p.getByText(/Fechado por/)).toBeVisible()

    await expect(p.locator('[data-forma="PIX"] [data-diferenca]')).toContainText('Faltou R$ 20,00')
    await expect(p.locator('[data-forma="PIX"] [data-conferido]')).toContainText('100,00')
    await expect(p.locator('[data-forma="DEBIT_CARD"] [data-diferenca]')).toContainText('não conferido')
    await expect(p.locator('[data-forma="CASH"] [data-diferenca]')).toContainText('Bateu')
  })
  const { data } = await db().from('fechamentos_do_dia').select('contado_dinheiro, esperado_dinheiro, conferido')
    .eq('branch_id', rede!.branchId).order('fechado_em', { ascending: false }).limit(1)
    .single<{ contado_dinheiro: number; esperado_dinheiro: number; conferido: Record<string, number> | null }>()
  expect(Number(data!.contado_dinheiro)).toBe(50)
  expect(Number(data!.esperado_dinheiro)).toBe(50)
  expect(data!.conferido).toEqual({ PIX: 100 })
})

test('CX4: /fechamento leva ao fechamento no PDV (com o dia)', async ({ browser }) => {
  await como(recepcao!, browser, async p => {
    await p.goto(`/${slug}/fechamento?dia=${hoje()}`)
    await expect(p).toHaveURL(new RegExp(`/${slug}/pdv\\?.*fechar=1`))
    await expect(p).toHaveURL(new RegExp(`dia=${hoje()}`))
    await expect(p.locator('[data-forma="PIX"] [data-diferenca]')).toContainText('Faltou R$ 20,00')
  })
})

test('CX4: quem só vê o Financeiro de todos vê o fechamento, sem fechar', async ({ browser }) => {
  await como(contadora!, browser, async p => {
    await p.goto(`/admin/pdv?fechar=1&unidade=${rede!.branchId}`)
    await expect(p.locator('[data-forma="PIX"] [data-diferenca]')).toContainText('Faltou R$ 20,00')
    await expect(p.getByRole('button', { name: 'Fechar o dia' })).toHaveCount(0)
    await expect(p.getByRole('button', { name: 'Fechar de novo' })).toHaveCount(0)
    await expect(p.getByLabel('Dinheiro contado (R$)')).toHaveCount(0)
    // As comandas continuam de quem recebe.
    await expect(p.getByRole('link', { name: 'Voltar às comandas' })).toHaveCount(0)
  })
})

test('CX5: só dois avisos — a comanda aberta e o dinheiro depois do fechamento; o resto recolhido', async ({ browser }) => {
  // Entrou dinheiro depois do fechamento do primeiro teste.
  await lancar([{ description: `Depois ${marca}`, amount: 30, payment_method: 'PIX' }])
  await como(recepcao!, browser, async p => {
    await p.goto(`/${slug}/pdv?fechar=1`)
    const avisos = p.locator('[data-avisos-do-fechamento] [data-aviso]')
    await expect(avisos).toHaveCount(2)
    await expect(p.locator('[data-aviso="comandas-abertas"]')).toContainText('Há 1 comanda aberta')
    await expect(p.locator('[data-aviso="comandas-abertas"] a')).toHaveAttribute('href', /ver=ABERTAS/)
    await expect(p.locator('[data-aviso="movimento-depois"]')).toContainText(/Entrou dinheiro depois do fechamento das \d{2}:\d{2}: confira e feche de novo/)
    // Saíram da tela: a lista dos concluídos a receber, as taxas, a operadora, o CSV.
    await expect(p.getByText('Concluídos a receber')).toHaveCount(0)
    await expect(p.locator('[data-taxas-do-dia]')).toHaveCount(0)
    await expect(p.locator('[data-aviso="sem-taxa"]')).toHaveCount(0)
    await expect(p.getByRole('button', { name: 'Exportar CSV' })).toHaveCount(0)
    // "Por quem recebeu" no detalhe recolhido.
    const detalhe = p.locator('details[data-detalhes-do-dia]')
    await expect(detalhe).not.toHaveAttribute('open', /.*/)
    await expect(detalhe.locator('[data-por-quem-recebeu]')).toHaveCount(1)
    await expect(detalhe.locator('[data-por-quem-recebeu]')).toBeHidden()
    await detalhe.locator('summary').click()
    await expect(detalhe.locator('[data-por-quem-recebeu]')).toBeVisible()
  })
})

test('CX6: o Financeiro avisa da venda sem taxa, estima as taxas e baixa o CSV do fechamento do dia', async ({ browser }) => {
  await como(contadora!, browser, async p => {
    await p.goto(`/admin/financeiro?period=today&unidade=${rede!.branchId}`)
    await expect(p.locator('[data-aviso-sem-taxa]')).toContainText('Sem taxa da maquininha cadastrada')
    // R$ 150 no Pix a 1%.
    await expect(p.locator('[data-taxas-estimadas]')).toContainText('R$ 1,50')
    await p.getByRole('button', { name: 'CSV do fechamento do dia' }).click()
    const janela = p.getByRole('dialog', { name: 'CSV do fechamento do dia' })
    await janela.getByLabel('Dia').fill(hoje())
    const [arquivo] = await Promise.all([p.waitForEvent('download'), janela.getByRole('button', { name: 'Baixar' }).click()])
    const fs = await import('node:fs/promises')
    const texto = (await fs.readFile((await arquivo.path())!, 'utf8')).replace(/^﻿/, '')
    expect(texto).toContain(`Fechamento do dia;${hoje()}`)
    expect(texto).toMatch(/Pix;150,00/)
    expect(texto).toContain('Situação do dia;Fechado por')
  })
})
