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
 * `loyalty_accounts.balance`, que deixou de ser escrito.
 */

export async function configDaRede(tenantId: string, admin: Admin = createAdminClient()): Promise<ConfigFidelidade> {
  const linha = await ler(admin
    .from('loyalty_configs')
    .select('enabled, earn_mode, points_per_real, redeem_points_value, redeem_min_points, redeem_max_pct, expiry_months, scope_per_branch, commission_base')
    .eq('tenant_id', tenantId)
    .maybeSingle(), 'ler a configuração da fidelidade')
  return configDaLinha(linha as Record<string, unknown> | null)
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
  const [saldo, extrato] = await Promise.all([
    saldoDoCliente(clientId, null, admin),
    extratoDoCliente(clientId, {}, admin),
  ])
  return { saldo, valorDoPonto: cfg.redeem_points_value, extrato, podeAjustar: can(ctx, 'loyalty', 'MANAGE') }
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
