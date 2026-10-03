import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { ROTULO_DO_REGISTRO, type TipoDeRegistroDaPlataforma } from '@/lib/plataforma/auditoria'

/**
 * O que a CLÍNICA vê do suporte em Configurações → Suporte: quem ela pode
 * autorizar, as autorizações vigentes, cada sessão do suporte na conta de
 * alguém dela (e o que foi feito), e o que a plataforma fez sobre a rede.
 */
export interface DadosDaAbaSuporte {
  membros:       { id: string; nome: string; unidade: string | null; cargo: string | null }[]
  autorizacoes:  { id: string; membro: string; membroId: string; expiraEm: string; clinico: boolean; por: string | null; via: string }[]
  sessoes:       { id: string; atendente: string; membro: string; motivo: string; inicio: string; fim: string | null;
                   status: string; motivoDoFim: string | null; acessos: number; clinico: boolean }[]
  registros:     { id: string; quem: string; oQue: string; em: string }[]
}

export async function dadosDaAbaSuporte(tenantId: string): Promise<DadosDaAbaSuporte> {
  const admin = createAdminClient()
  const agora = new Date().toISOString()
  const [membros, grants, sessoes, registros] = await Promise.all([
    ler(admin.from('users').select('id, name, branches(name), tenant_roles(label)')
      .eq('tenant_id', tenantId).eq('is_active', true).order('name'), 'carregar a equipe'),
    ler(admin.from('support_grants')
      .select('id, target_user_id, expires_at, includes_clinical, via, alvo:users!support_grants_target_user_id_fkey(name), por:users!support_grants_granted_by_user_id_fkey(name)')
      .eq('tenant_id', tenantId).is('revoked_at', null).gt('expires_at', agora).order('expires_at'), 'carregar as autorizações'),
    ler(admin.from('support_sessions')
      .select('id, motivo, started_at, ended_at, status, end_reason, includes_clinical, platform_staff(name), users!support_sessions_target_user_id_fkey(name), support_access_log(count)')
      .eq('tenant_id', tenantId).neq('status', 'abrindo').order('started_at', { ascending: false }).limit(50), 'carregar as sessões do suporte'),
    ler(admin.from('platform_audit_log').select('id, kind, at, platform_staff(name)')
      .eq('tenant_id', tenantId).order('at', { ascending: false }).limit(50), 'carregar o registro da plataforma'),
  ])

  return {
    membros: ((membros ?? []) as unknown as { id: string; name: string; branches: { name: string } | null; tenant_roles: { label: string } | null }[])
      .map(m => ({ id: m.id, nome: m.name, unidade: m.branches?.name ?? null, cargo: m.tenant_roles?.label ?? null })),
    autorizacoes: ((grants ?? []) as unknown as {
      id: string; target_user_id: string; expires_at: string; includes_clinical: boolean; via: string
      alvo: { name: string } | null; por: { name: string } | null
    }[]).map(g => ({
      id: g.id, membro: g.alvo?.name ?? '—', membroId: g.target_user_id, expiraEm: g.expires_at,
      clinico: g.includes_clinical, por: g.por?.name ?? null, via: g.via,
    })),
    sessoes: ((sessoes ?? []) as unknown as {
      id: string; motivo: string; started_at: string; ended_at: string | null; status: string; end_reason: string | null
      includes_clinical: boolean; platform_staff: { name: string } | null; users: { name: string } | null
      support_access_log: { count: number }[] | null
    }[]).map(s => ({
      id: s.id, atendente: s.platform_staff?.name ?? 'Suporte', membro: s.users?.name ?? '—', motivo: s.motivo,
      inicio: s.started_at, fim: s.ended_at, status: s.status, motivoDoFim: s.end_reason,
      acessos: s.support_access_log?.[0]?.count ?? 0, clinico: s.includes_clinical,
    })),
    registros: ((registros ?? []) as unknown as { id: string; kind: TipoDeRegistroDaPlataforma; at: string; platform_staff: { name: string } | null }[])
      .map(r => ({ id: r.id, quem: r.platform_staff?.name ?? 'Suporte', oQue: ROTULO_DO_REGISTRO[r.kind] ?? r.kind, em: r.at })),
  }
}
