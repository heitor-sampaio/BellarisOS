import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * FD3 do plano de adaptação (o Heitor, 2026-11-13: "concordo"): "pontos só na
 * unidade" sai. A cliente é da rede e qualquer unidade a atende; o saldo é
 * sempre UM, da rede. Saem junto a escolha "Onde os pontos valem"
 * (`loyalty_configs.scope_per_branch`), o saldo por unidade
 * (`saldos_por_unidade`, a linha "Unidade A: … · Unidade B: …" da ficha e do
 * app) e o "Onde o bônus pode ser usado" (H10) com a C64 — com um saldo só,
 * não há o que escolher.
 *
 * O ponto ganho na unidade A se usa na B: no ajuste, no desconto do
 * pagamento, na troca por recompensa (pela equipe e pelo app) e no voucher
 * trocado na outra unidade. O `branch_id` do lançamento fica: é onde ele
 * aconteceu (o extrato diz), não um recorte do saldo.
 *
 * Rede própria com duas unidades (isolado).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let cliente: ClienteDeTeste | null = null
let unidadeB = ''
const slugB = `e2e-unb-fsr${marca}`

test.beforeAll(async () => {
  rede = await criarOutraRede(`fsr${marca}`)
  const { data: b, error } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Unidade B ${marca}`, slug: slugB })
    .select('id').single<{ id: string }>()
  expect(error, 'criar a unidade B').toBeNull()
  unidadeB = b!.id
  gestor = await criarMembro(`fsrg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestão da fidelidade',
    permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'loyalty', nivel: 'MANAGE' }],
  })
  const { error: eCfg } = await db().from('loyalty_configs').upsert({
    tenant_id: rede.tenantId, enabled: true, earn_mode: 'POR_REAL', points_per_real: 1,
    redeem_points_value: 0.1, redeem_min_points: 0, redeem_max_pct: 100,
  }, { onConflict: 'tenant_id' })
  expect(eCfg, 'ligar a fidelidade').toBeNull()
  // A rede que, antes do FD3, tinha escolhido "só na unidade": depois dele a
  // coluna não existe mais (o erro é o esperado), e o saldo é um só.
  await db().from('loyalty_configs').update({ scope_per_branch: true } as Record<string, unknown>).eq('tenant_id', rede.tenantId)
})
test.afterAll(async () => {
  if (cliente) await cliente.limpar()
  if (gestor) await gestor.limpar()
  // A rede inteira, com a unidade B (e2e_apagar_rede); na completa, no fim da rodada (F25).
  if (rede) await rede.limpar()
})

const saldo = async (c: string) => Number((await db().rpc('saldo_de_pontos', { p_cliente: c })).data)
async function ajustar(c: string, unidade: string, pontos: number) {
  return db().rpc('ajustar_pontos', {
    p_tenant: rede!.tenantId, p_cliente: c, p_unidade: unidade, p_pontos: pontos, p_motivo: 'saldo do teste', p_ator: 'e2e',
  })
}
async function recompensa(nome: string, custo: number, desconto: number) {
  const { data, error } = await db().from('loyalty_rewards').insert({
    tenant_id: rede!.tenantId, name: `${PREFIXO} ${nome} ${marca}`, type: 'DESCONTO_VALOR',
    points_cost: custo, discount_value: desconto, validity_days: 30, is_active: true,
  }).select('id').single<{ id: string }>()
  expect(error, 'criar a recompensa').toBeNull()
  return data!.id
}
async function atendimentoEmB(c: string, preco: number) {
  const { data, error } = await db().from('appointments').insert({
    branch_id: unidadeB, client_id: c, professional_id: rede!.professionalId, procedure_id: rede!.procedureId,
    scheduled_at: new Date().toISOString(), duration_min: 30, price: preco, status: 'COMPLETED',
  }).select('id').single<{ id: string }>()
  expect(error, 'criar o atendimento em B').toBeNull()
  return data!.id
}
const pagar = (ap: string, dados: Record<string, unknown>) => db().rpc('confirmar_pagamento_do_atendimento', {
  p_agendamento: ap, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null, p_dados: dados,
})

