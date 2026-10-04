import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { notifyUser } from '@/lib/notifications/notify'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Quem a clínica avisa quando o suporte entra numa conta: o próprio membro e
 * quem administra a rede (abrangência de rede com `settings: MANAGE`, ou o
 * cargo de admin da rede, que tem tudo sem linha na matriz).
 */
async function quemAvisar(admin: Admin, tenantId: string, alvoId: string): Promise<string[]> {
  const [cargosAdmin, cargosSettings] = await Promise.all([
    ler(admin.from('tenant_roles').select('id').eq('tenant_id', tenantId).eq('key', 'NETWORK_ADMIN'), 'achar o cargo de admin da rede'),
    ler(admin.from('role_permissions').select('role_id').eq('tenant_id', tenantId).eq('module', 'settings').eq('level', 'MANAGE'),
      'achar quem gerencia as configurações'),
  ])
  const cargos = [...(cargosAdmin ?? []).map(c => c.id as string), ...(cargosSettings ?? []).map(c => c.role_id as string)]
  const admins = cargos.length
    ? await ler(admin.from('users').select('id').eq('tenant_id', tenantId).eq('is_active', true)
        .is('branch_id', null).in('role_id', cargos), 'listar quem administra a rede')
    : []
  return [...new Set([alvoId, ...(admins ?? []).map(u => u.id as string)])]
}

/**
 * Avisa no sino quem administra a rede (a assinatura em atraso, suspensa,
 * reativada; a rede desligada). Acessório: falhar não desfaz o que aconteceu.
 */
export async function avisarQuemAdministraARede(tenantId: string, p: { title: string; body: string; url?: string }): Promise<void> {
  try {
    const admin = createAdminClient()
    const ids = (await quemAvisar(admin, tenantId, '')).filter(Boolean)
    await Promise.allSettled(ids.map(id => notifyUser(admin, id, {
      type: 'assinatura', title: p.title, body: p.body, data: { url: p.url ?? '/admin/settings?tab=assinatura' },
    })))
  } catch (e) {
    console.error('[rede] aviso a quem administra:', e instanceof Error ? e.message : e)
  }
}

/** Avisa no sino que o suporte entrou (ou saiu) da conta de alguém. */
export async function avisarAcessoDoSuporte(tenantId: string, alvo: { id: string; nome: string }, p: {
  atendente: string; motivo: string; entrou: boolean
}): Promise<void> {
  try {
    const admin = createAdminClient()
    const ids = await quemAvisar(admin, tenantId, alvo.id)
    const title = p.entrou ? 'O suporte do BellarisOS entrou numa conta' : 'O suporte do BellarisOS saiu da conta'
    const body = p.entrou
      ? `${p.atendente} entrou na conta de ${alvo.nome}. Motivo: ${p.motivo}`
      : `${p.atendente} saiu da conta de ${alvo.nome}.`
    await Promise.allSettled(ids.map(id => notifyUser(admin, id, {
      type: 'suporte.acesso', title, body, data: { url: '/admin/settings?tab=suporte' },
    })))
  } catch (e) {
    console.error('[suporte] aviso do acesso:', e instanceof Error ? e.message : e)
  }
}
