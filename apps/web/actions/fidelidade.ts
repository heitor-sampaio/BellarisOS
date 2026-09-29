'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission, alcancaUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, mensagemDoErro } from '@/lib/db'
import { EntradaDaConfig, type ConfigFidelidade } from '@/lib/fidelidade/config'
import { configDaRede, saldoDoCliente, extratoDoCliente as lerExtrato, type LinhaDoExtrato } from '@/lib/fidelidade/leitura'

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

  try {
    await gravar(createAdminClient()
      .from('loyalty_configs')
      .upsert({
        tenant_id:       ctx.tenantId!,
        enabled:         c.enabled,
        earn_mode:       c.earn_mode,
        points_per_real: c.points_per_real,
        commission_base: c.commission_base,
        redeem_points_value: c.redeem_points_value,
        redeem_min_points:   c.redeem_min_points,
        redeem_max_pct:      c.redeem_max_pct,
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
