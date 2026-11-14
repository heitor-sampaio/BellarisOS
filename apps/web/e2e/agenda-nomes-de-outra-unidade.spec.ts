import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * D2 da simulação de 2026-11-01 (rede de duas unidades): a agenda da UNIDADE
 * mostrava "—" no lugar do nome
 * - da CLIENTE cadastrada em OUTRA unidade da rede (a Marlene, da Moinhos,
 *   agendada na Zona Sul) — a gerente e a esteticista fixas na Zona Sul viam
 *   "—" no cartão e na janela do agendamento;
 * - do PROFISSIONAL da rede (`branch_id` nulo), visto por quem tem unidade fixa.
 *
 * A página lia `clients(name)` e `users(name)` pela SESSÃO, e a RLS recorta
 * a ficha pela unidade de CADASTRO e o membro pela unidade dele. O agendamento
 * é da unidade (a sessão o lê); o nome de quem está nele também tem de ir.
 * O mesmo no Financeiro da unidade (o lançamento da cliente de outra unidade).
 *
 * Quem vê é sempre um membro de UNIDADE FIXA: como admin a tela abre de
 * qualquer jeito, e o teste não provaria nada.
 */

const marca = `nm${Date.now().toString(36)}`
const db = () => banco()
let rede: OutraRede | null = null
let unidadeB = ''
let slugB = ''
let clienteDeA = ''
let gerenteDeB: MembroDeTeste | null = null
let esteticistaDeB: MembroDeTeste | null = null
const agendamentos: string[] = []
let lancamento = ''
const DIA = diaEmQueAUnidadeAbre(1)
const nomeDaCliente = `${PREFIXO} Marlene ${marca}`
const nomeDoProfDaRede = `${PREFIXO} Prof ${marca}`
const descricaoDoLancamento = `${PREFIXO} Venda ${marca}`

async function como(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function agendar(professionalId: string, hhmm: string): Promise<string> {
  const { data, error } = await db().from('appointments').insert({
    branch_id: unidadeB, client_id: clienteDeA, procedure_id: rede!.procedureId, professional_id: professionalId,
    scheduled_at: new Date(`${DIA}T${hhmm}:00-03:00`).toISOString(), duration_min: 60, price: 150,
    status: 'SCHEDULED', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(error, `agendar às ${hhmm}`).toBeNull()
  agendamentos.push(data!.id)
  return data!.id
}

test.beforeAll(async () => {
  rede = await criarOutraRede(marca)
  const { data: b, error: eB } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Zona Sul ${marca}`, slug: `e2e-zs-${marca}` })
    .select('id, slug').single<{ id: string; slug: string }>()
  expect(eB, 'criar a segunda unidade').toBeNull()
  unidadeB = b!.id; slugB = b!.slug

  // A cliente é cadastrada em A (a unidade do apoio) e agendada em B.
  clienteDeA = await rede.criarCliente('Marlene')

  // O profissional da rede: o do apoio, sem unidade, que atende em todas.
  expect((await db().from('users').update({ provides_services: true, branch_id: null }).eq('id', rede.professionalId)).error).toBeNull()

  gerenteDeB = await criarMembro(`g${marca}`, {
    tenant: rede.tenantId, branchId: unidadeB, rotulo: 'Gerente de B',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' },
      { modulo: 'financial', nivel: 'VIEW', escopo: 'ALL' },
    ],
  })
  esteticistaDeB = await criarMembro(`e${marca}`, {
    tenant: rede.tenantId, branchId: unidadeB, rotulo: 'Esteticista de B',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' }],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', esteticistaDeB.userId)).error).toBeNull()

  await agendar(rede.professionalId, '12:00')
  await agendar(esteticistaDeB.userId, '15:00')

  const { data: tx, error: eTx } = await db().from('financial_transactions').insert({
    branch_id: unidadeB, client_id: clienteDeA, type: 'INCOME', category: 'Outro',
    description: descricaoDoLancamento, amount: 150, is_paid: true, paid_at: new Date().toISOString(),
    payment_method: 'PIX', created_by: 'e2e',
  }).select('id').single<{ id: string }>()
  expect(eTx, 'lançar a venda da cliente de A em B').toBeNull()
  lancamento = tx!.id
})

test.afterAll(async () => {
  if (lancamento) await db().from('financial_transactions').delete().eq('id', lancamento)
  if (agendamentos.length) {
    await db().from('appointment_history').delete().in('appointment_id', agendamentos)
    await db().from('appointments').delete().in('id', agendamentos)
  }
  await esteticistaDeB?.limpar()
  await gerenteDeB?.limpar()
  if (unidadeB) await db().from('branches').delete().eq('id', unidadeB)
  await rede?.limpar()
})

test('a gerente fixa em B vê a cliente de A e o profissional da rede no cartão e na janela', async ({ browser }) => {
  await como(browser, gerenteDeB!.estado, async p => {
    await p.goto(`/${slugB}/agenda?date=${DIA}`)
    const cartao = p.locator(`[data-agendamento="${agendamentos[0]}"]`)
    await expect(cartao).toContainText(nomeDaCliente)

    // O profissional da rede tem a coluna dele na agenda de B.
    await expect(p.getByText(nomeDoProfDaRede).first()).toBeVisible()

    await cartao.click()
    const janela = p.getByRole('dialog', { name: 'Agendamento' })
    await expect(janela.getByRole('heading', { name: nomeDaCliente })).toBeVisible()
    await expect(janela).toContainText(nomeDoProfDaRede)
    await expect(janela.getByText('—', { exact: true })).toHaveCount(0)
  })
})

test('a esteticista fixa em B vê o nome da cliente de A na "Minha agenda"', async ({ browser }) => {
  await como(browser, esteticistaDeB!.estado, async p => {
    await p.goto(`/${slugB}/agenda?date=${DIA}`)
    await expect(p.getByText(nomeDaCliente).first()).toBeVisible()
  })
})

test('o Financeiro de B mostra a cliente de A no lançamento', async ({ browser }) => {
  await como(browser, gerenteDeB!.estado, async p => {
    await p.goto(`/${slugB}/financeiro?aba=movimentacoes`)
    const linha = p.locator('tr', { hasText: descricaoDoLancamento })
    await expect(linha).toBeVisible()
    await expect(linha.locator('td[data-label="Cliente"]')).toHaveText(nomeDaCliente)
  })
})
