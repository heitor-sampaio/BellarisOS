import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import type { Referencias } from './normalizar'

type Admin = ReturnType<typeof createAdminClient>

/**
 * As listas da REDE que a linha cita por nome (2026-10-13): unidades ativas,
 * etapas do funil da etapa escolhida, a equipe ativa e os procedimentos
 * ativos. O servidor monta as suas — as da tela servem só à prévia.
 */
export async function referenciasDaRede(
  admin: Admin, tenantId: string,
  quais: { unidades?: boolean; etapaId?: string | null; membros?: boolean; procedimentos?: boolean },
): Promise<Referencias> {
  const refs: Referencias = {}
  await Promise.all([
    quais.unidades && ler(admin.from('branches').select('id, name').eq('tenant_id', tenantId).eq('is_active', true),
      'listar as unidades').then(l => { refs.unidades = ((l ?? []) as { id: string; name: string }[]).map(b => ({ id: b.id, nome: b.name })) }),
    quais.membros && ler(admin.from('users').select('id, name, email').eq('tenant_id', tenantId).eq('is_active', true),
      'listar a equipe').then(l => {
      refs.membros = ((l ?? []) as { id: string; name: string | null; email: string | null }[])
        .map(m => ({ id: m.id, nome: m.name ?? '', email: m.email }))
    }),
    quais.procedimentos && ler(admin.from('procedures').select('id, name').eq('tenant_id', tenantId).eq('is_active', true),
      'listar os procedimentos').then(l => { refs.procedimentos = ((l ?? []) as { id: string; name: string }[]).map(x => ({ id: x.id, nome: x.name })) }),
    quais.etapaId && (async () => {
      const etapa = await ler(admin.from('crm_stages').select('funnel_id').eq('id', quais.etapaId!).eq('tenant_id', tenantId).maybeSingle(), 'buscar a etapa')
      if (!etapa) { refs.etapas = []; return }
      const doFunil = await ler(admin.from('crm_stages').select('id, name').eq('tenant_id', tenantId)
        .eq('funnel_id', etapa.funnel_id as string), 'listar as etapas do funil') as { id: string; name: string }[] | null
      refs.etapas = (doFunil ?? []).map(e => ({ id: e.id, nome: e.name }))
    })(),
  ])
  return refs
}
