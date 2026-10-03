import { updateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar } from '@/lib/db'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Reativar um membro: a linha e o login, juntos.
 *
 * O miolo de `reactivateTeamMember` (actions/team.ts), fora de `'use server'`
 * para a plataforma reusar sem virar endpoint. Quem chama confere a rede e
 * emite o evento — a equipe com o próprio contexto, a plataforma com o dela.
 */
export async function reativarMembro(admin: Admin, membro: { id: string; tenantId: string; authId: string | null }): Promise<void> {
  await gravar(admin.from('users').update({ is_active: true })
    .eq('id', membro.id).eq('tenant_id', membro.tenantId), 'reativar o membro')
  if (membro.authId) {
    const { error } = await admin.auth.admin.updateUserById(membro.authId, { ban_duration: 'none' })
    if (error) throw new Error(`Reativado, mas não consegui desbloquear o login: ${error.message}`)
    updateTag(`user:${membro.authId}`)
  }
}