test.describe.serial('FD3: o saldo de pontos é um só, da rede', () => {
  test('no banco: sem a abrangência na configuração, sem saldo por unidade, e as contas do saldo sem unidade', async () => {
    const cfg = await db().from('loyalty_configs').select('scope_per_branch').eq('tenant_id', rede!.tenantId).maybeSingle()
    expect(cfg.error?.message, 'a coluna scope_per_branch saiu').toMatch(/scope_per_branch/)

    const c = await rede!.criarCliente('Banco')
    expect((await ajustar(c, rede!.branchId, 10)).error).toBeNull()
    const porUnidade = await db().rpc('saldos_por_unidade', { p_cliente: c })
    expect(porUnidade.error, 'saldos_por_unidade saiu').not.toBeNull()
    const comUnidade = await db().rpc('saldo_de_pontos', { p_cliente: c, p_unidade: rede!.branchId })
    expect(comUnidade.error, 'saldo_de_pontos não recebe mais a unidade').not.toBeNull()
    const vencendo = await db().rpc('pontos_expirando', { p_cliente: c, p_unidade: null, p_ate: new Date().toISOString() })
    expect(vencendo.error, 'pontos_expirando não recebe mais a unidade').not.toBeNull()
    expect(await saldo(c)).toBe(10)
    expect(Number((await db().rpc('pontos_expirando', { p_cliente: c, p_ate: new Date().toISOString() })).data)).toBe(0)
  })

  test('o ponto ganho na unidade A se usa na B: ajuste, desconto no pagamento, troca e o voucher trocado em A', async () => {
    const c = await rede!.criarCliente('Duas unidades')
    expect((await ajustar(c, rede!.branchId, 400)).error, '400 pontos lançados em A').toBeNull()

    // Débito em B, do saldo ganho em A.
    expect((await ajustar(c, unidadeB, -50)).error, 'o débito em B usa o saldo da rede').toBeNull()
    expect(await saldo(c)).toBe(350)

    // Desconto no pagamento de um atendimento em B: 100 pontos × R$ 0,10 = R$ 10.
    const ap = await atendimentoEmB(c, 100)
    const pago = await pagar(ap, { metodo: 'PIX', pontos: 100, desconto: 10, valor_final: 90 })
    expect(pago.error, 'os pontos de A pagam em B').toBeNull()
    // 350 − 100 usados + 90 ganhos pelo pago (R$ 90 × 1).
    await expect.poll(() => saldo(c)).toBe(340)
    const { data: resgate } = await db().from('loyalty_transactions').select('branch_id, points')
      .eq('transaction_id', pago.data as string).eq('kind', 'RESGATE').single()
    expect(resgate, 'o resgate fica registrado onde aconteceu (B)').toEqual({ branch_id: unidadeB, points: -100 })

    // Troca por recompensa em B, pela equipe.
    const desconto20 = await recompensa('Desconto 20', 100, 20)
    const troca = await db().rpc('resgatar_recompensa', {
      p_tenant: rede!.tenantId, p_cliente: c, p_recompensa: desconto20, p_unidade: unidadeB, p_ator: 'e2e',
    })
    expect(troca.error, 'a troca em B usa o saldo da rede').toBeNull()
    expect(await saldo(c)).toBe(240)

    // O voucher trocado em A vale num atendimento em B.
    const emA = await db().rpc('resgatar_recompensa', {
      p_tenant: rede!.tenantId, p_cliente: c, p_recompensa: desconto20, p_unidade: rede!.branchId, p_ator: 'e2e',
    })
    expect(emA.error).toBeNull()
    const ap2 = await atendimentoEmB(c, 100)
    const comVoucher = await pagar(ap2, { metodo: 'PIX', voucher_id: emA.data, desconto_voucher: 20, valor_final: 80 })
    expect(comVoucher.error, 'o voucher de A vale em B').toBeNull()
    const { data: v } = await db().from('loyalty_vouchers').select('status').eq('id', emA.data as string).single()
    expect(v!.status).toBe('USADO')
  })

  test('a tela: a configuração não oferece "Só na unidade"; a ficha e o app mostram um saldo só, que troca em qualquer unidade', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: gestor!.estado })
    try {
      const p = await ctx.newPage()
      await p.goto('/admin/settings?tab=fidelidade')
      await expect(p.getByRole('button', { name: 'Programa ligado' })).toBeVisible()
      await expect(p.getByRole('button', { name: 'Só na unidade' })).toHaveCount(0)
      await expect(p.getByText('Onde os pontos valem')).toHaveCount(0)
      await expect(p.getByText('Onde o bônus pode ser usado')).toHaveCount(0)
    } finally { await ctx.close() }

    // A cliente, cadastrada em B, com pontos ganhos em A e em B.
    cliente = await clienteComSessao(`fsrc${marca}`, { id: unidadeB, slug: slugB }, { tenant: rede!.tenantId })
    expect((await ajustar(cliente.clientId, rede!.branchId, 150)).error).toBeNull()
    expect((await ajustar(cliente.clientId, unidadeB, 30)).error).toBeNull()
    await recompensa('Peeling', 160, 40)

    const ficha = await browser.newContext({ storageState: gestor!.estado })
    try {
      const p = await ficha.newPage()
      await p.goto(`/admin/clients/${cliente.clientId}`)
      await expect(p.getByTestId('saldo-de-pontos')).toHaveText('180 pontos')
      await expect(p.getByText(` ${marca}: `, { exact: false }), 'sem a linha do saldo por unidade').toHaveCount(0)
    } finally { await ficha.close() }

    // No app, no portal da unidade B: o saldo é o da rede, e os 160 do Peeling alcançam.
    const app = await browser.newContext({ storageState: cliente.estado })
    try {
      const p = await app.newPage()
      await p.goto(`/${slugB}/cliente/fidelidade`)
      await expect(p.getByTestId('saldo-do-portal')).toHaveText('180 pontos')
      await expect(p.getByText(` ${marca}: `, { exact: false }), 'sem a linha do saldo por unidade').toHaveCount(0)
      await expect(p.locator('li', { hasText: `${PREFIXO} Peeling ${marca}` }).locator('[data-ja-pode-trocar]'),
        'os 180 da rede alcançam os 160 (antes, só os 30 de B contavam)').toBeVisible()
    } finally { await app.close() }
  })
})
