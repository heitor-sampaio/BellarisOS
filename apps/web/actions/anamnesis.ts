'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeFormSchema } from '@/lib/anamnesis'
import { ANAMNESIS_BUCKET, ensurePrivateBucket, getSignedUrl, getSignedUrls } from '@/lib/storage'


export async function saveGeneralAnamnesis(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'medical_records', 'MANAGE')

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

/**
 * Upload de foto de um campo de anamnese para bucket PRIVADO.
 * Guarda-se o `path` na resposta; a `url` retornada é uma signed URL (1h) só para preview.
 */
export async function uploadAnamnesisPhoto(
  formData: FormData,
): Promise<{ error?: string; path?: string; url?: string }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'medical_records', 'MANAGE')

    const file          = formData.get('file') as File | null
    const appointmentId = (formData.get('appointment_id') as string | null)?.trim()
    if (!file || file.size === 0) return { error: 'Selecione uma imagem.' }
    if (!appointmentId)           return { error: 'Dados inválidos.' }
    if (!file.type.startsWith('image/')) return { error: 'Envie um arquivo de imagem.' }
    if (file.size > 15 * 1024 * 1024)    return { error: 'Imagem deve ter no máximo 15 MB.' }

    const admin = createAdminClient()
    await ensurePrivateBucket(ANAMNESIS_BUCKET)

    const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const path     = `${ctx.tenantId}/${appointmentId}/${safeName}`
    const buffer   = await file.arrayBuffer()
    const { error: upErr } = await admin.storage
      .from(ANAMNESIS_BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: false })
    if (upErr) return { error: `Falha no upload: ${upErr.message}` }

    const url = await getSignedUrl(ANAMNESIS_BUCKET, path)
    return { path, url: url ?? undefined }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro no upload.' }
  }
}

/** Gera signed URLs (1h) para paths de fotos — só do próprio tenant. */
export async function signAnamnesisPhotos(paths: string[]): Promise<Record<string, string>> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'medical_records', 'MANAGE')
    const own = (paths ?? []).filter(p => typeof p === 'string' && p.startsWith(`${ctx.tenantId}/`))
    return await getSignedUrls(ANAMNESIS_BUCKET, own)
  } catch {
    return {}
  }
}

/**
 * Salva as respostas de uma ficha do construtor (anamnese OU atendimento) no prontuário (entry).
 * Parametrizado pela ficha vinculada ao procedimento, tabela da ficha, coluna jsonb e chave do snapshot.
 */
async function saveProcedureForm(params: {
  appointmentId: string
  slug:          string
  answers:       Record<string, unknown>
  formIdField:   'anamnesis_form_id' | 'attendance_form_id'
  formTable:     'anamnesis_forms' | 'attendance_forms'
  dataColumn:    'anamnesis_data' | 'attendance_data'
  dataKey:       'customForm' | 'attendanceForm'
  notLinkedMsg:  string
}): Promise<{ error?: string; ok?: true }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'medical_records', 'MANAGE')

    const admin = createAdminClient()
    const { data: appt } = await admin
      .from('appointments')
      .select('id, status, client_id, professional_id, procedure_id, branches!inner(tenant_id)')
      .eq('id', params.appointmentId)
      .single()

    const apptBranch = appt?.branches as unknown as { tenant_id: string } | null
    if (!appt || apptBranch?.tenant_id !== ctx.tenantId) return { error: 'Agendamento não encontrado.' }

    const isFinalised = ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(appt.status as string)
    const isAdmin     = ctx.permissions.medical_records === 'MANAGE'
    if (isFinalised && !isAdmin) return { error: 'Registro finalizado. Apenas gerentes podem editar.' }

    // Ficha vinculada ao procedimento (para snapshot dos campos)
    const { data: proc } = await admin
      .from('procedures')
      .select(params.formIdField)
      .eq('id', appt.procedure_id)
      .maybeSingle()
    const formId = ((proc as Record<string, unknown> | null)?.[params.formIdField] as string | null) ?? null
    if (!formId) return { error: params.notLinkedMsg }

    const { data: form } = await admin
      .from(params.formTable)
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

    // Merge preservando o restante da coluna jsonb existente
    const { data: entry } = await admin
      .from('medical_record_entries')
      .select(params.dataColumn)
      .eq('appointment_id', params.appointmentId)
      .maybeSingle()
    const existing = ((entry as Record<string, unknown> | null)?.[params.dataColumn] as Record<string, unknown> | null) ?? {}

    const merged = {
      ...existing,
      [params.dataKey]: { formId: form.id, name: form.name, rows, answers: params.answers },
    }

    const { error } = await admin.from('medical_record_entries').upsert({
      medical_record_id: medRecord.id,
      appointment_id:    params.appointmentId,
      professional_id:   appt.professional_id,
      [params.dataColumn]: merged,
    }, { onConflict: 'appointment_id' })

    if (error) return { error: `Erro ao salvar: ${error.message}` }

    revalidatePath(`/${params.slug}/agenda/${params.appointmentId}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

/** Salva as respostas da ficha de ANAMNESE do procedimento no prontuário (entry). */
export async function saveProcedureAnamnesis(params: {
  appointmentId: string
  slug:          string
  answers:       Record<string, unknown>
}): Promise<{ error?: string; ok?: true }> {
  return saveProcedureForm({
    ...params,
    formIdField:  'anamnesis_form_id',
    formTable:    'anamnesis_forms',
    dataColumn:   'anamnesis_data',
    dataKey:      'customForm',
    notLinkedMsg: 'Este procedimento não tem ficha de anamnese vinculada.',
  })
}

/** Salva as respostas da ficha de ATENDIMENTO do procedimento no prontuário (entry). */
export async function saveProcedureAttendance(params: {
  appointmentId: string
  slug:          string
  answers:       Record<string, unknown>
}): Promise<{ error?: string; ok?: true }> {
  return saveProcedureForm({
    ...params,
    formIdField:  'attendance_form_id',
    formTable:    'attendance_forms',
    dataColumn:   'attendance_data',
    dataKey:      'attendanceForm',
    notLinkedMsg: 'Este procedimento não tem ficha de atendimento vinculada.',
  })
}
