import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { DEFAULT_FUNNEL_NAME, DEFAULT_STAGES, type CRMFunnel, type CRMStage } from '@/lib/crm'
import { ler } from '@/lib/db'

/**
 * As leituras dos funis e etapas por REDE. Moravam em `actions/crm-funnels.ts`
 * e, por estarem num arquivo 'use server', eram endpoints que devolviam (e
 * semeavam) os funis de qualquer rede a quem passasse o id dela (2026-10-06).
 * Quem chama passa `ctx.tenantId` — nunca um id vindo do navegador.
 */

const FUNNEL_COLS = 'id, name, is_default, position, archived_at'
const STAGE_COLS  = 'id, funnel_id, name, color, position, outcome'

/**
 * Funis da rede, criando o primeiro se ainda não houver nenhum.
 *
 * Erro de consulta sobe como exceção de propósito: o `app/error.tsx` mostra
 * falha, enquanto devolver lista vazia viraria "esta rede não tem funil" — que
 * é outra coisa.
 */
export async function seedDefaultFunnel(tenantId: string): Promise<CRMFunnel[]> {
  const admin = createAdminClient()

  const { data: existentes, error } = await admin
    .from('crm_funnels')
    .select(FUNNEL_COLS)
    .eq('tenant_id', tenantId)
    .order('position')

  if (error) throw new Error(`Falha ao carregar os funis: ${error.message}`)
  if (existentes && existentes.length > 0) return existentes as CRMFunnel[]

  const { data: funil, error: erroFunil } = await admin
    .from('crm_funnels')
    .insert({ tenant_id: tenantId, name: DEFAULT_FUNNEL_NAME, is_default: true, position: 0 })
    .select(FUNNEL_COLS)
    .single()

  // Dois primeiros acessos simultâneos: o índice único parcial de padrão por
  // rede derruba o segundo insert. Nesse caso o funil do vencedor já existe.
  if (erroFunil) {
    const recarregado = await ler(admin
      .from('crm_funnels')
      .select(FUNNEL_COLS)
      .eq('tenant_id', tenantId)
      .order('position'), 'carregar os funis')
    if (recarregado && recarregado.length > 0) return recarregado as CRMFunnel[]
    throw new Error(`Falha ao criar o funil padrão: ${erroFunil.message}`)
  }

  const { error: erroEtapas } = await admin.from('crm_stages').insert(
    DEFAULT_STAGES.map((s, i) => ({
      tenant_id: tenantId, funnel_id: funil!.id,
      name: s.name, color: s.color, position: i, outcome: s.outcome,
    })),
  )
  if (erroEtapas) throw new Error(`Falha ao criar as etapas padrão: ${erroEtapas.message}`)

  return [funil as CRMFunnel]
}

/** Etapas de um funil, na ordem do quadro. */
export async function listStages(tenantId: string, funnelId: string): Promise<CRMStage[]> {
  const { data, error } = await createAdminClient()
    .from('crm_stages')
    .select(STAGE_COLS)
    .eq('tenant_id', tenantId)
    .eq('funnel_id', funnelId)
    .order('position')

  if (error) throw new Error(`Falha ao carregar as etapas: ${error.message}`)
  return (data ?? []) as CRMStage[]
}

/** Todas as etapas da rede — usada pelo seletor que move o lead entre funis. */
export async function listAllStages(tenantId: string): Promise<CRMStage[]> {
  const { data, error } = await createAdminClient()
    .from('crm_stages')
    .select(STAGE_COLS)
    .eq('tenant_id', tenantId)
    .order('position')

  if (error) throw new Error(`Falha ao carregar as etapas: ${error.message}`)
  return (data ?? []) as CRMStage[]
}
