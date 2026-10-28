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
 * A criação é UMA transação, no banco (`crm_funil_padrao`, 2026-10-27): a
 * rede fica travada, o funil e as etapas nascem juntos, e o primeiro acesso
 * de vários ao mesmo tempo (quadro, dashboard, inbox) não bate mais no índice
 * `uq_crm_funnels_default` nem deixa funil sem etapa. A leitura comum (a
 * rede já tem funil) não passa pela trava.
 *
 * Erro de consulta sobe como exceção de propósito: o `app/error.tsx` mostra
 * falha, enquanto devolver lista vazia viraria "esta rede não tem funil" — que
 * é outra coisa.
 */
export async function seedDefaultFunnel(tenantId: string): Promise<CRMFunnel[]> {
  const admin = createAdminClient()

  const existentes = await ler(admin
    .from('crm_funnels')
    .select(FUNNEL_COLS)
    .eq('tenant_id', tenantId)
    .order('position'), 'carregar os funis')
  if (existentes && existentes.length > 0) return existentes as CRMFunnel[]

  const funis = await ler(admin.rpc('crm_funil_padrao', {
    p_tenant: tenantId,
    p_nome:   DEFAULT_FUNNEL_NAME,
    p_etapas: DEFAULT_STAGES.map((s, i) => ({ name: s.name, color: s.color, position: i, outcome: s.outcome, marca: s.marca ?? null })),
  }).select(FUNNEL_COLS), 'criar o funil padrão')
  return (funis ?? []) as CRMFunnel[]
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
