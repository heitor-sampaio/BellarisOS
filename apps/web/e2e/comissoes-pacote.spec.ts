import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { responderAnamnese } from './apoio/anamnese'

/**
 * A comissão do PACOTE, configurável no cadastro de cada pacote (decisão do
 * Heitor, 2026-10-30). Até aqui ela era só por sessão, pela regra de cada
 * profissional. Agora são duas, cada uma ligada ou não:
 *
 * - de VENDA, para quem vendeu: percentual sobre o valor vendido ou valor
 *   fixo, liberada quando (e à medida que) o pacote é pago; o estorno devolve;
 * - de EXECUÇÃO, para quem atende cada sessão: a regra do profissional (o de
 *   sempre — os pacotes que já existem ficam assim), percentual da parte da
 *   sessão, valor fixo por sessão ou nenhuma.
 *
 * O "Abater do pacote" segue a de execução do pacote, e o extrato diz as duas
 * com o nome do pacote.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let soProcedimentos: MembroDeTeste | null = null
let cliente = ''
let proc = ''
/** O pacote da tela: venda 10%, execução R$ 25 fixo por sessão. */
let pacote = ''
/** Um pacote com a execução "nenhuma". */
let semExecucao = ''
const NOME = `${PREFIXO} Pacote comissão ${marca}`
const NOME_SEM = `${PREFIXO} Pacote sem execução ${marca}`
const n = (v: unknown) => Number(v ?? 0)

