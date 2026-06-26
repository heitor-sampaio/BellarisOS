'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertRole } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdsConfig } from '@/lib/ads/factory'
import { MetaAdsProvider } from '@/lib/ads/meta'
import type { MetaAdsConfig } from '@/lib/ads/types'

function str(fd: FormData, key: string) {
  return (fd.get(key) as string | null)?.trim() || null
}

function parseProcedureIds(fd: FormData): string[] {
  try {
    const raw = str(fd, 'procedure_ids')
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string') : []
  } catch {
    return []
  }
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

// ─── Criar lead ───────────────────────────────────────────────────
export async function createLead(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  try {
    const ctx = await getTenantContext()
    assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST'])

    const branchId   = str(formData, '_branchId')
    const slug       = str(formData, '_slug') ?? ''
    const crmStageId = str(formData, 'crm_stage_id')

    if (!branchId) return { error: 'Filial não identificada. Recarregue a página.' }

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

    if (!name)                       return { error: 'Nome é obrigatório.' }
    if (!phone && !email && !social) return { error: 'Informe pelo menos um contato: telefone, e-mail ou rede social.' }

    const admin = createAdminClient()
    const { data: lead, error } = await admin
      .from('leads')
      .insert({
        tenant_id: ctx.tenantId!, branch_id: branchId,
        name, phone, email, social_media: social,
        source, notes, crm_stage_id: crmStageId ?? null,
        fbclid, gclid,
        utm_source: utmSource, utm_medium: utmMedium, utm_campaign: utmCampaign,
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

// ─── Editar lead ──────────────────────────────────────────────────
export async function updateLead(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  try {
    const ctx = await getTenantContext()
    assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST'])

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

    const admin = createAdminClient()
    const { error } = await admin
      .from('leads')
      .update({ name, phone, email, social_media: social, source, notes, crm_stage_id: crmStageId ?? null })
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

// ─── Mover entre colunas (drag & drop) ───────────────────────────
export async function updateLeadStage(leadId: string, crm_stage_id: string, slug: string) {
  try {
    const ctx = await getTenantContext()
    assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST'])

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

// ─── Converter lead em cliente ────────────────────────────────────
export async function convertLeadToClient(leadId: string, slug: string) {
  try {
    const ctx = await getTenantContext()
    assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST'])

    const supabase = await createSupabase()
    const { data: lead } = await supabase
      .from('leads')
      .select('id, name, phone, email, branch_id, client_id, tenant_id, fbclid')
      .eq('id', leadId)
      .eq('tenant_id', ctx.tenantId!)
      .single()

    if (!lead)          return { error: 'Lead não encontrado.' }
    if (lead.client_id) return { clientId: lead.client_id as string }

    const admin = createAdminClient()

    const { data: client, error } = await admin
      .from('clients')
      .insert({
        tenant_id: lead.tenant_id,
        branch_id: lead.branch_id,
        name: lead.name, phone: lead.phone ?? '', email: lead.email,
        is_active: true, tags: [],
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
        fbclid: (lead as any).fbclid as string | null,
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

// ─── Excluir lead ─────────────────────────────────────────────────
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
