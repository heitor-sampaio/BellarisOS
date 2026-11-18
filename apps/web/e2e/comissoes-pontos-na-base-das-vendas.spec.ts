import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { venderPacotePelaAcao } from './apoio/contrato-do-pacote'
import { responderAnamnese } from './apoio/anamnese'

/**
 * Item 10 das correções da auditoria das regras (2026-11-18) — decisão do
 * Claude pelos princípios 2 e 3, não do Heitor: na comissão, os pontos seguem a
 * escolha da rede. Com a rede em "Sobre o valor pago"
 * (`commission_configs.base_com_pontos = 'VALOR_PAGO'`), os pontos e o voucher
 * usados saem da base também no pacote, no plano e nas vendas — até aqui só no
 * avulso, e a escolha da rede não valia ali (comissoes.md:139-142).
 *
 * O pacote de 4 sessões de R$ 200 (R$ 800), 10% de comissão de venda, pago com
 * R$ 40 em pontos (800 pontos a R$ 0,05) e R$ 760 no Pix:
 *  - a de venda é 10% de R$ 760 = R$ 76 (era R$ 80);
 *  - a da sessão (10% pela regra) é sobre R$ 200 − R$ 10 (1/4 dos pontos) = R$ 19 (era R$ 20);
 *  - o extrato diz "base sem os pontos e o voucher usados".
 */

test.describe.configure({ mode: 'serial', timeout: 180_000 })

const marca = Date.now().toString(36)
const db = () => banco()
const n = (v: unknown) => Number(v ?? 0)
let rede: OutraRede
let gestor: MembroDeTeste
let admin: MembroDeTeste
let cliente = ''
let pacote = ''
let vendido = ''

