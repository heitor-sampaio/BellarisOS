import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { dayKeyTZ, addDaysTZ, addMonthsTZ } from '../lib/datetime'

/**
 * Os atritos de caixa e financeiro da 12ª simulação (2026-11-11; a Helena, a
 * Heloísa, a Cláudia e a Ivone), numa rede [e2e] própria de UMA unidade:
 * - A32: no celular, o estorno só existia em Financeiro → Lançamentos — não na
 *   aba Financeiro da ficha.
 * - A35: a recepção (Recebimentos) não estorna, e a página do atendimento pago
 *   não dizia a quem pedir; a parcela do crediário na ficha não tinha ação.
 * - A36: a 1440 px, a tabela de Movimentações cortava "Remarcar vencimento" e
 *   "Estornar".
 * - A37: o cartão "A pagar" ficava sozinho numa segunda linha.
 * - A38: o botão do Copilot cobria o fim da página ("Fechar e pagar").
 * - A42: a contadora, que só vê, lia "Ver e dar baixa" e "use “Pagar” na
 *   linha", sem botão nenhum.
 * - A43: as contas a pagar em aberto de outros meses não tinham lista.
 * - A44: o CSV sem a bandeira, o desconto, a profissional e a unidade; o
 *   Fechamento juntava as bandeiras do cartão.
 * - A47: o dia sem fechamento não dizia "Ainda não fechado".
 */

