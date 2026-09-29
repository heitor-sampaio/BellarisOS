import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { can } from '@/lib/auth'
import type { TenantContext } from '@estetica-os/types'
import { configDaLinha, type ConfigFidelidade } from './config'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Leituras da fidelidade no servidor. Quem chama já conferiu a permissão e a
 * rede do cliente — aqui só se lê.
 *
 * O SALDO é sempre a soma do extrato (`saldo_de_pontos`), nunca
 * `loyalty_accounts.balance`, que saiu do banco na fase 4 (2026-09-29).
 */

export async function configDaRede(tenantId: string, admin: Admin = createAdminClient()): Promise<ConfigFidelidade> {
  const linha = await ler(admin
    .from('loyalty_configs')
    .select('enabled, earn_mode, points_per_real, redeem_points_value, redeem_min_points, redeem_max_pct, expiry_months, scope_per_branch, birthday_bonus, first_access_bonus, client_redeem, expiry_notice_days')
    .eq('tenant_id', tenantId)
    .maybeSingle(), 'ler a configuração da fidelidade')
  return configDaLinha(linha as Record<string, unknown> | null)
}

/** Quantos pontos do cliente vencem nos próximos `dias` (validade, fase 4). */
export async function pontosVencendo(clientId: string, dias = 30, unidade: string | null = null, admin: Admin = createAdminClient()): Promise<number> {
  const ate = new Date(Date.now() + dias * 86_400_000).toISOString()
  const n = await ler(admin.rpc('pontos_expirando', { p_cliente: clientId, p_unidade: unidade, p_ate: ate }), 'ler os pontos a vencer')
  return Number(n ?? 0)
}

