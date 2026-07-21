'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertRole } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdsConfig } from '@/lib/ads/factory'
import { MetaAdsProvider } from '@/lib/ads/meta'
import type { MetaAdsConfig } from '@/lib/ads/types'
import { resolveLeadSource, mergeTags, unitTag } from '@estetica-os/utils'

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
    assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST', 'COMERCIAL'])

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
        owner_id: ctx.role === 'COMERCIAL' ? ctx.internalUserId : null,
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
    assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST', 'COMERCIAL'])

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
    assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST', 'COMERCIAL'])

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

// --- Converter lead em cliente ------------------------------------
export async function convertLeadToClient(leadId: string, slug: string, branchId?: string | null) {
  try {
    const ctx = await getTenantContext()
    assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST', 'COMERCIAL'])

    const supabase = await createSupabase()
    const { data: lead } = await supabase
      .from('leads')
      .select('id, name, phone, email, branch_id, client_id, tenant_id, fbclid')
      .eq('id', leadId)
      .eq('tenant_id', ctx.tenantId!)
      .single()

    if (!lead)          return { error: 'Lead não encontrado.' }
    if (lead.client_id) return { clientId: lead.client_id as string }

    // Cliente sempre nasce com uma UNIDADE informada (métrica de origem; não fica preso a ela).
    const unitBranchId = branchId ?? (lead.branch_id as string | null)
    if (!unitBranchId) return { error: 'Informe a unidade de cadastro do cliente.' }

    const admin = createAdminClient()

    const { data: unitBranch } = await admin
      .from('branches')
      .select('name')
      .eq('id', unitBranchId)
      .eq('tenant_id', lead.tenant_id)
      .maybeSingle()
    if (!unitBranch) return { error: 'Unidade inválida.' }

    const { data: client, error } = await admin
      .from('clients')
      .insert({
        tenant_id: lead.tenant_id,
        branch_id: unitBranchId,
        name: lead.name, phone: lead.phone ?? '', email: lead.email,
        is_active: true, tags: [unitTag((unitBranch as { name: string }).name)],
      })
      .select('id')
      .single()

    if (error || !client) return { error: 'Erro ao criar cliente.' }

    await admin.from('loyalty_accounts').insert({
      tenant_id: lead.tenant_id, client_id: client.id, points: 0,
    })

    await admin.from('leads').update({ client_id: client.id }).eq('id', leadId)

    // Dispara CAPI (não-bloqueante)
    getAdsConfig(lead.tenant_id as string, 'meta_ads').then(metaConfig => {
      if (!metaConfig) return
      new MetaAdsProvider(metaConfig as MetaAdsConfig).sendCAPIEvent({
        email:  lead.email  as string | null,
        phone:  lead.phone  as string | null,
        fbclid: lead.fbclid as string | null,
      }, 'CompleteRegistration').catch(() => null)
    }).catch(() => null)

    revalidatePath(`/${slug}/crm`)
    revalidatePath(`/${slug}/clients`)
    revalidatePath('/admin/crm')
    revalidatePath('/admin/clients')

    return { clientId: client.id as string }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

// --- Excluir lead -------------------------------------------------
export async function deleteLead(leadId: string, slug: string) {
  try {
    const ctx = await getTenantContext()
    assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN'])

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
