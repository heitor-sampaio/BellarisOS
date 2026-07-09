'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertRole } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeFormSchema } from '@/lib/anamnesis'

const ANAMNESIS_BUCKET = 'anamnesis-photos'

export async function saveGeneralAnamnesis(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'PROFESSIONAL'])

  const clientId = (formData.get('client_id') as string | null)?.trim()
  const branchId = (formData.get('branch_id') as string | null)?.trim()
  const slug     = (formData.get('slug')      as string | null)?.trim()

  if (!clientId || !branchId) return { error: 'Dados inválidos.' }

  // Verify client belongs to this tenant's branch
  const supabase = await createSupabase()
  const { data: branch } = await supabase
    .from('branches')
    .select('id')
    .eq('id', branchId)
    .eq('tenant_id', ctx.tenantId!)
    .single()
  if (!branch) return { error: 'Filial não encontrada.' }

  const anamnesis = {
    skinType:                   (formData.get('skinType')                   as string) || '',
    allergies:                  ((formData.get('allergies')                 as string) || '').trim(),
    medications:                ((formData.get('medications')               as string) || '').trim(),
    healthConditions:           ((formData.get('healthConditions')          as string) || '').trim(),
    previousProcedures:         ((formData.get('previousProcedures')        as string) || '').trim(),
    isPregnantOrBreastfeeding:  formData.get('isPregnantOrBreastfeeding')   === 'true',
    useSunscreen:               formData.get('useSunscreen')                === 'true',
    observations:               ((formData.get('observations')              as string) || '').trim(),
    updatedAt:                  new Date().toISOString(),
    updatedBy:                  ctx.internalUserId,
  }

  const admin = createAdminClient()

  // Upsert medical_records row
  const { error } = await admin
    .from('medical_records')
    .upsert(
      { client_id: clientId, general_anamnesis: anamnesis },
      { onConflict: 'client_id' },
    )

  if (error) return { error: `Erro ao salvar: ${error.message}` }

  revalidatePath(`/${slug}/clients/${clientId}`)
  return {}
}

// ─── Ficha de anamnese por procedimento (construtor) ──────────────────────────

/** Upload de foto de um campo de anamnese → retorna URL pública. */
export async function uploadAnamnesisPhoto(
  formData: FormData,
): Promise<{ error?: string; url?: string }> {
  try {
    const ctx = await getTenantContext()
    assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST', 'PROFESSIONAL'])

    const file          = formData.get('file') as File | null
    const appointmentId = (formData.get('appointment_id') as string | null)?.trim()
    if (!file || file.size === 0) return { error: 'Selecione uma imagem.' }
    if (!appointmentId)           return { error: 'Dados inválidos.' }
    if (!file.type.startsWith('image/')) return { error: 'Envie um arquivo de imagem.' }
    if (file.size > 15 * 1024 * 1024)    return { error: 'Imagem deve ter no máximo 15 MB.' }

    const admin = createAdminClient()
    const { data: buckets } = await admin.storage.listBuckets()
    if (!buckets?.find(b => b.name === ANAMNESIS_BUCKET)) {
      await admin.storage.createBucket(ANAMNESIS_BUCKET, { public: true })
    }

    const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const path     = `${ctx.tenantId}/${appointmentId}/${safeName}`
    const buffer   = await file.arrayBuffer()
    const { error: upErr } = await admin.storage
      .from(ANAMNESIS_BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: false })
    if (upErr) return { error: `Falha no upload: ${upErr.message}` }

    const { data: urlData } = admin.storage.from(ANAMNESIS_BUCKET).getPublicUrl(path)
    return { url: urlData.publicUrl }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro no upload.' }
  }
}

/** Salva as respostas da ficha de anamnese do procedimento no prontuário (entry). */
export async function saveProcedureAnamnesis(params: {
  appointmentId: string
  slug:          string
  answers:       Record<string, unknown>
}): Promise<{ error?: string; ok?: true }> {
  try {
    const ctx = await getTenantContext()
    assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'PROFESSIONAL'])

    const admin = createAdminClient()
    const { data: appt } = await admin
      .from('appointments')
      .select('id, status, client_id, professional_id, procedure_id, branches!inner(tenant_id)')
      .eq('id', params.appointmentId)
      .single()

    const apptBranch = appt?.branches as unknown as { tenant_id: string } | null
    if (!appt || apptBranch?.tenant_id !== ctx.tenantId) return { error: 'Agendamento não encontrado.' }

    const isFinalised = ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(appt.status as string)
    const isAdmin     = ['NETWORK_ADMIN', 'BRANCH_ADMIN'].includes(ctx.role)
    if (isFinalised && !isAdmin) return { error: 'Registro finalizado. Apenas gerentes podem editar.' }

    // Ficha vinculada ao procedimento (para snapshot dos campos)
    const { data: proc } = await admin
      .from('procedures')
      .select('anamnesis_form_id')
      .eq('id', appt.procedure_id)
      .maybeSingle()
    const formId = (proc?.anamnesis_form_id as string | null) ?? null
    if (!formId) return { error: 'Este procedimento não tem ficha de anamnese vinculada.' }

    const { data: form } = await admin
      .from('anamnesis_forms')
      .select('id, name, schema')
      .eq('id', formId)
      .eq('tenant_id', ctx.tenantId!)
      .maybeSingle()
    if (!form) return { error: 'Ficha não encontrada.' }

    const rows = normalizeFormSchema(form.schema).rows

    // medical_records (get or create)
    let { data: medRecord } = await admin
      .from('medical_records').select('id').eq('client_id', appt.client_id).maybeSingle()
    if (!medRecord) {
      const { data: created } = await admin
        .from('medical_records').insert({ client_id: appt.client_id }).select('id').single()
      medRecord = created
    }
    if (!medRecord) return { error: 'Erro ao abrir o prontuário.' }

    // Merge preservando o restante do anamnesis_data existente
    const { data: entry } = await admin
      .from('medical_record_entries')
      .select('anamnesis_data')
      .eq('appointment_id', params.appointmentId)
      .maybeSingle()
    const existing = (entry?.anamnesis_data as Record<string, unknown> | null) ?? {}

    const merged = {
      ...existing,
      customForm: { formId: form.id, name: form.name, rows, answers: params.answers },
    }

    const { error } = await admin.from('medical_record_entries').upsert({
      medical_record_id: medRecord.id,
      appointment_id:    params.appointmentId,
      professional_id:   appt.professional_id,
      anamnesis_data:    merged,
    }, { onConflict: 'appointment_id' })

    if (error) return { error: `Erro ao salvar: ${error.message}` }

    revalidatePath(`/${params.slug}/agenda/${params.appointmentId}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}
