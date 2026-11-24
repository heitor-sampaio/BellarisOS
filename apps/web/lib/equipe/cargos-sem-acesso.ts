import 'server-only'
import type { TenantContext } from '@estetica-os/types'
import type { createAdminClient } from '@/lib/supabase/admin'
import { lerTodas } from '@/lib/db'
import { abasForaDoPlano, lerRecursos, modulosForaDoPlano } from '@estetica-os/nucleo/lib/planos/recursos'
import { copilotNoPlano } from '@/lib/copilot/disponivel'
import { cargoSemAcesso, ehCargoNaoDefinido, avisoDoMembroSemAcesso, type PlanoDoCargo } from '@/lib/cargos/sem-acesso'

type Admin = ReturnType<typeof createAdminClient>
type Cargo = { id: string; key?: string | null; is_system?: boolean | null }

/**
 * O que o plano da rede tira de um cargo, como o contexto tira (`buildContext`):
 * os módulos fora do plano, as abas de Relatórios fora dele — e o Copilot, que
 * "sem plano" NÃO libera (`lib/copilot/disponivel.ts`; a matriz de Cargos
 * também não o oferece).
 */
export function planoDoCargo(ctx: TenantContext): PlanoDoCargo {
  const recursos = lerRecursos(ctx.plano ?? null)
  return {
    foraDoPlano: [...modulosForaDoPlano(recursos), ...(copilotNoPlano(ctx) ? [] : ['copilot'])],
    abasForaDoPlano: abasForaDoPlano(recursos),
  }
}

/**
 * Os cargos da lista que não abrem módulo nenhum (item 21 dos itens de escopo
 * de 18/11): o "Não definido", e o cargo da rede cuja matriz, com o plano,
 * não deixa nada. O Admin da rede tem tudo e nunca entra.
 */
export async function cargosSemAcesso(admin: Admin, ctx: TenantContext, cargos: readonly Cargo[]): Promise<Set<string>> {
  const semAcesso = new Set<string>()
  const daRede = cargos.filter(c => !c.is_system)
  for (const c of cargos) if (ehCargoNaoDefinido(c)) semAcesso.add(c.id)
  if (!daRede.length || !ctx.tenantId) return semAcesso
  const ids = daRede.map(c => c.id)
  const [linhas, abas] = await Promise.all([
    lerTodas<{ role_id: string; module: string; level: string }>((de, ate) => admin.from('role_permissions')
      .select('role_id, module, level').eq('tenant_id', ctx.tenantId!).in('role_id', ids).neq('level', 'NONE')
      .order('role_id').order('module').range(de, ate), 'ler a matriz dos cargos'),
    lerTodas<{ role_id: string; tab: string }>((de, ate) => admin.from('role_report_tabs')
      .select('role_id, tab').eq('tenant_id', ctx.tenantId!).in('role_id', ids)
      .order('role_id').order('tab').range(de, ate), 'ler as abas de relatórios dos cargos'),
  ])
  const plano = planoDoCargo(ctx)
  for (const id of ids) {
    const doCargo = { linhas: linhas.filter(l => l.role_id === id), abas: abas.filter(a => a.role_id === id).map(a => a.tab) }
    if (cargoSemAcesso(doCargo, plano)) semAcesso.add(id)
  }
  return semAcesso
}

/**
 * O aviso de quem acabou de ser salvo com um cargo que não abre nada — a tela
 * avisa e não recusa (princípio 2). Nulo quando o cargo abre algum módulo.
 */
export async function avisoDoCargoSemAcesso(
  admin: Admin, ctx: TenantContext, cargo: Cargo, atende: boolean,
): Promise<string | null> {
  return (await cargosSemAcesso(admin, ctx, [cargo])).has(cargo.id) ? avisoDoMembroSemAcesso(atende) : null
}
