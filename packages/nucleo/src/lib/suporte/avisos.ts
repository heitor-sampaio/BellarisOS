import { createAdminClient } from '../supabase/admin'
import { ler } from '../db'
import { notifyUser } from '../notifications/notify'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Quem a rede avisa (a assinatura; o suporte entrando numa conta): o próprio
 * membro e a Admin da rede — o cargo de SISTEMA (`tenant_roles.key =
 * 'NETWORK_ADMIN'` com `is_system`). A conta com o BellarisOS é só dela (o
 * Heitor, 18/11: a configuração da rede toda é "só pela conta admin"); era
 * também quem tinha "A rede inteira" com Configurações em Gerenciar.
 */
async function quemAvisar(admin: Admin, tenantId: string, alvoId: string): Promise<string[]> {
  const cargos = ((await ler(admin.from('tenant_roles').select('id').eq('tenant_id', tenantId)
    .eq('key', 'NETWORK_ADMIN').eq('is_system', true), 'achar o cargo de Admin da rede')) ?? []).map(c => c.id as string)
  const admins = cargos.length
    ? await ler(admin.from('users').select('id').eq('tenant_id', tenantId).eq('is_active', true)
        .in('role_id', cargos), 'listar as Admins da rede')
    : []
  return [...new Set([alvoId, ...(admins ?? []).map(u => u.id as string)])]
}

/**
 * Avisa no sino a Admin da rede (a assinatura em atraso, suspensa,
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
