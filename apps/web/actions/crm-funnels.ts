'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  DEFAULT_FUNNEL_NAME, DEFAULT_STAGES, NEW_FUNNEL_STAGES,
  type CRMFunnel, type CRMStage,
} from '@/lib/crm'

const FUNNEL_COLS = 'id, name, is_default, position, archived_at'
const STAGE_COLS  = 'id, funnel_id, name, color, position, outcome'

/** O portal da rede passa este sentinela no lugar do slug de uma unidade. */
const ADMIN_SLUG = '__admin__'

function revalidarCRM(slug?: string | null) {
  if (slug && slug !== ADMIN_SLUG) revalidatePath(`/${slug}/crm`)
  revalidatePath('/admin/crm')
}

type Resultado = { error?: string; success?: boolean }

// --- Leitura -----------------------------------------------------

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
    const { data: recarregado } = await admin
      .from('crm_funnels')
      .select(FUNNEL_COLS)
      .eq('tenant_id', tenantId)
      .order('position')
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

// --- Criar -------------------------------------------------------

export async function createFunnel(
  _prev: Resultado | undefined,
  formData: FormData,
): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'crm', 'MANAGE')

    const name = (formData.get('name') as string)?.trim()
    const slug = (formData.get('_slug') as string)?.trim() ?? ''
    if (!name) return { error: 'Dê um nome ao funil.' }

    const admin = createAdminClient()

    const { data: ultimo } = await admin
      .from('crm_funnels')
      .select('position')
      .eq('tenant_id', ctx.tenantId!)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: funil, error } = await admin
      .from('crm_funnels')
      .insert({
        tenant_id:  ctx.tenantId!,
        name,
        position:   ultimo ? (ultimo.position as number) + 1 : 0,
        // Padrão só o primeiro. Trocar é uma ação explícita no modal.
        is_default: false,
      })
      .select('id')
      .single()

    if (error || !funil) return { error: `Erro ao criar o funil: ${error?.message ?? 'desconhecido'}` }

    const { error: erroEtapas } = await admin.from('crm_stages').insert(
      NEW_FUNNEL_STAGES.map((s, i) => ({
        tenant_id: ctx.tenantId!, funnel_id: funil.id,
        name: s.name, color: s.color, position: i, outcome: s.outcome,
      })),
    )
    if (erroEtapas) return { error: `Funil criado, mas as etapas falharam: ${erroEtapas.message}` }

    revalidarCRM(slug)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

// --- Editar ------------------------------------------------------

export async function renameFunnel(funnelId: string, name: string, slug: string) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'crm', 'MANAGE')
    if (!name.trim()) return

    const { error } = await createAdminClient()
      .from('crm_funnels')
      .update({ name: name.trim() })
      .eq('id', funnelId)
      .eq('tenant_id', ctx.tenantId!)

    if (error) { console.error('[renameFunnel]', error.message); return }
    revalidarCRM(slug)
  } catch (e) {
    console.error('[renameFunnel]', e)
  }
}

/**
 * Define o funil padrão da rede: é onde caem os leads que chegam sozinhos pelo
 * WhatsApp e a base do gráfico de funil do dashboard.
 */
export async function setDefaultFunnel(funnelId: string, slug: string): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'crm', 'MANAGE')

    const admin = createAdminClient()

    // Limpar antes de marcar: o índice único parcial só admite um padrão por
    // rede, então a ordem inversa bateria em violação de unicidade.
    const { error: erroLimpar } = await admin
      .from('crm_funnels')
      .update({ is_default: false })
      .eq('tenant_id', ctx.tenantId!)
      .eq('is_default', true)
    if (erroLimpar) return { error: `Erro ao trocar o padrão: ${erroLimpar.message}` }

    const { error } = await admin
      .from('crm_funnels')
      .update({ is_default: true, archived_at: null })
      .eq('id', funnelId)
      .eq('tenant_id', ctx.tenantId!)
    if (error) return { error: `Erro ao trocar o padrão: ${error.message}` }

    revalidarCRM(slug)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

