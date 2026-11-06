import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { responderAnamnese } from './apoio/anamnese'

/**
 * "Trazer pacote de fora" (decisão 1 do Heitor sobre a 8ª simulação,
 * 2026-11-06: "concordo"). A Lúcia migrava a base: a Camila tinha 7 de 10
 * limpezas usadas no sistema antigo. A tela só vendia pacote cheio, e o
 * improviso — o pacote "Saldo migrado" a R$ 0 — entrou no catálogo, nas
 * Vendas, no ticket médio e no app da cliente ("Pix R$ 0,00 Pago").
 *
 * O pacote trazido é o saldo que ela JÁ TINHA: procedimento, total, já
 * usadas, validade e um valor de referência opcional.
 *  - Sem lançamento no caixa, sem pontos, sem comissão de venda; fora do
 *    catálogo de venda e do Relatório de Vendas.
 *  - A ficha diz "Pacote de antes" e as sessões "usadas antes do sistema"
 *    (A57); o app, "Pacote de antes: N de M restantes".
 *  - A sessão restante se agenda e se consome como a de um pacote vendido
 *    aqui: a comissão de EXECUÇÃO sai pela regra do profissional sobre o
 *    rateio do valor de referência, e a receita dos atendimentos conta o
 *    rateio no dia da sessão; sem valor de referência, R$ 0 e a tela avisa
 *    (princípios 4 e 5). O caixa nunca conta.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let gestor: MembroDeTeste
/** A recepção: Clientes em Gerenciar, sem o Financeiro — não traz pacote. */
let recepcao: MembroDeTeste
let cliente: ClienteDeTeste
let slug = ''
const PROC = `${PREFIXO} Limpeza de fora ${marca}`
const n = (v: unknown) => Number(v ?? 0)