/** O saldo de cada unidade, com o nome — abrangência por unidade. */
export async function saldosPorUnidade(clientId: string, admin: Admin = createAdminClient()): Promise<{ branch_id: string; nome: string; saldo: number }[]> {
  const linhas = await ler(admin.rpc('saldos_por_unidade', { p_cliente: clientId }), 'ler o saldo por unidade') as { branch_id: string; saldo: number }[] | null
  if (!linhas?.length) return []
  const unidades = await ler(admin.from('branches').select('id, name').in('id', linhas.map(l => l.branch_id)), 'buscar as unidades')
  const nomes = new Map(((unidades ?? []) as { id: string; name: string }[]).map(u => [u.id, u.name]))
  return linhas.map(l => ({ branch_id: l.branch_id, nome: nomes.get(l.branch_id) ?? 'Unidade', saldo: Number(l.saldo) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** A rede já tem algum ponto lançado? (trava a troca de abrangência) */
export async function redeTemLancamentos(tenantId: string, admin: Admin = createAdminClient()): Promise<boolean> {
  const linhas = await ler(admin.from('loyalty_transactions')
    .select('id, branches!inner(tenant_id)')
    .eq('branches.tenant_id', tenantId)
    .limit(1), 'conferir se a rede tem pontos lançados')
  return (linhas ?? []).length > 0
}

/** Saldo do cliente — da rede inteira, ou de uma unidade (abrangência por unidade). */
export async function saldoDoCliente(clientId: string, branchId: string | null = null, admin: Admin = createAdminClient()): Promise<number> {
  const saldo = await ler(admin.rpc('saldo_de_pontos', { p_cliente: clientId, p_unidade: branchId }), 'ler o saldo de pontos')
  return Number(saldo ?? 0)
}

export interface LinhaDoExtrato {
  id:          string
  kind:        string
  points:      number
  description: string
  created_at:  string
  expires_at:  string | null
  created_by:  string | null
  branch_name: string | null
  /** Quem lançou (ajuste da equipe); nulo quando foi o sistema. */
  autor:       string | null
}

/** O que a ficha do cliente mostra da fidelidade. */
export interface FidelidadeDoPerfil {
  saldo:        number
  valorDoPonto: number
  extrato:      { linhas: LinhaDoExtrato[]; temMais: boolean }
  podeAjustar:  boolean
  vouchers:     VoucherDoCliente[]
  /** O catálogo ativo — para trocar pontos por recompensa. */
  recompensas:  Recompensa[]
  /** Pontos que vencem nos próximos 30 dias (0 sem validade). */
  vencendo:     number
  /** Abrangência por unidade: o saldo de cada uma. Nulo = saldo único da rede. */
  porUnidade:   { branch_id: string; nome: string; saldo: number }[] | null
}

export interface Recompensa {
  id:             string
  name:           string
  description:    string | null
  type:           string
  points_cost:    number
  procedure_id:   string | null
  product_id:     string | null
  discount_value: number | null
  validity_days:  number
  is_active:      boolean
}

export interface VoucherDoCliente {
  id:             string
  name:           string
  type:           string
  status:         string
  expires_at:     string
  used_at:        string | null
  points_cost:    number
  procedure_id:   string | null
  product_id:     string | null
  discount_value: number | null
  branch_id:      string
  cancel_reason:  string | null
  created_at:     string
}

/** O catálogo da rede. `somenteAtivas` para a troca; a tela de configuração vê tudo. */
export async function recompensasDaRede(tenantId: string, somenteAtivas: boolean, admin: Admin = createAdminClient()): Promise<Recompensa[]> {
  let q = admin.from('loyalty_rewards')
    .select('id, name, description, type, points_cost, procedure_id, product_id, discount_value, validity_days, is_active')
    .eq('tenant_id', tenantId)
  if (somenteAtivas) q = q.eq('is_active', true)
  const dados = await ler(q.order('points_cost').order('name'), 'ler o catálogo de recompensas')
  return ((dados ?? []) as Recompensa[]).map(r => ({ ...r, points_cost: Number(r.points_cost), discount_value: r.discount_value == null ? null : Number(r.discount_value) }))
}

/** Os vouchers do cliente, os mais novos primeiro. */
export async function vouchersDoCliente(clientId: string, admin: Admin = createAdminClient()): Promise<VoucherDoCliente[]> {
  const dados = await ler(admin.from('loyalty_vouchers')
    .select('id, name, type, status, expires_at, used_at, points_cost, procedure_id, product_id, discount_value, branch_id, cancel_reason, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(100), 'ler os vouchers do cliente')
  return ((dados ?? []) as VoucherDoCliente[]).map(v => ({ ...v, points_cost: Number(v.points_cost), discount_value: v.discount_value == null ? null : Number(v.discount_value) }))
}

/**
 * A fidelidade na ficha do cliente — ou nulo, e aí a ficha não mostra nada de
 * pontos: programa desligado na rede, ou cargo sem o módulo.
 */
export async function fidelidadeDoPerfil(ctx: TenantContext, clientId: string): Promise<FidelidadeDoPerfil | null> {
  if (!can(ctx, 'loyalty', 'VIEW')) return null
  const admin = createAdminClient()
  const cfg = await configDaRede(ctx.tenantId!, admin)
  if (!cfg.enabled) return null
  const [saldo, extrato, vouchers, recompensas, vencendo, porUnidade] = await Promise.all([
    saldoDoCliente(clientId, null, admin),
    extratoDoCliente(clientId, {}, admin),
    vouchersDoCliente(clientId, admin),
    recompensasDaRede(ctx.tenantId!, true, admin),
    cfg.expiry_months ? pontosVencendo(clientId, 30, null, admin) : Promise.resolve(0),
    cfg.scope_per_branch ? saldosPorUnidade(clientId, admin) : Promise.resolve(null),
  ])
  return { saldo, valorDoPonto: cfg.redeem_points_value, extrato, podeAjustar: can(ctx, 'loyalty', 'MANAGE'), vouchers, recompensas, vencendo, porUnidade }
}

/** O extrato, do mais recente para o mais antigo, em páginas. */
export async function extratoDoCliente(
  clientId: string,
  opcoes: { antes?: string | null; limite?: number } = {},
  admin: Admin = createAdminClient(),
): Promise<{ linhas: LinhaDoExtrato[]; temMais: boolean }> {
  const limite = Math.max(1, Math.min(opcoes.limite ?? 30, 100))
  const conta = await ler(admin.from('loyalty_accounts').select('id').eq('client_id', clientId).maybeSingle(),
    'buscar a conta de pontos')
  if (!conta) return { linhas: [], temMais: false }

  let q = admin
    .from('loyalty_transactions')
    .select('id, kind, points, description, created_at, expires_at, created_by, branches(name)')
    .eq('loyalty_account_id', (conta as { id: string }).id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limite + 1)
  if (opcoes.antes) q = q.lt('created_at', opcoes.antes)

  const dados = await ler(q, 'ler o extrato de pontos')
  const brutas = ((dados ?? []) as unknown as (Omit<LinhaDoExtrato, 'branch_name' | 'autor'> & { branches: { name: string } | null })[])

  // `created_by` guarda o id do membro (como no resto do sistema); o nome
  // resolve-se aqui, para o extrato dizer QUEM ajustou.
  const ids = [...new Set(brutas.map(l => l.created_by).filter((v): v is string => !!v && /^[0-9a-f-]{36}$/i.test(v)))]
  const nomes = new Map<string, string>()
  if (ids.length) {
    const us = await ler(admin.from('users').select('id, name').in('id', ids), 'buscar os autores do extrato')
    for (const u of (us ?? []) as { id: string; name: string }[]) nomes.set(u.id, u.name)
  }

  const linhas = brutas.map(({ branches, ...l }) => ({
    ...l,
    points:      Number(l.points),
    branch_name: branches?.name ?? null,
    autor:       l.created_by === 'sistema' || !l.created_by ? null : nomes.get(l.created_by) ?? null,
  }))
  return { linhas: linhas.slice(0, limite), temMais: linhas.length > limite }
}
