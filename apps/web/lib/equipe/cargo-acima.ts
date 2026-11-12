import 'server-only'
import type { TenantContext, AppModule, PermissionLevel, ReportTab } from '@estetica-os/types'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { MODULE_LABELS, isScoped } from '@/lib/permissions'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Ninguém dá um cargo com MAIS acesso que o próprio (C62 do levantamento das
 * regras, F70; H7 = b, o Heitor). A gerente com a Equipe em Gerenciar dava à
 * recepcionista o cargo de quem tem o Financeiro inteiro — que ela mesma não
 * tem. A Admin da rede dá qualquer cargo (ela tem tudo).
 *
 * "Mais" é, em algum módulo: um nível acima do dela (Sem acesso < Ver <
 * Gerenciar), o "todos" onde ela tem "só os meus", ou uma aba de Relatórios
 * que ela não vê.
 */
export const DICA_DO_CARGO_ACIMA = 'Só quem tem esses módulos pode dar este cargo.'

const ORDEM: Record<PermissionLevel, number> = { NONE: 0, VIEW: 1, MANAGE: 2 }

export interface LinhaDoCargo { module: string; level: PermissionLevel; scope: 'OWN' | 'ALL' }

/** Os módulos em que o cargo passa do que `ctx` tem (vazio = não passa). Puro. */
export function modulosAcimaDoMeu(
  ctx: Pick<TenantContext, 'permissions' | 'scopes' | 'reportTabs'>,
  linhas: LinhaDoCargo[], abas: string[],
): string[] {
  const acima = new Set<string>()
  for (const l of linhas) {
    const m = l.module as AppModule
    const meu = (ctx.permissions?.[m] ?? 'NONE') as PermissionLevel
    if (ORDEM[l.level] > ORDEM[meu]) { acima.add(MODULE_LABELS[m] ?? m); continue }
    if (l.level !== 'NONE' && isScoped(m) && l.scope === 'ALL' && ctx.scopes?.[m as keyof typeof ctx.scopes] === 'OWN') {
      acima.add(MODULE_LABELS[m] ?? m)
    }
  }
  const relatorios = linhas.find(l => l.module === 'reports')
  if (relatorios && relatorios.level !== 'NONE' && abas.some(a => !(ctx.reportTabs ?? []).includes(a as ReportTab))) {
    acima.add(MODULE_LABELS.reports)
  }
  return [...acima]
}

/** Os cargos da rede que passam do de quem age: id → os módulos a mais. A Admin da rede: nenhum. */
export async function cargosAcimaDoMeu(
  admin: Admin, ctx: TenantContext, roleIds: string[], ehAdmin: boolean,
): Promise<Map<string, string[]>> {
  const acima = new Map<string, string[]>()
  if (ehAdmin || !roleIds.length) return acima
  const [linhas, abas] = await Promise.all([
    ler(admin.from('role_permissions').select('role_id, module, level, scope')
      .eq('tenant_id', ctx.tenantId!).in('role_id', roleIds), 'ler a matriz dos cargos') as Promise<(LinhaDoCargo & { role_id: string })[] | null>,
    ler(admin.from('role_report_tabs').select('role_id, tab')
      .eq('tenant_id', ctx.tenantId!).in('role_id', roleIds), 'ler as abas de relatórios dos cargos') as Promise<{ role_id: string; tab: string }[] | null>,
  ])
  for (const id of roleIds) {
    const mods = modulosAcimaDoMeu(ctx, (linhas ?? []).filter(l => l.role_id === id), (abas ?? []).filter(a => a.role_id === id).map(a => a.tab))
    if (mods.length) acima.set(id, mods)
  }
  return acima
}

/** A recusa da action: o cargo passa do de quem age. */
export function recusaDoCargoAcima(rotulo: string, modulos: string[]): string {
  return `O cargo ${rotulo} tem módulos que você não tem (${modulos.join(', ')}). ${DICA_DO_CARGO_ACIMA}`
}