async function comSessao<T>(browser: Browser, m: { estado: string }, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const pacotesDela = async () => (await db().from('client_packages')
  .select('id, de_fora, price, valor_referencia, usadas_antes, total_sessions, used_sessions, sold_by, package_id, service_packages(name, is_active, de_fora), package_sessions(session_number, status, preco, appointment_id)')
  .eq('client_id', cliente.clientId).order('purchased_at')).data ?? []

async function sessaoNoAtendimento(cp: string, numero: number) {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente.clientId, professional_id: rede.professionalId, procedure_id: rede.procedureId,
    scheduled_at: new Date().toISOString(), duration_min: 30, price: 999, status: 'IN_PROGRESS', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  expect((await db().from('package_sessions').update({ appointment_id: data!.id })
    .eq('client_package_id', cp).eq('session_number', numero)).error).toBeNull()
  return data!.id
}

async function finalizarPelaTela(browser: Browser, ap: string) {
  await comSessao(browser, gestor, async p => {
    await p.goto(`/admin/agenda/${ap}`)
    await p.getByRole('button', { name: 'Finalizar atendimento' }).click()
    await p.locator('textarea[name="notes"]').fill(`${PREFIXO} sessão trazida`)
    await p.getByRole('button', { name: 'Confirmar conclusão' }).click()
    await expect.poll(async () => (await db().from('appointments').select('status').eq('id', ap).single()).data?.status,
      { message: 'a tela conclui', timeout: 20_000 }).toBe('COMPLETED')
  })
}

const devidoDoAtendimento = async (ap: string) => {
  const { data } = await db().from('commissions').select('amount').eq('appointment_id', ap)
  return Math.round((data ?? []).reduce((s, c) => s + n(c.amount), 0) * 100) / 100
}

test.describe.configure({ mode: 'serial', timeout: 180_000 })

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`pdf${marca}`)
  const b = db()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await b.from('procedures').update({ name: PROC, price: 180, visible_on_client_app: true }).eq('id', rede.procedureId)).error).toBeNull()
  expect((await b.from('users').update({ provides_services: true, branch_id: rede.branchId }).eq('id', rede.professionalId)).error).toBeNull()
  // A regra do profissional: 10% (é a que vale na execução da sessão trazida).
  expect((await b.from('commission_rules').insert({
    tenant_id: rede.tenantId, professional_id: rede.professionalId, procedure_id: null, type: 'PERCENTAGE', value: 10, is_active: true,
  })).error).toBeNull()
  expect((await b.from('commission_configs').upsert({
    tenant_id: rede.tenantId, desconta_insumos: false, desconta_taxa: false, base_com_pontos: 'PRECO', periodo: 'MENSAL',
  }, { onConflict: 'tenant_id' })).error).toBeNull()
  gestor = await criarMembro(`pdfg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Dona',
    permissoes: [
      { modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' },
      { modulo: 'medical_records', nivel: 'MANAGE' }, { modulo: 'procedures', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' },
      { modulo: 'stock', nivel: 'VIEW' }, { modulo: 'reports', nivel: 'VIEW' },
    ],
  })
  recepcao = await criarMembro(`pdfr${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção', permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }],
  })
  cliente = await clienteComSessao(`pdfc${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  await responderAnamnese(cliente.clientId, rede.tenantId)
})

test.afterAll(async () => {
  await cliente?.limpar(); await gestor?.limpar(); await recepcao?.limpar()
  await rede?.limpar()
})

test('na ficha: "Trazer pacote de fora" — 4 de 6 restantes, 2 usadas antes do sistema, sem caixa, sem venda, fora do catálogo', async ({ browser }) => {
  await comSessao(browser, gestor, async p => {
    await p.goto(`/admin/clients/${cliente.clientId}`)
    await p.getByRole('button', { name: 'Trazer pacote de fora' }).click()
    const janela = p.getByRole('dialog', { name: 'Trazer pacote de fora' })
    await janela.getByLabel('Procedimento').selectOption({ label: PROC })
    await janela.getByLabel('Sessões do pacote').fill('6')
    await janela.getByLabel('Já usadas antes do sistema').fill('2')
    await janela.getByLabel('Valor de referência (opcional)').fill('1.200,00')
    // A tela diz a conta antes de gravar (princípio 3).
    await expect(janela.locator('[data-conta-do-pacote-de-fora]')).toContainText('Ficam 4 de 6 sessões para agendar')
    await expect(janela.locator('[data-conta-do-pacote-de-fora]')).toContainText('R$ 200,00 por sessão')
    await expect(janela.locator('[data-conta-do-pacote-de-fora]')).toContainText('não entra no caixa')
    await janela.getByRole('button', { name: 'Trazer pacote' }).click()
    await expect(janela).toBeHidden({ timeout: 15_000 })

    const cartao = p.locator('[data-pacote-de-fora]')
    await expect(cartao).toContainText('PACOTE DE ANTES')
    await expect(cartao).toContainText('4 de 6 restantes')
    await expect(cartao).toContainText('2 usadas antes do sistema')

    // A57: na ficha de tratamento, as usadas aparecem como usadas antes do sistema.
    await cartao.getByRole('button').first().click()
    await expect(p.locator('[data-usadas-antes]')).toContainText('Pacote de antes: 2 usadas antes do sistema.')
    await p.getByRole('button', { name: 'Gerenciar sessões' }).click()
    await expect(p.getByText('Usada antes do sistema', { exact: true })).toHaveCount(2)
  })

  const [cp] = await pacotesDela()
  expect(cp).toMatchObject({ de_fora: true, price: null, usadas_antes: 2, total_sessions: 6, used_sessions: 2, sold_by: null })
  expect(n(cp!.valor_referencia)).toBe(1200)
  const sp = cp!.service_packages as unknown as { is_active: boolean; de_fora: boolean }
  expect(sp).toMatchObject({ is_active: false, de_fora: true })
  const sessoes = [...(cp!.package_sessions as { session_number: number; status: string; preco: number }[])].sort((a, b) => a.session_number - b.session_number)
  expect(sessoes.map(s => s.status)).toEqual(['USED', 'USED', 'AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'AVAILABLE'])
  expect(sessoes.map(s => n(s.preco))).toEqual([200, 200, 200, 200, 200, 200])

  // Nenhum dinheiro: sem lançamento, sem pontos, sem comissão de venda.
  const { count: lancamentos } = await db().from('financial_transactions').select('id', { count: 'exact', head: true }).eq('client_id', cliente.clientId)
  expect(lancamentos).toBe(0)
  const { count: linhasDeVenda } = await db().from('commission_lines').select('id', { count: 'exact', head: true }).eq('client_package_id', cp!.id)
  expect(linhasDeVenda).toBe(0)
  const { data: pontos } = await db().from('loyalty_transactions').select('id').eq('client_id', cliente.clientId)
  expect(pontos ?? []).toEqual([])

  // Fora das Vendas.
  const inicio = new Date(Date.now() - 86_400_000).toISOString()
  const fim = new Date(Date.now() + 86_400_000).toISOString()
  const { data: vendas, error } = await db().rpc('metrics_vendas', { p_tenant: rede.tenantId, p_branch_ids: null, p_from: inicio, p_to: fim })
  expect(error).toBeNull()
  expect((vendas as { tipo: string }[]).filter(v => v.tipo === 'PACOTE')).toEqual([])

  // Fora do catálogo de venda (Vendas → Pacotes).
  await comSessao(browser, gestor, async p => {
    await p.goto('/admin/pacotes')
    await expect(p.getByRole('heading', { name: 'Pacotes' }).first()).toBeVisible()
    await expect(p.getByText(`${PROC} (pacote de antes)`)).toHaveCount(0)
  })
})

test('a sessão trazida: comissão de execução pela regra sobre o rateio, receita dos atendimentos no dia, o caixa não', async ({ browser }) => {
  const [cp] = await pacotesDela()
  const ap = await sessaoNoAtendimento(cp!.id, 3)
  await finalizarPelaTela(browser, ap)
  // 10% de R$ 200 (a parte da sessão no valor de referência), liberada na conclusão.
  await expect.poll(() => devidoDoAtendimento(ap), { message: 'a comissão da sessão trazida', timeout: 15_000 }).toBe(20)
  const depois = (await pacotesDela())[0]!
  expect(depois.used_sessions).toBe(3)

  const inicio = new Date(Date.now() - 86_400_000).toISOString()
  const fim = new Date(Date.now() + 86_400_000).toISOString()
  // A receita dos atendimentos (a execução) conta os R$ 200 da sessão…
  const { data: top, error: eTop } = await db().rpc('metrics_top_professionals', {
    p_tenant: rede.tenantId, p_branch_ids: null, p_from: inicio, p_to: fim, p_limit: 10,
  })
  expect(eTop).toBeNull()
  const doProf = (top as { professional_id: string; revenue: number }[]).find(t => t.professional_id === rede.professionalId)
  expect(doProf, 'o profissional no ranking de execução').toBeTruthy()
  expect(n(doProf!.revenue)).toBe(200)
  // … e o caixa, nada.
  const { data: nucleo } = await db().rpc('metrics_core', { p_tenant: rede.tenantId, p_branch_ids: null, p_from: inicio, p_to: fim })
  expect(n((nucleo as { revenue_cash: number }[])[0]!.revenue_cash)).toBe(0)
})

test('sem valor de referência: a comissão de execução é R$ 0, nada entra na receita dos atendimentos, e a tela avisa', async ({ browser }) => {
  // O segundo pacote trazido, pela action (sem o valor).
  await comSessao(browser, gestor, async p => {
    await p.goto(`/admin/clients/${cliente.clientId}`)
    const r = await chamarAcao(p, 'actions/pacotes.ts', 'trazerPacoteDeFora', `/admin/clients/${cliente.clientId}`, [{
      clientId: cliente.clientId, branchId: rede.branchId, procedureId: rede.procedureId, total: 3, usadas: 0, valor: null, validade: null,
    }])
    expect(r.texto).toContain('"ok":true')
  })
  const semValor = (await pacotesDela()).find(c => c.valor_referencia === null)!
  expect(semValor).toBeTruthy()
  expect((semValor.package_sessions as { preco: number | null }[]).every(s => s.preco === null)).toBe(true)

  // A tela da janela avisa ANTES de gravar, sem o valor.
  await comSessao(browser, gestor, async p => {
    await p.goto(`/admin/clients/${cliente.clientId}`)
    await p.getByRole('button', { name: 'Trazer pacote de fora' }).click()
    const janela = p.getByRole('dialog', { name: 'Trazer pacote de fora' })
    await janela.getByLabel('Procedimento').selectOption({ label: PROC })
    await janela.getByLabel('Sessões do pacote').fill('3')
    await expect(janela.locator('[data-conta-do-pacote-de-fora]'))
      .toContainText('Sem valor de referência, as sessões trazidas não geram comissão de execução (R$ 0)')
  })

  const ap = await sessaoNoAtendimento(semValor.id, 1)
  await finalizarPelaTela(browser, ap)
  expect(await devidoDoAtendimento(ap)).toBe(0)
  const { count } = await db().from('commission_lines').select('id', { count: 'exact', head: true }).eq('appointment_id', ap)
  expect(count, 'sem valor, nenhuma linha de comissão').toBe(0)
})

test('o app da cliente diz "Pacote de antes: N de M restantes", sem pagamento nem recibo', async ({ browser }) => {
  await comSessao(browser, cliente, async p => {
    await p.goto(`/${slug}/cliente/home`)
    const pacotes = p.locator('[data-pacote]')
    await expect(pacotes.filter({ hasText: 'Pacote de antes: 3 de 6 restantes' })).toHaveCount(1)
    await p.goto(`/${slug}/cliente/historico`)
    await expect(p.getByText('R$ 0,00')).toHaveCount(0)
  })
})

test('quem não tem o Financeiro em Gerenciar não traz pacote (a tela não oferece, a action recusa)', async ({ browser }) => {
  const antes = (await pacotesDela()).length
  await comSessao(browser, recepcao, async p => {
    await p.goto(`/${slug}/clients/${cliente.clientId}`)
    await expect(p.getByRole('heading', { name: new RegExp(`e2e`) }).first()).toBeVisible()
    await expect(p.getByRole('button', { name: 'Trazer pacote de fora' })).toHaveCount(0)
    const r = await chamarAcao(p, 'actions/pacotes.ts', 'trazerPacoteDeFora', `/${slug}/clients/${cliente.clientId}`, [{
      clientId: cliente.clientId, branchId: rede.branchId, procedureId: rede.procedureId, total: 3, usadas: 0, valor: 300, validade: null,
    }])
    expect(r.texto).not.toContain('"ok":true')
  })
  expect((await pacotesDela()).length).toBe(antes)
})
