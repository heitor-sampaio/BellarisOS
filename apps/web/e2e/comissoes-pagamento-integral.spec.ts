import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { responderAnamnese } from './apoio/anamnese'

/**
 * A comissão só fica A PAGAR com o pagamento INTEGRAL da cliente (H4, decisão
 * do Heitor, 2026-11-01): "comissão só paga com pagamento integral do cliente;
 * note que pagamento parcelado no cartão deve ser considerado como pagamento
 * integral da parte do cliente".
 *
 * - avulso: quando o atendimento está pago;
 * - pacote (a venda E as sessões feitas): quando a venda inteira está paga;
 * - crediário da clínica (entrada + parcelas): só quando a última entra;
 * - cartão de crédito em N vezes: é pago na hora — libera na hora.
 *
 * Antes de liberar, a linha aparece no extrato como "aguardando o pagamento
 * integral", fora do "a pagar" e do fechamento. Na 5ª simulação o Dr. Paulo
 * ganhou R$ 192,50 pela sessão 1 de um pacote com 90% a receber, e o extrato
 * não dizia nada (A53).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let cliente = ''
let proc = ''
/** 3 sessões de R$ 1.100 (R$ 3.300); venda 10% para quem vendeu; execução pela regra do profissional (10%). */
let pacote = ''
const NOME = `${PREFIXO} Pacote integral ${marca}`
const n = (v: unknown) => Number(v ?? 0)
const ROTA = '/admin/financeiro/comissoes'

async function comSessao<T>(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function vender(lancamentos: unknown[]) {
  const { data, error } = await db().rpc('pacote_vender', {
    p_tenant: rede!.tenantId, p_cliente: cliente, p_pacote: pacote, p_unidade: rede!.branchId, p_ator: gestor!.userId,
    p_lancamentos: lancamentos, p_sessoes: Array.from({ length: 3 }, () => ({ procedure_id: proc, preco: 1100 })),
  })
  expect(error, 'vender o pacote').toBeNull()
  return data as string
}
const soma = (linhas: { amount: unknown }[] | null) => Math.round((linhas ?? []).reduce((s, c) => s + n(c.amount), 0) * 100) / 100
/** O que a comissão de VENDA do pacote deve agora (a soma do extrato da linha). */
async function devidoDaVenda(cp: string) {
  const { data: l, error } = await db().from('commission_lines').select('id, modo')
    .eq('client_package_id', cp).is('appointment_id', null).single()
  expect(error, 'a linha da venda').toBeNull()
  const { data } = await db().from('commissions').select('amount').eq('line_id', l!.id)
  return soma(data)
}
async function devidoDoAtendimento(ap: string) {
  const { data } = await db().from('commissions').select('amount').eq('appointment_id', ap)
  return soma(data)
}
async function atendimento(extra: Record<string, unknown> = {}) {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, professional_id: rede!.professionalId, procedure_id: proc,
    scheduled_at: new Date().toISOString(), duration_min: 30, price: 1100, status: 'IN_PROGRESS', source: 'INTERNAL', ...extra,
  }).select('id').single<{ id: string }>()
  expect(error, 'criar o atendimento').toBeNull()
  return data!.id
}
async function concluir(ap: string, origem: 'AVULSO' | 'PACOTE') {
  const { error } = await db().rpc('concluir_atendimento', {
    p_agendamento: ap, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
    p_dados: { insumos: [], comissoes: [{ procedure_id: proc, origem, treatment_plan_id: null, regra_tipo: 'PERCENTAGE', regra_valor: 10, preco: 1100 }] },
  })
  expect(error, 'concluir').toBeNull()
}
/** Uma sessão do pacote feita (concluída pelo banco, como a tela faz). */
async function sessaoFeita(cp: string, numero: number) {
  const ap = await atendimento()
  expect((await db().from('package_sessions').update({ appointment_id: ap })
    .eq('client_package_id', cp).eq('session_number', numero)).error).toBeNull()
  await concluir(ap, 'PACOTE')
  return ap
}
const pagarLancamento = (id: string) =>
  db().from('financial_transactions').update({ is_paid: true, paid_at: new Date().toISOString() }).eq('id', id)

