import 'server-only'
import type { TenantContext } from '@estetica-os/types'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

type Admin = ReturnType<typeof createAdminClient>

/**
 * O cargo de SISTEMA "Admin da rede" — o que toda rede ganha ao nascer
 * (`seed_tenant_admin_role`): `tenant_roles.key = 'NETWORK_ADMIN'` com
 * `is_system`. Não se edita na tela de Cargos e não se apaga.
 *
 * Por que olhar o CARGO aqui, quando o CLAUDE.md §11 proíbe decidir acesso
 * por nome de cargo (`ctx.role === …`)? Porque a regra do Heitor (2026-10-29)
 * é sobre ESTE cargo, e não sobre um nível de permissão: "somente um admin
 * pode promover alguém a admin" e "somente admin pode alterar admin". Quem tem
 * a Equipe em Gerenciar continua editando a equipe — menos quem tem o cargo
 * de sistema. A conferência é pela chave do cargo de sistema, no banco (o
 * rótulo é só texto), e mora aqui, num lugar só.
 */
export async function cargoEhAdminDaRede(admin: Admin, tenantId: string, roleId: string | null | undefined): Promise<boolean> {
  if (!roleId) return false
  const cargo = await ler(admin.from('tenant_roles').select('key, is_system')
    .eq('id', roleId).eq('tenant_id', tenantId).maybeSingle(), 'conferir o cargo de Admin da rede') as { key: string; is_system: boolean } | null
  return !!cargo?.is_system && cargo.key === 'NETWORK_ADMIN'
}

/** Quem age tem o cargo de sistema Admin da rede? */
export async function souAdminDaRede(admin: Admin, ctx: TenantContext): Promise<boolean> {
  return !!ctx.tenantId && cargoEhAdminDaRede(admin, ctx.tenantId, ctx.roleId)
}

/**
 * A recusa de mexer num membro que é Admin da rede, ou null: só outra Admin
 * da rede altera uma Admin (cargo, "atende", horário, comissão, desativar,
 * reativar) — ou ela mesma, no que já pode (`ehEla`).
 */
export async function recusaDeMexerNaAdmin(
  admin: Admin,
  ctx: TenantContext,
  membro: { id: string; role_id: string | null },
): Promise<string | null> {
  if (!(await cargoEhAdminDaRede(admin, ctx.tenantId!, membro.role_id))) return null
  if (membro.id === ctx.internalUserId) return null
  if (await souAdminDaRede(admin, ctx)) return null
  return 'Só quem é Admin da rede altera uma Admin da rede.'
}
