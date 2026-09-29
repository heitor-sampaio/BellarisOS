'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission, alcancaUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, mensagemDoErro } from '@/lib/db'
import { EntradaDaConfig, type ConfigFidelidade } from '@/lib/fidelidade/config'
import {
  configDaRede, redeTemLancamentos, saldoDoCliente, extratoDoCliente as lerExtrato, recompensasDaRede, vouchersDoCliente,
  type LinhaDoExtrato, type Recompensa, type VoucherDoCliente,
} from '@/lib/fidelidade/leitura'
import { EntradaDaRecompensa } from '@/lib/fidelidade/recompensa'
import { saldoDepoisDaSaida } from '@/lib/estoque/baixa'
import { voucherEmitido } from '@/lib/events/fidelidade'

/**
 * Fidelidade — as ações da equipe. Todo export daqui é endpoint público
 * (CLAUDE.md §6): cada um confere a permissão E que o id recebido é da rede.
 *
 * Quem dá ponto de verdade é o banco: o ganho nasce no gatilho do pagamento
 * (`trg_fidelidade_ganho`) e o ajuste passa por `ajustar_pontos`, com a trava
 * do cliente. Nada aqui soma saldo.
 */

// ─── Configuração do programa ───────────────────────────────────────────────
// É decisão de REDE: pede Configurações e abrangência de rede — quem é de uma
// unidade não liga nem desliga o programa das outras.

export async function lerConfigFidelidade(): Promise<ConfigFidelidade> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')
  return configDaRede(ctx.tenantId!)
}

export async function salvarConfigFidelidade(entrada: unknown): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')
  if (ctx.branchId !== null) return { error: 'Só quem é da rede configura a fidelidade.' }

  const lido = EntradaDaConfig.safeParse(entrada)
  if (!lido.success) return { error: lido.error.issues[0]?.message ?? 'Dados inválidos.' }
  const c = lido.data

  // A abrangência só muda antes do primeiro lançamento: depois, trocar
  // reescreveria em silêncio o saldo de cada unidade (os pontos de uma unidade
  // passariam a valer nas outras, ou o contrário).
  const atual = await configDaRede(ctx.tenantId!)
  if (atual.scope_per_branch !== c.scope_per_branch && await redeTemLancamentos(ctx.tenantId!)) {
    return { error: 'A abrangência não muda depois que a rede já tem pontos lançados.' }
  }

  try {
    await gravar(createAdminClient()
      .from('loyalty_configs')
      .upsert({
        tenant_id:       ctx.tenantId!,
        enabled:         c.enabled,
        earn_mode:       c.earn_mode,
        points_per_real: c.points_per_real,
        // commission_base não: é de Configurações → Comissões (2026-09-30),
        // que a grava aqui também enquanto o recebimento ainda a lê daqui.
        redeem_points_value: c.redeem_points_value,
        redeem_min_points:   c.redeem_min_points,
        redeem_max_pct:      c.redeem_max_pct,
        expiry_months:       c.expiry_months,
        scope_per_branch:    c.scope_per_branch,
        birthday_bonus:      c.birthday_bonus,
        first_access_bonus:  c.first_access_bonus,
        client_redeem:       c.client_redeem,
        // Sem validade não há o que avisar: o aviso só se guarda junto dela.
        expiry_notice_days:  c.expiry_months == null ? null : c.expiry_notice_days,
        updated_at:      new Date().toISOString(),
        updated_by:      ctx.internalUserId,
      }, { onConflict: 'tenant_id' })
      .select('tenant_id')
      .single(), 'salvar a configuração da fidelidade')
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }

  revalidatePath('/admin/settings')
  return {}
}

// ─── Ajuste manual ──────────────────────────────────────────────────────────

export async function ajustarPontos(entrada: {
  clientId: string
  branchId: string
  pontos:   number
  motivo:   string
}): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'loyalty', 'MANAGE')

  const pontos = Math.trunc(Number(entrada?.pontos))
  if (!entrada?.clientId || !entrada?.branchId) return { error: 'Dados inválidos.' }
  if (!Number.isFinite(pontos) || pontos === 0) return { error: 'Informe quantos pontos creditar ou debitar.' }
  if (Math.abs(pontos) > 1_000_000)            return { error: 'Valor de pontos fora do limite.' }
  if ((entrada.motivo ?? '').trim().length < 3) return { error: 'O motivo do ajuste é obrigatório.' }
  // A rede do cliente e da unidade a função do banco confere; a abrangência
  // do MEMBRO é daqui (§11): quem é de uma unidade só lança nela.
  if (!alcancaUnidade(ctx, entrada.branchId)) return { error: 'Unidade não encontrada.' }

  try {
    await gravar(createAdminClient().rpc('ajustar_pontos', {
      p_tenant:  ctx.tenantId!,
      p_cliente: entrada.clientId,
      p_unidade: entrada.branchId,
      p_pontos:  pontos,
      p_motivo:  entrada.motivo.trim(),
      p_ator:    ctx.internalUserId ?? 'sistema',
    }), 'ajustar os pontos do cliente')
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }

  revalidatePath(`/admin/clients/${entrada.clientId}`)
  revalidatePath('/[slug]/clients/[id]', 'page')
  return {}
}