export async function setFunnelArchived(
  funnelId: string, archived: boolean, slug: string,
): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'crm', 'MANAGE')

    const admin = createAdminClient()

    if (archived) {
      const { data: funil, error: erroLeitura } = await admin
        .from('crm_funnels')
        .select('is_default')
        .eq('id', funnelId)
        .eq('tenant_id', ctx.tenantId!)
        .single()
      if (erroLeitura) return { error: `Erro ao arquivar: ${erroLeitura.message}` }
      if (funil?.is_default) {
        return { error: 'Este é o funil padrão. Escolha outro como padrão antes de arquivar.' }
      }
    }

    const { error } = await admin
      .from('crm_funnels')
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq('id', funnelId)
      .eq('tenant_id', ctx.tenantId!)
    if (error) return { error: `Erro ao arquivar: ${error.message}` }

    revalidarCRM(slug)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

// --- Excluir -----------------------------------------------------

/**
 * Exclui um funil vazio.
 *
 * ⚠️ Com lead dentro, excluir seria perda silenciosa: `crm_stages.funnel_id` é
 * `ON DELETE CASCADE` e `leads.crm_stage_id` é `ON DELETE SET NULL` — as etapas
 * sumiriam, os leads ficariam sem etapa e desapareceriam de todos os quadros
 * sem nenhum aviso. Por isso o caminho para um funil em uso é arquivar.
 */
export async function deleteFunnel(funnelId: string, slug: string): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'crm', 'MANAGE')

    const admin = createAdminClient()

    const { data: funil, error: erroLeitura } = await admin
      .from('crm_funnels')
      .select('is_default')
      .eq('id', funnelId)
      .eq('tenant_id', ctx.tenantId!)
      .single()
    if (erroLeitura) return { error: `Erro ao excluir: ${erroLeitura.message}` }
    if (funil?.is_default) {
      return { error: 'Este é o funil padrão. Escolha outro como padrão antes de excluir.' }
    }

    const { count: totalFunis, error: erroContagem } = await admin
      .from('crm_funnels')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId!)
    if (erroContagem) return { error: `Erro ao excluir: ${erroContagem.message}` }
    if ((totalFunis ?? 0) <= 1) return { error: 'A rede precisa de pelo menos um funil.' }

    const { data: etapas, error: erroEtapas } = await admin
      .from('crm_stages')
      .select('id')
      .eq('tenant_id', ctx.tenantId!)
      .eq('funnel_id', funnelId)
    if (erroEtapas) return { error: `Erro ao excluir: ${erroEtapas.message}` }

    const ids = (etapas ?? []).map(e => e.id as string)
    if (ids.length > 0) {
      const { count, error: erroLeads } = await admin
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', ctx.tenantId!)
        .in('crm_stage_id', ids)
      if (erroLeads) return { error: `Erro ao excluir: ${erroLeads.message}` }
      if ((count ?? 0) > 0) {
        return {
          error: `Este funil tem ${count} lead(s). Mova-os para outro funil ou arquive este.`,
        }
      }
    }

    const { error } = await admin
      .from('crm_funnels')
      .delete()
      .eq('id', funnelId)
      .eq('tenant_id', ctx.tenantId!)
    if (error) return { error: `Erro ao excluir: ${error.message}` }

    revalidarCRM(slug)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

// --- Reordenar ---------------------------------------------------

export async function reorderFunnels(orderedIds: string[], slug: string) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'crm', 'MANAGE')

    const admin = createAdminClient()
    await Promise.all(
      orderedIds.map((id, idx) =>
        admin
          .from('crm_funnels')
          .update({ position: idx })
          .eq('id', id)
          .eq('tenant_id', ctx.tenantId!),
      ),
    )

    revalidarCRM(slug)
  } catch (e) {
    console.error('[reorderFunnels]', e)
  }
}