async function comSessao<T>(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const devido = async (filtro: { linha?: string; appointment?: string }) => {
  const q = db().from('commissions').select('amount')
  const { data } = filtro.linha ? await q.eq('line_id', filtro.linha) : await q.eq('appointment_id', filtro.appointment!)
  return Math.round((data ?? []).reduce((s, c) => s + n(c.amount), 0) * 100) / 100
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`cpv${marca}`)
  const b = db()
  expect((await b.from('procedures').update({ name: `${PREFIXO} Drenagem ${marca}`, price: 200 }).eq('id', rede.procedureId)).error).toBeNull()
  expect((await b.from('users').update({ provides_services: true, branch_id: rede.branchId, atende_em: [rede.branchId] }).eq('id', rede.professionalId)).error).toBeNull()
  expect((await b.from('commission_rules').insert({
    tenant_id: rede.tenantId, professional_id: rede.professionalId, procedure_id: null, type: 'PERCENTAGE', value: 10, is_active: true,
  })).error).toBeNull()
  // A escolha da rede: "Sobre o valor pago".
  expect((await b.from('commission_configs').upsert({
    tenant_id: rede.tenantId, desconta_insumos: false, desconta_taxa: false, base_com_pontos: 'VALOR_PAGO', periodo: 'MENSAL',
  }, { onConflict: 'tenant_id' })).error).toBeNull()
  // A fidelidade: o ponto vale R$ 0,05, até 50%.
  expect((await b.from('loyalty_configs').upsert({
    tenant_id: rede.tenantId, enabled: true, earn_mode: 'POR_REAL', points_per_real: 1,
    redeem_points_value: 0.05, redeem_min_points: 0, redeem_max_pct: 50,
  }, { onConflict: 'tenant_id' })).error).toBeNull()
  // Sem contrato de pacote ativo: este spec é da comissão, não da assinatura.
  expect((await b.from('document_templates').update({ is_active: false })
    .eq('tenant_id', rede.tenantId).eq('kind', 'CONTRATO_PACOTE')).error).toBeNull()
  const { data, error } = await b.rpc('pacote_salvar', {
    p_tenant: rede.tenantId, p_id: null, p_nome: `${PREFIXO} Pacote pontos ${marca}`, p_preco: 800, p_validade: null, p_ativo: true,
    p_itens: [{ procedure_id: rede.procedureId, quantity: 4 }],
    p_comissao: { venda: { tipo: 'PERCENTAGE', valor: 10 }, execucao: { tipo: 'REGRA', valor: null } },
  })
  expect(error, 'criar o pacote').toBeNull()
  pacote = data as string
  cliente = await rede.criarCliente('Pontos na base')
  await responderAnamnese(cliente, rede.tenantId)
  expect((await b.rpc('ajustar_pontos', {
    p_tenant: rede.tenantId, p_cliente: cliente, p_unidade: rede.branchId, p_pontos: 800, p_motivo: 'saldo do teste', p_ator: 'e2e',
  })).error, 'dar pontos').toBeNull()
  gestor = await criarMembro(`cpvg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestão',
    permissoes: [
      { modulo: 'procedures', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' },
      { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'medical_records', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' },
    ],
  })
  // A configuração de comissões é da rede toda: só a Admin da rede a abre (o
  // Heitor, 18/11: "Configuração da rede toda só pela conta admin").
  admin = await criarMembro(`cpva${marca}`, { tenant: rede.tenantId, rotulo: 'Admin da rede', permissoes: [], cargoDaRede: 'NETWORK_ADMIN' })
})

test.afterAll(async () => {
  await gestor?.limpar()
  await admin?.limpar()
  await rede?.limpar()
})

test('a venda do pacote paga com pontos: a comissão de venda sai sem os pontos (10% de R$ 760)', async ({ browser }) => {
  await comSessao(browser, gestor, async p => {
    await p.goto('/admin/pdv')
    const r = await venderPacotePelaAcao(p, '/admin/pdv', [
      cliente, pacote, rede.branchId, { forma: 'AVISTA', metodo: 'PIX' }, null, null,
      { vendedorId: gestor.userId }, { pontos: 800, voucherId: null },
    ])
    expect(r.texto).toContain('clientPackageId')
  })
  const { data: cp } = await db().from('client_packages').select('id').eq('client_id', cliente).single<{ id: string }>()
  vendido = cp!.id
  const { data: tx } = await db().from('financial_transactions').select('amount, loyalty_discount, is_paid').eq('client_package_id', vendido)
  expect((tx ?? []).map(t => [n(t.amount), n(t.loyalty_discount), t.is_paid]), 'R$ 760 no Pix e R$ 40 em pontos').toEqual([[760, 40, true]])
  const { data: linha } = await db().from('commission_lines').select('id, base_com_pontos')
    .eq('client_package_id', vendido).eq('origem', 'PACOTE_VENDA').single<{ id: string; base_com_pontos: string }>()
  expect(linha!.base_com_pontos, 'a linha retrata a escolha da rede').toBe('VALOR_PAGO')
  await expect.poll(() => devido({ linha: linha!.id }), { message: '10% de R$ 760', timeout: 15_000 }).toBe(76)
})

test('a sessão do pacote: 10% de R$ 200 − R$ 10 (a parte dela nos pontos) = R$ 19', async ({ browser }) => {
  const { data: ap, error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, professional_id: rede.professionalId, procedure_id: rede.procedureId,
    scheduled_at: new Date().toISOString(), duration_min: 30, price: 200, status: 'IN_PROGRESS', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  expect((await db().from('package_sessions').update({ appointment_id: ap!.id })
    .eq('client_package_id', vendido).eq('session_number', 1)).error).toBeNull()
  await comSessao(browser, gestor, async p => {
    await p.goto(`/admin/agenda/${ap!.id}`)
    await p.getByRole('button', { name: 'Finalizar atendimento' }).click()
    await p.locator('textarea[name="notes"]').fill(`${PREFIXO} sessão`)
    await p.getByRole('button', { name: 'Confirmar conclusão' }).click()
    await expect.poll(async () => (await db().from('appointments').select('status').eq('id', ap!.id).single()).data?.status,
      { message: 'a tela conclui', timeout: 20_000 }).toBe('COMPLETED')
  })
  await expect.poll(() => devido({ appointment: ap!.id }), { message: '10% de R$ 190', timeout: 15_000 }).toBe(19)

  // O extrato diz que os pontos saíram da base.
  await comSessao(browser, gestor, async p => {
    await p.goto('/admin/financeiro/comissoes')
    const doProfissional = p.locator(`[data-comissoes-de="${rede.professionalId}"]`)
    await doProfissional.getByRole('button', { name: 'Extrato' }).click()
    await expect(doProfissional).toContainText('base sem os pontos e o voucher usados')
  })
})

test('Configurações → Comissões diz que a escolha vale também nas sessões e nas vendas', async ({ browser }) => {
  await comSessao(browser, admin, async p => {
    await p.goto('/admin/settings?tab=comissoes')
    await p.getByRole('button', { name: 'Sobre a comissão com pontos ou voucher' }).hover()
    await expect(p.getByText('Vale no atendimento, nas sessões de pacote e de plano e nas vendas.').first()).toBeVisible()
  })
})
