import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerTodas } from '@/lib/db'
import { podemOcuparDesde } from '@/lib/appointments/core'
import { STATUS_EM_ABERTO } from '@/lib/agenda/em-andamento'
import { paraOEmAndamento, type EmAndamentoNaTela, type LinhaDoEmAndamento } from '@/lib/agenda/em-andamento-da-equipe'

/**
 * O que está em andamento AGORA nas unidades pedidas (o Heitor, 25/11 — o
 * painel da unidade, o da rede, a Agenda e a Minha agenda). Quem chama decide
 * as unidades pela abrangência (as da tela, já conferidas) e passa a vista
 * pessoal em `profissional` (só os dela); a permissão da Agenda é da tela.
 *
 * De qualquer duração (`podemOcuparDesde`): o de 30 horas que começou ontem
 * entra. Já começado (`scheduled_at <= agora`) e em aberto; o fim, a regra
 * única confere (`emAndamento`, por `paraOEmAndamento`). Em páginas: nada se
 * corta calado.
 */
export async function lerEmAndamento({ tenantId, unidades, profissional = null, agora = new Date() }: {
  tenantId: string
  unidades: readonly string[]
  profissional?: string | null
  agora?: Date
}): Promise<EmAndamentoNaTela[]> {
  if (unidades.length === 0) return []
  const linhas = (await lerTodas((de, ate) => {
    let q = createAdminClient().from('appointments')
      .select('id, status, scheduled_at, duration_min, clients(name), procedures(name), users!appointments_professional_id_fkey(name), rooms(name), branches!inner(name, fuso, tenant_id)')
      .in('branch_id', [...unidades])
      .eq('branches.tenant_id', tenantId)
      .in('status', [...STATUS_EM_ABERTO])
      .or(podemOcuparDesde(agora.getTime()))
      .lte('scheduled_at', agora.toISOString())
    if (profissional) q = q.eq('professional_id', profissional)
    return q.order('scheduled_at').order('id').range(de, ate)
  }, 'carregar o que está em andamento')) as unknown as LinhaDoEmAndamento[]
  return paraOEmAndamento(linhas, agora)
}
