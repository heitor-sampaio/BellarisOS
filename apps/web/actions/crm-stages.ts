'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { isStageOutcome, type StageOutcome } from '@/lib/crm'
import { ler } from '@/lib/db'

// Os tipos e o seed dos funis vivem em `lib/crm.ts` e `actions/crm-funnels.ts`:
// arquivo `'use server'` só exporta função assíncrona.

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

// --- Criar etapa -------------------------------------------------
export async function createStage(
  _prev: Resultado | undefined,
  formData: FormData,
): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'crm', 'MANAGE')

    const name     = (formData.get('name')       as string)?.trim()
    const color    = (formData.get('color')      as string)?.trim() || '#c34d6b'
    const funnelId = (formData.get('_funnelId')  as string)?.trim()
    const slug     = (formData.get('_slug')      as string)?.trim() ?? ''
    const outcome  = (formData.get('outcome')    as string)?.trim() ?? 'OPEN'

    if (!name)     return { error: 'Nome da etapa é obrigatório.' }
    if (!funnelId) return { error: 'Funil não identificado.' }

    const admin = createAdminClient()

    // Posição é por funil: contar no tenant inteiro jogaria a etapa nova para o
    // fim de uma numeração que não é a deste quadro.
    const ultima = await ler(admin
      .from('crm_stages')
      .select('position')
      .eq('tenant_id', ctx.tenantId!)
      .eq('funnel_id', funnelId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle(), 'buscar a etapa')

    const { error } = await admin.from('crm_stages').insert({
      tenant_id: ctx.tenantId!,
      funnel_id: funnelId,
      name, color,
      position:  ultima ? (ultima.position as number) + 1 : 0,
      outcome:   isStageOutcome(outcome) ? outcome : 'OPEN',
    })

    if (error) return { error: `Erro ao criar etapa: ${error.message}` }

    revalidarCRM(slug)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

// --- Renomear ----------------------------------------------------
export async function renameStage(stageId: string, name: string, slug: string) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'crm', 'MANAGE')
    if (!name.trim()) return

    const { error } = await createAdminClient()
      .from('crm_stages')
      .update({ name: name.trim() })
      .eq('id', stageId)
      .eq('tenant_id', ctx.tenantId!)

    if (error) { console.error('[renameStage]', error.message); return }
    revalidarCRM(slug)
  } catch (e) {
    console.error('[renameStage]', e)
  }
}

// --- Mudar cor ---------------------------------------------------
export async function updateStageColor(stageId: string, color: string, slug: string) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'crm', 'MANAGE')

    const { error } = await createAdminClient()
      .from('crm_stages')
      .update({ color })
      .eq('id', stageId)
      .eq('tenant_id', ctx.tenantId!)

    if (error) { console.error('[updateStageColor]', error.message); return }
    revalidarCRM(slug)
  } catch (e) {
    console.error('[updateStageColor]', e)
  }
}

// --- Resultado da etapa (aberta / ganho / perdido) ----------------
/**
 * É o que dá conversão própria a cada funil. Sem isso a taxa do topo do quadro
 * saía de "o lead virou cliente", que num funil de pós-venda nasce 100%.
 */
export async function updateStageOutcome(
  stageId: string, outcome: StageOutcome, slug: string,
): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'crm', 'MANAGE')
    if (!isStageOutcome(outcome)) return { error: 'Resultado inválido.' }

    const { error } = await createAdminClient()
      .from('crm_stages')
      .update({ outcome })
      .eq('id', stageId)
      .eq('tenant_id', ctx.tenantId!)

    if (error) return { error: `Erro ao mudar o resultado: ${error.message}` }

    revalidarCRM(slug)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

// --- Excluir -----------------------------------------------------
export async function deleteStage(stageId: string, slug: string): Promise<Resultado> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'crm', 'MANAGE')

    const admin = createAdminClient()

    const { data: etapa, error: erroLeitura } = await admin
      .from('crm_stages')
      .select('funnel_id')
      .eq('id', stageId)
      .eq('tenant_id', ctx.tenantId!)
      .single()
    if (erroLeitura) return { error: `Erro ao excluir: ${erroLeitura.message}` }

    // Quadro sem coluna nenhuma não recebe lead e não tem como voltar atrás
    // pela tela do CRM.
    const { count: irmas, error: erroIrmas } = await admin
      .from('crm_stages')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId!)
      .eq('funnel_id', etapa!.funnel_id)
    if (erroIrmas) return { error: `Erro ao excluir: ${erroIrmas.message}` }
    if ((irmas ?? 0) <= 1) return { error: 'O funil precisa de pelo menos uma etapa.' }

    // `leads.crm_stage_id` é ON DELETE SET NULL: sem esta guarda, apagar a etapa
    // tiraria os leads de todos os quadros sem aviso nenhum.
    const { count, error: erroLeads } = await admin
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('crm_stage_id', stageId)
      .eq('tenant_id', ctx.tenantId!)
    if (erroLeads) return { error: `Erro ao excluir: ${erroLeads.message}` }

    if ((count ?? 0) > 0) {
      return { error: `Esta etapa possui ${count} lead(s). Mova-os antes de excluir.` }
    }

    const { error } = await admin
      .from('crm_stages')
      .delete()
      .eq('id', stageId)
      .eq('tenant_id', ctx.tenantId!)
    if (error) return { error: `Erro ao excluir: ${error.message}` }

    revalidarCRM(slug)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

// --- Reordenar ---------------------------------------------------
export async function reorderStages(orderedIds: string[], slug: string) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'crm', 'MANAGE')

    const admin = createAdminClient()
    await Promise.all(
      orderedIds.map((id, idx) =>
        admin
          .from('crm_stages')
          .update({ position: idx })
          .eq('id', id)
          .eq('tenant_id', ctx.tenantId!),
      ),
    )

    revalidarCRM(slug)
  } catch (e) {
    console.error('[reorderStages]', e)
  }
}
