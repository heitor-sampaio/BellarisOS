'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission, assertRecurso } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { NEW_FUNNEL_STAGES } from '@/lib/crm'
import { gravar, ler } from '@/lib/db'

/**
 * Revalida o quadro nos dois portais.
 *
 * `slug` é a unidade de onde veio a ação — vazio quando veio da rede, que não
 * tem unidade corrente. Não existe mais sentinela: sem slug, só o caminho da
 * rede é revalidado.
 */
function revalidarCRM(slug?: string | null) {
  if (slug) revalidatePath(`/${slug}/oportunidades`)
  revalidatePath('/admin/oportunidades')
}

type Resultado = { error?: string; success?: boolean }

// As leituras (seedDefaultFunnel, listStages, listAllStages) moram em
// lib/crm/funis.ts: aqui, recebendo a rede por parâmetro, eram endpoints.

// --- Criar -------------------------------------------------------

export async function createFunnel(
  _prev: Resultado | undefined,
  formData: FormData,
): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertRecurso(ctx, 'oportunidades')
    assertPermission(ctx, 'crm', 'MANAGE')

    const name = (formData.get('name') as string)?.trim()
    const slug = (formData.get('_slug') as string)?.trim() ?? ''
    if (!name) return { error: 'Dê um nome ao funil.' }

    const admin = createAdminClient()

    const ultimo = await ler(admin
      .from('crm_funnels')
      .select('position')
      .eq('tenant_id', ctx.tenantId!)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle(), 'buscar o funil')

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
    assertRecurso(ctx, 'oportunidades')
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
    assertRecurso(ctx, 'oportunidades')
    assertPermission(ctx, 'crm', 'MANAGE')

    const admin = createAdminClient()

    // O funil tem de ser DA REDE — e isso é conferido ANTES de limpar o padrão.
    // Com um id alheio, o passo de baixo tirava o padrão de todos os funis e o
    // de marcar não atingia linha nenhuma: a rede ficava sem funil padrão, e
    // bastava um id qualquer.
    const funil = await ler(admin
      .from('crm_funnels').select('id')
      .eq('id', funnelId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o funil')
    if (!funil) return { error: 'Funil não encontrado.' }

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
    assertRecurso(ctx, 'oportunidades')
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
    assertRecurso(ctx, 'oportunidades')
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
    assertRecurso(ctx, 'oportunidades')
    assertPermission(ctx, 'crm', 'MANAGE')

    const admin = createAdminClient()
    // Cada update olhado: com o erro descartado, a ordem nova "salvava" e a
    // tela voltava à antiga no próximo carregamento, sem aviso.
    await Promise.all(
      orderedIds.map((id, idx) =>
        gravar(admin
          .from('crm_funnels')
          .update({ position: idx })
          .eq('id', id)
          .eq('tenant_id', ctx.tenantId!), 'reordenar os funis'),
      ),
    )

    revalidarCRM(slug)
  } catch (e) {
    console.error('[reorderFunnels]', e)
  }
}