test.beforeAll(async () => {
  rede = await criarOutraRede(`cpi${marca}`)
  proc = rede.procedureId
  expect((await db().from('procedures').update({ name: `${PREFIXO} Laser ${marca}`, price: 1100 }).eq('id', proc)).error).toBeNull()
  cliente = await rede.criarCliente('Comissão integral')
  await responderAnamnese(cliente, rede.tenantId)
  expect((await db().from('users').update({ provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  expect((await db().from('commission_rules').insert({
    tenant_id: rede.tenantId, professional_id: rede.professionalId, procedure_id: null, type: 'PERCENTAGE', value: 10, is_active: true,
  })).error).toBeNull()
  gestor = await criarMembro(`cpig${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestão',
    permissoes: [
      { modulo: 'procedures', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' },
      { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'medical_records', nivel: 'MANAGE' }, { modulo: 'stock', nivel: 'VIEW' },
      { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'settings', nivel: 'MANAGE' },
    ],
  })
  const { data, error } = await db().rpc('pacote_salvar', {
    p_tenant: rede.tenantId, p_id: null, p_nome: NOME, p_preco: 3300, p_validade: null, p_ativo: true,
    p_itens: [{ procedure_id: proc, quantity: 3 }],
    p_comissao: { venda: { tipo: 'PERCENTAGE', valor: 10 }, execucao: { tipo: 'REGRA', valor: null } },
  })
  expect(error, 'criar o pacote').toBeNull()
  pacote = data as string
})

test.afterAll(async () => {
  const falhas: string[] = []
  if (rede) {
    const b = db()
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
  await gestor?.limpar()
  await rede?.limpar()
  expect(falhas).toEqual([])
})

test.describe.serial('comissão só com o pagamento integral', () => {
  test('pacote no crediário (entrada + 3 parcelas): a sessão feita não libera; a última parcela libera venda e execução', async ({ browser }) => {
    const cp = await vender([
      { amount: 300, payment_method: 'PIX', is_paid: true },
      ...[1, 2, 3].map(i => ({ amount: 1000, payment_method: 'PIX', is_paid: false, parcela_numero: i, parcela_total: 3 })),
    ])
    expect(await devidoDaVenda(cp), 'a entrada não libera a comissão de venda').toBe(0)
    const ap = await sessaoFeita(cp, 1)
    expect(await devidoDoAtendimento(ap), 'a sessão feita não libera com o pacote a receber').toBe(0)

    // O extrato mostra as duas aguardando, fora do "a pagar".
    const { data: resumo, error: eR } = await db().rpc('comissoes_resumo', {
      p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId], p_inicio: new Date(Date.now() - 86_400_000).toISOString(),
      p_fim: new Date(Date.now() + 86_400_000).toISOString(), p_profissional: null,
    })
    expect(eR).toBeNull()
    const doResumo = (quem: string) => (resumo as Record<string, unknown>[]).find(r => r.professional_id === quem)
    expect([n(doResumo(rede!.professionalId)?.a_pagar), n(doResumo(rede!.professionalId)?.aguardando)]).toEqual([0, 110])
    expect([n(doResumo(gestor!.userId)?.a_pagar), n(doResumo(gestor!.userId)?.aguardando)]).toEqual([0, 330])
    await comSessao(browser, gestor!, async p => {
      await p.goto(ROTA)
      const card = p.locator(`[data-comissoes-de="${rede!.professionalId}"]`)
      await expect(card).toContainText('R$ 110,00 aguardando o pagamento integral')
      await card.getByRole('button', { name: 'Extrato' }).click()
      const linha = card.locator('[data-lancamento="AGUARDANDO"]')
      await expect(linha).toContainText('Aguardando o pagamento integral')
      await expect(linha).toContainText(`Sessão do pacote ${NOME}`)
      await expect(linha).toContainText('previsto R$ 110,00')
      // Nada a fechar: só se fecha o que está a pagar.
      await expect(card.getByRole('button', { name: 'Fechar e pagar' })).toHaveCount(0)
    })

    const { data: parcelas } = await db().from('financial_transactions').select('id')
      .eq('client_package_id', cp).eq('is_paid', false).order('parcela_numero')
    expect(parcelas ?? []).toHaveLength(3)
    expect((await pagarLancamento(parcelas![0]!.id)).error).toBeNull()
    expect((await pagarLancamento(parcelas![1]!.id)).error).toBeNull()
    expect([await devidoDaVenda(cp), await devidoDoAtendimento(ap)], 'a 2ª parcela ainda não quita').toEqual([0, 0])
    expect((await pagarLancamento(parcelas![2]!.id)).error).toBeNull()
    expect([await devidoDaVenda(cp), await devidoDoAtendimento(ap)], 'a última parcela libera as duas').toEqual([330, 110])

    // Estornar uma parcela depois tira a quitação: as duas voltam a aguardar.
    expect((await db().rpc('estornar_transacao', { p_transacao: parcelas![2]!.id, p_tenant: rede!.tenantId, p_ator: 'e2e', p_motivo: 'e2e' })).error).toBeNull()
    expect([await devidoDaVenda(cp), await devidoDoAtendimento(ap)]).toEqual([0, 0])
  })

  test('avulso no crédito 3x: concluído não libera; pago no cartão em 3 vezes libera na hora', async () => {
    const ap = await atendimento()
    await concluir(ap, 'AVULSO')
    expect(await devidoDoAtendimento(ap), 'concluído sem pagamento: aguarda').toBe(0)
    const { data: tx, error } = await db().rpc('confirmar_pagamento_do_atendimento', {
      p_agendamento: ap, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
      p_dados: { metodo: 'CREDIT_CARD', cartao_vezes: 3, pontos: 0, desconto: 0, valor_final: 1100 },
    })
    expect(error, 'pagar em 3x').toBeNull()
    // O cartão em N vezes segue um lançamento só, pago, com as vezes (como já era).
    const { data: l } = await db().from('financial_transactions').select('is_paid, cartao_vezes').eq('id', tx as string).single()
    expect(l).toEqual({ is_paid: true, cartao_vezes: 3 })
    expect(await devidoDoAtendimento(ap), 'cartão em N vezes é pagamento integral').toBe(110)
  })

  test('pacote no Pix à vista: a venda libera na hora, e a sessão feita também', async () => {
    const cp = await vender([{ amount: 3300, payment_method: 'PIX', is_paid: true }])
    expect(await devidoDaVenda(cp)).toBe(330)
    const ap = await sessaoFeita(cp, 1)
    expect(await devidoDoAtendimento(ap)).toBe(110)
    const { data: linha } = await db().from('commission_lines').select('modo').eq('appointment_id', ap).single()
    expect(linha?.modo).toBe('INTEGRAL')
  })

  test('Configurações → Comissões não oferece mais "No atendimento": diz a regra única', async ({ browser }) => {
    await comSessao(browser, gestor!, async p => {
      await p.goto('/admin/settings?tab=comissoes')
      const como = p.locator('[aria-label="Como a comissão acontece"]')
      await expect(como).toContainText('quando a cliente paga tudo o que a gerou')
      await expect(como).toContainText('Cartão de crédito em várias vezes conta como pago')
      await expect(como.getByRole('button', { name: 'No atendimento' })).toHaveCount(0)
    })
  })
})
