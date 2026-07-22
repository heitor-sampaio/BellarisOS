'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveLeadSource, mergeTags } from '@estetica-os/utils'

function str(fd: FormData, key: string) {
  return (fd.get(key) as string | null)?.trim() || null
}

function parseStringArray(fd: FormData, key: string): string[] {
  try {
    const raw = str(fd, key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(v => typeof v === 'string') : []
  } catch {
    return []
  }
}

function parseProcedureIds(fd: FormData): string[] {
  return parseStringArray(fd, 'procedure_ids')
}

async function saveProcedures(
  admin: ReturnType<typeof createAdminClient>,
  leadId: string,
  procedureIds: string[],
) {
  await admin.from('lead_procedures').delete().eq('lead_id', leadId)
  if (procedureIds.length > 0) {
    await admin.from('lead_procedures').insert(
      procedureIds.map(pid => ({ lead_id: leadId, procedure_id: pid })),
    )
  }
}

// --- Criar lead ---------------------------------------------------
export async function createLead(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'crm', 'MANAGE')

    // branch_id opcional: lead sem filial = lead de REDE (designação de filial via tag depois)
    const branchId   = str(formData, '_branchId')
    const slug       = str(formData, '_slug') ?? ''
    const crmStageId = str(formData, 'crm_stage_id')

    const name   = str(formData, 'name')
    const phone  = str(formData, 'phone')
    const email  = str(formData, 'email')
    const social = str(formData, 'social_media')
    const source = str(formData, 'source')
    const notes  = str(formData, 'notes')
    const fbclid      = str(formData, 'fbclid')
    const gclid       = str(formData, 'gclid')
    const utmSource   = str(formData, 'utm_source')
    const utmMedium   = str(formData, 'utm_medium')
    const utmCampaign = str(formData, 'utm_campaign')
    const procedureIds = parseProcedureIds(formData)
    const manualTags   = parseStringArray(formData, 'tags')

    if (!name)                       return { error: 'Nome é obrigatório.' }
    if (!phone && !email && !social) return { error: 'Informe pelo menos um contato: telefone, e-mail ou rede social.' }

    // Origem canônica: se há atribuição, deriva; senão respeita o dropdown; sem nada -> Orgânico.
    const derived = resolveLeadSource(
      { fbclid, gclid, utm_source: utmSource, utm_medium: utmMedium },
      source,
    )
    const tags = mergeTags(derived.tags, manualTags)

    const admin = createAdminClient()
    const { data: lead, error } = await admin
      .from('leads')
      .insert({
        tenant_id: ctx.tenantId!, branch_id: branchId,
        name, phone, email, social_media: social,
        source: derived.source, notes, crm_stage_id: crmStageId ?? null,
        fbclid, gclid,
        utm_source: utmSource, utm_medium: utmMedium, utm_campaign: utmCampaign,
        ctwa_clid: derived.ctwa_clid ?? null,
        tags,
        // Atribui o lead ao vendedor que o criou (base para KPIs por vendedor)
        owner_id: ctx.internalUserId,
      })
      .select('id, created_at')
      .single()

    if (error || !lead) {
      console.error('[createLead]', error?.message)
      return { error: `Erro ao criar lead: ${error?.message ?? 'desconhecido'}` }
    }

    await saveProcedures(admin, lead.id, procedureIds)

    revalidatePath(`/${slug}/crm`)
    revalidatePath('/admin/crm')
    return { success: true, leadId: lead.id as string, createdAt: lead.created_at as string }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

// --- Editar lead --------------------------------------------------
export async function updateLead(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'crm', 'MANAGE')

    const leadId     = str(formData, '_leadId')
    const slug       = str(formData, '_slug') ?? ''
    const crmStageId = str(formData, 'crm_stage_id')

    if (!leadId) return { error: 'Lead não identificado.' }

    const name   = str(formData, 'name')
    const phone  = str(formData, 'phone')
    const email  = str(formData, 'email')
    const social = str(formData, 'social_media')
    const source = str(formData, 'source')
    const notes  = str(formData, 'notes')
    const procedureIds = parseProcedureIds(formData)

    if (!name)                       return { error: 'Nome é obrigatório.' }
    if (!phone && !email && !social) return { error: 'Informe pelo menos um contato: telefone, e-mail ou rede social.' }

    const patch: Record<string, unknown> = {
      name, phone, email, social_media: social, source, notes, crm_stage_id: crmStageId ?? null,
    }
    // Só atualiza tags se o form as enviou (evita apagar tags de callers que não editam tags)
    if (formData.has('tags')) patch.tags = parseStringArray(formData, 'tags')

    const admin = createAdminClient()
    const { error } = await admin
      .from('leads')
      .update(patch)
      .eq('id', leadId)
      .eq('tenant_id', ctx.tenantId!)

    if (error) {
      console.error('[updateLead]', error.message)
      return { error: `Erro ao atualizar lead: ${error.message}` }
    }

    await saveProcedures(admin, leadId, procedureIds)

    revalidatePath(`/${slug}/crm`)
    revalidatePath('/admin/crm')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

// --- Mover entre colunas (drag & drop) ---------------------------
export async function updateLeadStage(leadId: string, crm_stage_id: string, slug: string) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'crm', 'MANAGE')

    const admin = createAdminClient()
    await admin
      .from('leads')
      .update({ crm_stage_id })
      .eq('id', leadId)
      .eq('tenant_id', ctx.tenantId!)

    revalidatePath(`/${slug}/crm`)
    revalidatePath('/admin/crm')
  } catch (e) {
    console.error('[updateLeadStage]', e)
  }
}

// Conversão lead→cliente vive agora em `addClient` (actions/clients.ts) com `_leadId`,
// reutilizando a MESMA regra de criação de cliente (e-mail + CPF + login).

// --- Excluir lead -------------------------------------------------
export async function deleteLead(leadId: string, slug: string) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'crm', 'MANAGE')

    const admin = createAdminClient()
    await admin
      .from('leads')
      .delete()
      .eq('id', leadId)
      .eq('tenant_id', ctx.tenantId!)

    revalidatePath(`/${slug}/crm`)
    revalidatePath('/admin/crm')
  } catch (e) {
    console.error('[deleteLead]', e)
  }
}