test.setTimeout(240_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let slug = ''
let dona: MembroDeTeste
let caixa: MembroDeTeste
let contadora: MembroDeTeste
let carla = ''
let pixDaCarla = ''
let parcelaDaCarla = ''
let atendimento = ''
let unidadeNome = ''
let profNome = ''
const hoje = dayKeyTZ(new Date())

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>, largura = 1440) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: largura, height: 900 }, acceptDownloads: true })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
async function lancar(l: Record<string, unknown>) {
  const { data, error } = await db().from('financial_transactions').insert({
    branch_id: rede.branchId, type: 'INCOME', category: 'Procedimento', created_by: 'e2e', is_paid: true, paid_at: new Date().toISOString(), ...l,
  }).select('id').single<{ id: string }>()
  expect(error, `lançar ${String(l.description)}`).toBeNull()
  return data!.id
}
async function baixar(p: Page, botao: ReturnType<Page['getByRole']>) {
  const [arquivo] = await Promise.all([p.waitForEvent('download'), botao.click()])
  const fs = await import('node:fs/promises')
  return (await fs.readFile((await arquivo.path())!, 'utf8')).replace(/^﻿/, '')
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`fn12${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  const un = (await b.from('branches').select('slug, name').eq('id', rede.branchId).single<{ slug: string; name: string }>()).data!
  slug = un.slug; unidadeNome = un.name
  profNome = (await b.from('users').select('name').eq('id', rede.professionalId).single<{ name: string }>()).data!.name
  expect((await b.from('users').update({ provides_services: true, atende_em: [rede.branchId] }).eq('id', rede.professionalId)).error).toBeNull()
  dona = await criarMembro(`fn12d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  caixa = await criarMembro(`fn12c${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'agenda', nivel: 'VIEW' }],
  })
  contadora = await criarMembro(`fn12k${marca}`, {
    tenant: rede.tenantId, rotulo: 'Contadora', permissoes: [{ modulo: 'financial', nivel: 'VIEW', escopo: 'ALL' }],
  })
  carla = await rede.criarCliente('Carla')

  // A32: o Pix da Carla, hoje.
  pixDaCarla = await lancar({ client_id: carla, description: `${PREFIXO} Limpeza da Carla ${marca}`, amount: 200, payment_method: 'PIX' })
  // A35: a parcela do crediário dela, em aberto, sem forma (a "Com a clínica").
  parcelaDaCarla = await lancar({
    client_id: carla, description: `${PREFIXO} Pacote da Carla — parcela 2/2`, amount: 150, is_paid: false, paid_at: null,
    due_date: new Date(`${dayKeyTZ(addDaysTZ(new Date(), 10))}T12:00:00-03:00`).toISOString(), parcela_numero: 2, parcela_total: 2,
  })
  // A35 e A44: o atendimento pago (com a profissional e R$ 20 de desconto).
  const { data: ag, error: eAg } = await b.from('appointments').insert({
    branch_id: rede.branchId, client_id: carla, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 200,
    scheduled_at: new Date(Date.now() - 2 * 3_600_000).toISOString(), completed_at: new Date(Date.now() - 3_600_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(eAg).toBeNull()
  atendimento = ag!.id
  await lancar({ client_id: carla, appointment_id: atendimento, description: `${PREFIXO} Atendimento ${marca}`, amount: 180, sale_discount: 20, payment_method: 'CASH' })
  // A44: o cartão de crédito em 6x de duas bandeiras.
  await lancar({ client_id: carla, description: `${PREFIXO} Plano Visa ${marca}`, amount: 630, payment_method: 'CREDIT_CARD', cartao_vezes: 6, cartao_bandeira: 'VISA' })
  await lancar({ client_id: carla, description: `${PREFIXO} Pacote Master ${marca}`, amount: 600, payment_method: 'CREDIT_CARD', cartao_vezes: 6, cartao_bandeira: 'MASTERCARD' })
  // A43: duas contas a pagar em aberto — uma deste mês, outra do mês que vem.
  for (const [quando, valor, nome] of [[new Date(), 300, 'Energia'], [addMonthsTZ(new Date(), 1), 1000, 'Aluguel']] as const) {
    await lancar({
      type: 'EXPENSE', category: 'Outros', description: `${PREFIXO} ${nome} ${marca}`, amount: valor, is_paid: false, paid_at: null,
      due_date: new Date(`${dayKeyTZ(quando)}T12:00:00-03:00`).toISOString(),
    })
  }
})

test.afterAll(async () => {
  await dona?.limpar(); await caixa?.limpar(); await contadora?.limpar()
  await rede?.limpar()
})

test('A32: no celular, o estorno também está na aba Financeiro da ficha', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto(`/${slug}/clients/${carla}?aba=financeiro`)
    const linha = p.locator(`[data-lancamento="${pixDaCarla}"]`)
    await linha.getByRole('button', { name: 'Estornar' }).click()
    const janela = p.getByRole('dialog', { name: 'Estornar este lançamento?' })
    await janela.getByLabel('Motivo do estorno *').fill('Cobrada duas vezes [e2e]')
    await janela.getByRole('button', { name: 'Confirmar estorno' }).click()
    await expect(janela).toHaveCount(0)
    await expect(linha).toContainText('Estornado')
  }, 412)
})

test('A35: a recepção recebe a parcela na ficha e, no atendimento pago, lê a quem pedir o estorno', async ({ browser }) => {
  await como(browser, caixa, async p => {
    await p.goto(`/${slug}/clients/${carla}?aba=financeiro`)
    await p.locator(`[data-lancamento="${parcelaDaCarla}"]`).getByRole('button', { name: 'Receber' }).click()
    await expect(p.getByRole('dialog', { name: 'Receber' })).toBeVisible()
    await p.getByRole('dialog', { name: 'Receber' }).getByRole('button', { name: 'Cancelar' }).click()
    await expect(p.locator('[data-quem-desfaz]')).toBeVisible()

    await p.goto(`/${slug}/agenda/${atendimento}`)
    await expect(p.locator('[data-quem-estorna]')).toContainText('Financeiro em Gerenciar')
  })
})

test('A36, A37 e A38: a 1440 px as ações da linha cabem, o "A pagar" fica na linha dos a receber, e o Copilot não cobre o fim', async ({ browser }) => {
  await como(browser, dona, async p => {
    // FI5: a lista é a aba Movimentações; os cartões, o Resumo.
    await p.goto('/admin/financeiro?aba=movimentacoes&period=month')
    const tabela = p.locator('#movimentacoes')
    const estornar = tabela.locator('[data-estornar]').first()
    await expect(estornar).toBeVisible()
    const caixaDaTabela = (await tabela.boundingBox())!
    const caixaDoBotao = (await estornar.boundingBox())!
    expect(caixaDoBotao.x + caixaDoBotao.width, 'o "Estornar" dentro do cartão').toBeLessThanOrEqual(caixaDaTabela.x + caixaDaTabela.width + 1)
    const remarcar = tabela.getByRole('button', { name: /Remarcar vencimento/ }).first()
    const caixaDoRemarcar = (await remarcar.boundingBox())!
    expect(caixaDoRemarcar.x + caixaDoRemarcar.width, 'o "Remarcar vencimento" dentro do cartão').toBeLessThanOrEqual(caixaDaTabela.x + caixaDaTabela.width + 1)

    await p.goto('/admin/financeiro?period=month')
    const aPagar = (await p.locator('[data-kpi="a-pagar"]').boundingBox())!
    const aReceber = (await p.locator('[data-kpi="a-receber"]').boundingBox())!
    expect(Math.abs(aPagar.y - aReceber.y), 'na mesma linha').toBeLessThan(2)

    await expect(p.locator('.copilot-botao')).toBeVisible()
    // O CSS do dev pode chegar depois do botão: a folga se lê até assentar.
    await expect.poll(() => p.locator('main').evaluate(m => parseFloat(getComputedStyle(m).paddingBottom)),
      { message: 'o fim da página sobe acima do botão do Copilot' }).toBeGreaterThanOrEqual(80)
  })
})

test('A42 e A43: a contadora lê "Ver a lista"; as contas a pagar de qualquer mês têm lista', async ({ browser }) => {
  await como(browser, contadora, async p => {
    await p.goto('/admin/financeiro?period=month')
    const aReceber = p.locator('[data-kpi="a-receber"] [data-em-aberto]')
    await expect(aReceber.getByRole('link', { name: 'Ver a lista' })).toBeVisible()
    await expect(aReceber).not.toContainText('dar baixa')
    await p.goto('/admin/financeiro?aba=a-receber')
    await expect(p.locator('[data-so-o-em-aberto]')).toContainText('Dar baixa é de quem tem Recebimentos')
    await expect(p.locator('[data-so-o-em-aberto]')).not.toContainText('use “Pagar” na linha')

    // A43: o "A pagar" diz todo o em aberto e leva à lista dele.
    await p.goto('/admin/financeiro?period=month')
    const aPagar = p.locator('[data-kpi="a-pagar"] [data-em-aberto]')
    await expect(aPagar).toContainText(/R\$\s1\.300,00/)
    await aPagar.getByRole('link', { name: 'Ver a lista' }).click()
    await expect(p).toHaveURL(/aba=a-pagar/)
    const tabela = p.locator('#movimentacoes')
    await expect(tabela).toContainText(`Energia ${marca}`)
    await expect(tabela).toContainText(`Aluguel ${marca}`)
    await expect(tabela).not.toContainText(`Limpeza da Carla ${marca}`)
  })
})

test('A44 e A47: o CSV com bandeira, desconto, profissional e unidade; o Fechamento por bandeira e "Ainda não fechado"', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto('/admin/financeiro?aba=movimentacoes&period=today')
    const texto = await baixar(p, p.locator('#movimentacoes').getByRole('button', { name: 'Exportar CSV' }))
    const linhas = texto.split('\r\n').map(l => l.split(';'))
    const cab = linhas[0]!
    for (const c of ['Unidade', 'Profissional', 'Bandeira', 'Desconto', 'Fornecedor (se informado)', 'Nota fiscal (se informada)']) {
      expect(cab, `a coluna ${c}`).toContain(c)
    }
    const col = (l: string[], c: string) => l[cab.indexOf(c)]
    const visa = linhas.find(l => (col(l, 'Descrição') ?? '').includes('Plano Visa'))!
    expect(col(visa, 'Bandeira')).toBe('Visa')
    expect(col(visa, 'Unidade')).toBe(unidadeNome)
    const doAtendimento = linhas.find(l => (col(l, 'Descrição') ?? '').includes(`Atendimento ${marca}`))!
    expect(col(doAtendimento, 'Profissional')).toBe(profNome)
    expect(col(doAtendimento, 'Desconto')).toBe('20,00')

    await p.goto(`/${slug}/pdv?fechar=1&dia=${hoje}`)
    const doCartao = p.locator('[data-forma="CREDIT_CARD:6"]')
    await expect(doCartao).toContainText(/Visa\s+R\$\s630,00/)
    await expect(doCartao).toContainText(/Mastercard\s+R\$\s600,00/)
    await expect(p.locator('[data-ainda-nao-fechado]')).toContainText('Ainda não fechado')
    // O CSV do fechamento mora no Financeiro desde o CX6 (2026-11-14).
    await p.goto(`/${slug}/financeiro?aba=movimentacoes&period=today`)
    await p.getByRole('button', { name: 'CSV do fechamento do dia' }).click()
    const janela = p.getByRole('dialog', { name: 'CSV do fechamento do dia' })
    await janela.getByLabel('Dia').fill(hoje)
    const csv = await baixar(p, janela.getByRole('button', { name: 'Baixar' }))
    expect(csv).toContain('Cartão de crédito 6x · Visa;630,00')
    expect(csv).toContain('Situação do dia;Ainda não fechado')
  })
})