// ─── Saldo e extrato ────────────────────────────────────────────────────────

export async function extratoDoCliente(clientId: string, antes?: string | null): Promise<{
  saldo:   number
  linhas:  LinhaDoExtrato[]
  temMais: boolean
} | null> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'loyalty', 'VIEW')

  const admin = createAdminClient()
  const cliente = await ler(admin
    .from('clients').select('id').eq('id', clientId).eq('tenant_id', ctx.tenantId!).maybeSingle(),
    'conferir o cliente do extrato')
  if (!cliente) return null

  const [saldo, pagina] = await Promise.all([
    saldoDoCliente(clientId, null, admin),
    lerExtrato(clientId, { antes }, admin),
  ])
  return { saldo, ...pagina }
}

// ─── Catálogo de recompensas ────────────────────────────────────────────────
// Como a config: decisão de REDE (Configurações + abrangência de rede).

export async function catalogoDeRecompensas(): Promise<{
  recompensas:   Recompensa[]
  procedimentos: { id: string; name: string }[]
  produtos:      { id: string; name: string }[]
}> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')
  const admin = createAdminClient()
  const [recompensas, procs, prods] = await Promise.all([
    recompensasDaRede(ctx.tenantId!, false, admin),
    ler(admin.from('procedures').select('id, name').eq('tenant_id', ctx.tenantId!).eq('is_active', true).order('name'),
      'listar os procedimentos'),
    ler(admin.from('products').select('id, name').eq('tenant_id', ctx.tenantId!).order('name'),
      'listar os produtos'),
  ])
  return {
    recompensas,
    procedimentos: (procs ?? []) as { id: string; name: string }[],
    produtos:      (prods ?? []) as { id: string; name: string }[],
  }
}

export async function salvarRecompensa(entrada: unknown): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')
  if (ctx.branchId !== null) return { error: 'Só quem é da rede mexe no catálogo.' }

  const lido = EntradaDaRecompensa.safeParse(entrada)
  if (!lido.success) return { error: lido.error.issues[0]?.message ?? 'Dados inválidos.' }
  const r = lido.data
  const admin = createAdminClient()

  // O procedimento e o produto são da rede (os ids vêm do navegador).
  if (r.procedure_id) {
    const ok = await ler(admin.from('procedures').select('id').eq('id', r.procedure_id).eq('tenant_id', ctx.tenantId!).maybeSingle(),
      'conferir o procedimento')
    if (!ok) return { error: 'Procedimento não encontrado.' }
  }
  if (r.product_id) {
    const ok = await ler(admin.from('products').select('id').eq('id', r.product_id).eq('tenant_id', ctx.tenantId!).maybeSingle(),
      'conferir o produto')
    if (!ok) return { error: 'Produto não encontrado.' }
  }

  const linha = {
    name: r.name, description: r.description, type: r.type, points_cost: r.points_cost,
    procedure_id: r.procedure_id, product_id: r.product_id, discount_value: r.discount_value,
    validity_days: r.validity_days, is_active: r.is_active, updated_at: new Date().toISOString(),
  }
  try {
    if (r.id) {
      await gravar(admin.from('loyalty_rewards').update(linha)
        .eq('id', r.id).eq('tenant_id', ctx.tenantId!).select('id').single(), 'salvar a recompensa')
    } else {
      await gravar(admin.from('loyalty_rewards').insert({ ...linha, tenant_id: ctx.tenantId! })
        .select('id').single(), 'criar a recompensa')
    }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
  revalidatePath('/admin/settings')
  return {}
}

// ─── Vouchers ───────────────────────────────────────────────────────────────

/** A unidade de um voucher, conferida na rede e na abrangência do membro. */
async function voucherAoAlcance(voucherId: string): Promise<
  { ctx: Awaited<ReturnType<typeof getTenantContext>>; voucher: { client_id: string; branch_id: string; product_id: string | null; type: string } } | null
> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'loyalty', 'MANAGE')
  const v = await ler(createAdminClient().from('loyalty_vouchers')
    .select('client_id, branch_id, product_id, type')
    .eq('id', voucherId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o voucher')
  if (!v || !alcancaUnidade(ctx, (v as { branch_id: string }).branch_id)) return null
  return { ctx, voucher: v as { client_id: string; branch_id: string; product_id: string | null; type: string } }
}

export async function resgatarRecompensa(entrada: {
  clientId: string; rewardId: string; branchId: string
}): Promise<{ error?: string; voucherId?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'loyalty', 'MANAGE')
  if (!entrada?.clientId || !entrada?.rewardId || !entrada?.branchId) return { error: 'Dados inválidos.' }
  if (!alcancaUnidade(ctx, entrada.branchId)) return { error: 'Unidade não encontrada.' }

  let voucherId: string
  try {
    voucherId = await gravar(createAdminClient().rpc('resgatar_recompensa', {
      p_tenant: ctx.tenantId!, p_cliente: entrada.clientId, p_recompensa: entrada.rewardId,
      p_unidade: entrada.branchId, p_ator: ctx.internalUserId ?? 'sistema',
    }), 'trocar os pontos pela recompensa') as string
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
  await voucherEmitido(voucherId, ctx)
  revalidatePath(`/admin/clients/${entrada.clientId}`)
  return { voucherId }
}

export async function cancelarVoucher(entrada: { voucherId: string; motivo: string }): Promise<{ error?: string }> {
  const alvo = entrada?.voucherId ? await voucherAoAlcance(entrada.voucherId) : null
  if (!alvo) return { error: 'Voucher não encontrado.' }
  try {
    await gravar(createAdminClient().rpc('cancelar_voucher', {
      p_tenant: alvo.ctx.tenantId!, p_voucher: entrada.voucherId,
      p_ator: alvo.ctx.internalUserId ?? 'sistema', p_motivo: (entrada.motivo ?? '').trim(),
    }), 'cancelar o voucher')
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
  revalidatePath(`/admin/clients/${alvo.voucher.client_id}`)
  return {}
}

/**
 * Entrega o produto de um voucher: UMA embalagem sai do estoque da unidade
 * (MANUAL_ADJUSTMENT; o lote baixa pelo gatilho). A conta do saldo é a mesma
 * da conclusão (lib/estoque/baixa.ts); faltar não impede — fica negativo.
 */
export async function entregarVoucherProduto(entrada: { voucherId: string; branchId: string }): Promise<{ error?: string; aviso?: string }> {
  const alvo = entrada?.voucherId ? await voucherAoAlcance(entrada.voucherId) : null
  if (!alvo) return { error: 'Voucher não encontrado.' }
  const { ctx, voucher } = alvo
  if (!alcancaUnidade(ctx, entrada.branchId)) return { error: 'Unidade não encontrada.' }
  if (voucher.type !== 'PRODUTO' || !voucher.product_id) return { error: 'Este voucher não é de produto.' }

  const admin = createAdminClient()
  const [bps, prod] = await Promise.all([
    ler(admin.from('branch_product_stock').select('current_stock, min_stock, current_rendimento')
      .eq('product_id', voucher.product_id).eq('branch_id', entrada.branchId).maybeSingle(), 'buscar o saldo do produto'),
    ler(admin.from('products').select('name, unit, units_per_package, consumption_unit, cost_price')
      .eq('id', voucher.product_id).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o produto'),
  ])
  if (!prod) return { error: 'Produto não encontrado.' }
  const upp = prod.units_per_package && prod.consumption_unit ? Number(prod.units_per_package) : null
  // Uma embalagem inteira: em unidades de consumo, se o produto tem.
  const depois = saldoDepoisDaSaida({
    embalagens:           Number(bps?.current_stock ?? 0),
    rendimento:           bps?.current_rendimento != null ? Number(bps.current_rendimento) : null,
    unidadesPorEmbalagem: upp,
  }, upp ?? 1)

  try {
    await gravar(admin.rpc('entregar_voucher_produto', {
      p_tenant: ctx.tenantId!, p_voucher: entrada.voucherId, p_unidade: entrada.branchId,
      p_ator: ctx.internalUserId ?? 'sistema',
      p_dados: {
        quantidade: -1, saldo_apos: depois.embalagens, embalagens: depois.embalagens, rendimento: depois.rendimento,
        custo: prod.cost_price != null ? Number(prod.cost_price) : null, minimo: Number(bps?.min_stock ?? 0),
      },
    }), 'entregar o produto do voucher')
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
  revalidatePath(`/admin/clients/${voucher.client_id}`)
  return depois.embalagens < 0
    ? { aviso: `${prod.name as string}: o estoque da unidade ficou negativo.` }
    : {}
}

/** Vouchers do cliente — para a ficha e para o pagamento. */
export async function vouchersDoClienteAcao(clientId: string): Promise<VoucherDoCliente[]> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'loyalty', 'VIEW')
  const admin = createAdminClient()
  const cliente = await ler(admin.from('clients').select('id').eq('id', clientId).eq('tenant_id', ctx.tenantId!).maybeSingle(),
    'conferir o cliente')
  if (!cliente) return []
  return vouchersDoCliente(clientId, admin)
}