async function comSessao<T>(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** Vende um pacote de 4 sessões de R$ 200 (R$ 800) com os lançamentos dados; quem vende é o gestor. */
async function vender(pacoteId: string, lancamentos: unknown[]) {
  const { data, error } = await db().rpc('pacote_vender', {
    p_tenant: rede!.tenantId, p_cliente: cliente, p_pacote: pacoteId, p_unidade: rede!.branchId, p_ator: gestor!.userId,
    p_lancamentos: lancamentos, p_sessoes: Array.from({ length: 4 }, () => ({ procedure_id: proc, preco: 200 })),
  })
  expect(error, 'vender o pacote').toBeNull()
  return data as string
}
/** O que a comissão de VENDA deve agora (a soma do extrato da linha). */
async function devidoDaVenda(cp: string) {
  const { data: linhas, error } = await db().from('commission_lines')
    .select('id, origem, professional_id, regra_tipo, regra_valor, preco').eq('client_package_id', cp).is('appointment_id', null)
  expect(error).toBeNull()
  expect(linhas ?? [], 'uma linha de venda por pacote vendido').toHaveLength(1)
  const { data } = await db().from('commissions').select('amount').eq('line_id', linhas![0]!.id)
  return { linha: linhas![0]!, devido: Math.round((data ?? []).reduce((s, c) => s + n(c.amount), 0) * 100) / 100 }
}
async function devidoDoAtendimento(ap: string) {
  const { data } = await db().from('commissions').select('amount').eq('appointment_id', ap)
  return Math.round((data ?? []).reduce((s, c) => s + n(c.amount), 0) * 100) / 100
}
async function sessaoNoAtendimento(cp: string, numero: number) {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, professional_id: rede!.professionalId, procedure_id: proc,
    scheduled_at: new Date().toISOString(), duration_min: 30, price: 999, status: 'IN_PROGRESS', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  expect((await db().from('package_sessions').update({ appointment_id: data!.id })
    .eq('client_package_id', cp).eq('session_number', numero)).error).toBeNull()
  return data!.id
}
async function finalizarPelaTela(browser: Browser, ap: string) {
  await comSessao(browser, gestor!, async p => {
    await p.goto(`/admin/agenda/${ap}`)
    await p.getByRole('button', { name: 'Finalizar atendimento' }).click()
    await p.locator('textarea[name="notes"]').fill(`${PREFIXO} sessão`)
    await p.getByRole('button', { name: 'Confirmar conclusão' }).click()
    await expect.poll(async () => (await db().from('appointments').select('status').eq('id', ap).single()).data?.status,
      { message: 'a tela conclui', timeout: 20_000 }).toBe('COMPLETED')
  })
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`cpk${marca}`)
  proc = rede.procedureId
  expect((await db().from('procedures').update({ name: `${PREFIXO} Drenagem ${marca}`, price: 200 }).eq('id', proc)).error).toBeNull()
  cliente = await rede.criarCliente('Pacote comissão')
  await responderAnamnese(cliente, rede.tenantId)
  expect((await db().from('users').update({ provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  // A regra do profissional: 10% (é a que vale na execução "pela regra do profissional").
  expect((await db().from('commission_rules').insert({
    tenant_id: rede.tenantId, professional_id: rede.professionalId, procedure_id: null, type: 'PERCENTAGE', value: 10, is_active: true,
  })).error).toBeNull()
  expect((await db().from('commission_configs').upsert({
    tenant_id: rede.tenantId, modo: 'ATENDIMENTO', desconta_insumos: false, desconta_taxa: false, base_com_pontos: 'PRECO', periodo: 'MENSAL',
  }, { onConflict: 'tenant_id' })).error).toBeNull()
  gestor = await criarMembro(`cpkg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestão',
    permissoes: [
      { modulo: 'procedures', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' },
      { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'medical_records', nivel: 'MANAGE' }, { modulo: 'stock', nivel: 'VIEW' },
      { modulo: 'cashier', nivel: 'MANAGE' },
    ],
  })
  soProcedimentos = await criarMembro(`cpkp${marca}`, {
    tenant: rede.tenantId, rotulo: 'Só procedimentos', permissoes: [{ modulo: 'procedures', nivel: 'MANAGE' }],
  })
  const { data, error } = await db().rpc('pacote_salvar', {
    p_tenant: rede.tenantId, p_id: null, p_nome: NOME_SEM, p_preco: 800, p_validade: null, p_ativo: true,
    p_itens: [{ procedure_id: proc, quantity: 4 }],
    p_comissao: { venda: null, execucao: { tipo: 'NENHUMA', valor: null } },
  })
  expect(error, 'criar o pacote sem execução').toBeNull()
  semExecucao = data as string
})

test.afterAll(async () => {
  const falhas: string[] = []
  if (rede) {
    const b = db()
    // As linhas de comissão (e o extrato, em cascata) apontam quem vendeu: saem antes dos membros.
    const rl = await b.from('commission_lines').delete().eq('tenant_id', rede.tenantId)
    if (rl.error) falhas.push(`comissão: ${rl.error.message}`)
    const { data: cps } = await b.from('client_packages').select('id').eq('client_id', cliente)
    const ids = (cps ?? []).map(c => c.id as string)
    if (ids.length) {
      const r1 = await b.from('package_sessions').delete().in('client_package_id', ids)
      if (r1.error) falhas.push(`sessões: ${r1.error.message}`)
      const r2 = await b.from('financial_transactions').update({ client_package_id: null }).in('client_package_id', ids)
      if (r2.error) falhas.push(`lançamentos: ${r2.error.message}`)
      const r3 = await b.from('client_packages').delete().in('id', ids)
      if (r3.error) falhas.push(`pacotes do cliente: ${r3.error.message}`)
    }
    const r4 = await b.from('service_packages').delete().eq('tenant_id', rede.tenantId)
    if (r4.error) falhas.push(`pacotes: ${r4.error.message}`)
  }
  await soProcedimentos?.limpar()
  await gestor?.limpar()
  await rede?.limpar()
  expect(falhas).toEqual([])
})

test.describe.serial('comissão do pacote — venda e execução', () => {
  test('o cadastro do pacote configura as duas; quem não é do financeiro não as vê nem grava', async ({ browser }) => {
    await comSessao(browser, gestor!, async p => {
      await p.goto('/admin/pacotes')
      const card = p.locator('[aria-label="Pacotes"]')
      await card.getByRole('button', { name: 'Novo pacote' }).click()
      await card.getByLabel('Nome do pacote').fill(NOME)
      await card.getByLabel('Procedimento 1', { exact: true }).selectOption(proc)
      await card.getByLabel('Sessões do procedimento 1').fill('4')
      await card.getByLabel('Preço do pacote').fill('800')
      const comissao = card.getByRole('group', { name: 'Comissão do pacote' })
      // O padrão é o de sempre: sem comissão de venda, a execução pela regra de cada profissional.
      await expect(comissao.getByRole('group', { name: 'Comissão de venda' }).getByRole('button', { name: 'Nenhuma' }))
        .toHaveAttribute('aria-pressed', 'true')
      await expect(comissao.getByRole('group', { name: 'Comissão de execução' }).getByRole('button', { name: 'Regra do profissional' }))
        .toHaveAttribute('aria-pressed', 'true')
      await comissao.getByRole('group', { name: 'Comissão de venda' }).getByRole('button', { name: 'Percentual' }).click()
      await comissao.getByLabel('Valor da comissão de venda').fill('10')
      await comissao.getByRole('group', { name: 'Comissão de execução' }).getByRole('button', { name: 'Valor fixo' }).click()
      await comissao.getByLabel('Valor da comissão de execução').fill('25')
      await card.getByRole('button', { name: 'Salvar pacote' }).click()
      const linha = card.locator('[data-pacote]', { hasText: NOME })
      await expect(linha).toContainText('Venda: 10% · Execução: R$ 25,00 fixo por sessão')
    })
    const { data, error } = await db().from('service_packages')
      .select('id, comissao_venda_tipo, comissao_venda_valor, comissao_execucao, comissao_execucao_valor')
      .eq('tenant_id', rede!.tenantId).eq('name', NOME).single()
    expect(error).toBeNull()
    pacote = data!.id as string
    expect({ ...data, id: undefined, comissao_venda_valor: n(data!.comissao_venda_valor), comissao_execucao_valor: n(data!.comissao_execucao_valor) })
      .toEqual({ id: undefined, comissao_venda_tipo: 'PERCENTAGE', comissao_venda_valor: 10, comissao_execucao: 'FIXED_AMOUNT', comissao_execucao_valor: 25 })

    // Quem edita pacote sem o financeiro não vê a comissão, e a action recusa o campo.
    await comSessao(browser, soProcedimentos!, async p => {
      await p.goto('/admin/pacotes')
      await p.getByRole('button', { name: `Editar ${NOME}` }).click()
      await expect(p.getByRole('group', { name: 'Comissão do pacote' })).toHaveCount(0)
      const r = await chamarAcao(p, 'actions/pacotes.ts', 'salvarPacote', '/admin/pacotes', [{
        id: pacote, name: NOME, itens: [{ procedure_id: proc, quantity: 4 }], price: 800, validity_days: null, is_active: true,
        comissao: { venda: { tipo: 'PERCENTAGE', valor: 90 }, execucao: { tipo: 'NENHUMA', valor: null } },
      }])
      expect(r.texto).toContain('Seu cargo não muda a comissão')
    })
    const { data: depois } = await db().from('service_packages').select('comissao_venda_valor').eq('id', pacote).single()
    expect(n(depois!.comissao_venda_valor)).toBe(10)
  })

  test('venda: R$ 800 com 10% são R$ 80 para quem vendeu quando pago; a receber libera à medida que entra; o estorno devolve', async () => {
    // À vista: libera na hora.
    const aVista = await vender(pacote, [{ amount: 800, payment_method: 'PIX', is_paid: true }])
    const v1 = await devidoDaVenda(aVista)
    expect({ origem: v1.linha.origem, quem: v1.linha.professional_id, preco: n(v1.linha.preco), devido: v1.devido })
      .toEqual({ origem: 'PACOTE_VENDA', quem: gestor!.userId, preco: 800, devido: 80 })
    // O retrato da venda: mudar o catálogo depois não muda o já vendido.
    const { data: retrato } = await db().from('client_packages')
      .select('comissao_venda_tipo, comissao_venda_valor, comissao_execucao, comissao_execucao_valor').eq('id', aVista).single()
    expect({ ...retrato, comissao_venda_valor: n(retrato!.comissao_venda_valor), comissao_execucao_valor: n(retrato!.comissao_execucao_valor) })
      .toEqual({ comissao_venda_tipo: 'PERCENTAGE', comissao_venda_valor: 10, comissao_execucao: 'FIXED_AMOUNT', comissao_execucao_valor: 25 })

    // A receber em duas parcelas: nada até entrar; metade a cada parcela paga.
    const aReceber = await vender(pacote, [
      { amount: 400, payment_method: 'PIX', is_paid: false, parcela_numero: 1, parcela_total: 2 },
      { amount: 400, payment_method: 'PIX', is_paid: false, parcela_numero: 2, parcela_total: 2 },
    ])
    expect((await devidoDaVenda(aReceber)).devido).toBe(0)
    const { data: parcelas } = await db().from('financial_transactions').select('id')
      .eq('client_package_id', aReceber).order('parcela_numero')
    const pagar = (id: string) => db().from('financial_transactions').update({ is_paid: true, paid_at: new Date().toISOString() }).eq('id', id)
    expect((await pagar(parcelas![0]!.id)).error).toBeNull()
    expect((await devidoDaVenda(aReceber)).devido).toBe(40)
    expect((await pagar(parcelas![1]!.id)).error).toBeNull()
    expect((await devidoDaVenda(aReceber)).devido).toBe(80)
    // Estornar uma parcela devolve a parte dela.
    expect((await db().rpc('estornar_transacao', { p_transacao: parcelas![1]!.id, p_tenant: rede!.tenantId, p_ator: 'e2e' })).error).toBeNull()
    expect((await devidoDaVenda(aReceber)).devido).toBe(40)
  })

  test('execução: o valor fixo do pacote vale no lugar da regra do profissional; "nenhuma" não gera comissão', async ({ browser }) => {
    const { data: cps } = await db().from('client_packages').select('id').eq('package_id', pacote).order('purchased_at').limit(1)
    const ap = await sessaoNoAtendimento(cps![0]!.id as string, 1)
    await finalizarPelaTela(browser, ap)
    const { data: linha } = await db().from('commission_lines').select('origem, regra_tipo, regra_valor, preco').eq('appointment_id', ap).single()
    // A regra do profissional daria 10% de 200 = R$ 20; o pacote diz R$ 25 por sessão.
    expect({ ...linha, regra_valor: n(linha!.regra_valor), preco: n(linha!.preco) })
      .toEqual({ origem: 'PACOTE', regra_tipo: 'FIXED_AMOUNT', regra_valor: 25, preco: 200 })
    expect(await devidoDoAtendimento(ap)).toBe(25)

    const sem = await vender(semExecucao, [{ amount: 800, payment_method: 'PIX', is_paid: true }])
    const ap2 = await sessaoNoAtendimento(sem, 1)
    await finalizarPelaTela(browser, ap2)
    const { count } = await db().from('commission_lines').select('id', { count: 'exact', head: true }).eq('appointment_id', ap2)
    expect(count).toBe(0)
  })

  test('"Abater do pacote" segue a execução do pacote: o avulso sai e entra o valor fixo da sessão', async () => {
    const { data: a, error } = await db().from('appointments').insert({
      branch_id: rede!.branchId, client_id: cliente, professional_id: rede!.professionalId, procedure_id: proc,
      scheduled_at: new Date().toISOString(), duration_min: 30, price: 200, status: 'IN_PROGRESS', source: 'INTERNAL',
    }).select('id').single<{ id: string }>()
    expect(error).toBeNull()
    expect((await db().rpc('concluir_atendimento', {
      p_agendamento: a!.id, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
      p_dados: { insumos: [], comissoes: [{ procedure_id: proc, origem: 'AVULSO', treatment_plan_id: null, regra_tipo: 'PERCENTAGE', regra_valor: 10, preco: 200 }] },
    })).error, 'concluir o avulso').toBeNull()
    expect(await devidoDoAtendimento(a!.id)).toBe(20)

    const cp = await vender(pacote, [{ amount: 800, payment_method: 'PIX', is_paid: true }])
    const { data: s } = await db().from('package_sessions').select('id').eq('client_package_id', cp)
      .eq('status', 'AVAILABLE').order('session_number').limit(1).single<{ id: string }>()
    expect((await db().rpc('atendimento_abater_do_pacote', {
      p_agendamento: a!.id, p_sessao: s!.id, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
    })).error, 'abater').toBeNull()
    const { data: linhas } = await db().from('commission_lines').select('origem, status, regra_tipo, regra_valor')
      .eq('appointment_id', a!.id).order('item')
    expect((linhas ?? []).map(l => [l.origem, l.status, l.regra_tipo, n(l.regra_valor)])).toEqual([
      ['AVULSO', 'CANCELADA', 'PERCENTAGE', 10], ['PACOTE', 'ATIVA', 'FIXED_AMOUNT', 25],
    ])
    expect(await devidoDoAtendimento(a!.id)).toBe(25)
  })

  test('o extrato e o fechamento dizem as duas com o nome do pacote', async ({ browser }) => {
    await comSessao(browser, gestor!, async p => {
      await p.goto('/admin/financeiro/comissoes')
      const doVendedor = p.locator(`[data-comissoes-de="${gestor!.userId}"]`)
      await doVendedor.getByRole('button', { name: 'Extrato' }).click()
      await expect(doVendedor).toContainText(`Venda do pacote ${NOME}`)
      const doProfissional = p.locator(`[data-comissoes-de="${rede!.professionalId}"]`)
      await doProfissional.getByRole('button', { name: 'Extrato' }).click()
      await expect(doProfissional).toContainText(`Sessão do pacote ${NOME}`)
      // J-46: a rede não desconta nada — o extrato diz que a base é cheia.
      await expect(doProfissional).toContainText('base cheia (sem taxa nem insumo descontados): R$ 200,00')
    })
  })
})
