'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getTenantContext, assertClient, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSignedUrl } from '@/lib/storage'
import { buildClientExport, LGPD_BUCKET } from '@/lib/lgpd/export'

/**
 * Pedido de acesso aos dados pessoais (LGPD art. 18).
 *
 * O pacote base é gerado sozinho, logo após a solicitação. A parte clínica só
 * entra depois que alguém da equipe com permissão de prontuário aprova — e
 * nesse momento o pacote é regerado incluindo-a.
 *
 * Não há fila no projeto: o processamento roda em `after()`, fora do request,
 * e a rota de cron `/api/cron/lgpd-exports` recolhe o que tiver ficado para
 * trás (processo reiniciado no meio, por exemplo).
 */

export type LgpdRequestRow = {
  id:              string
  type:            string
  status:          string
  requested_at:    string
  completed_at:    string | null
  include_medical: boolean
  medical_status:  string
  expires_at:      string | null
  error_message:   string | null
  has_files:       boolean
}

/** Processa um pedido: monta o pacote, sobe os arquivos e fecha o registro. */
export async function processExportRequest(requestId: string): Promise<void> {
  const admin = createAdminClient()

  // Só sai de 'pending' quem ainda está em 'pending': se o cron e o after()
  // caírem no mesmo pedido, apenas um segue adiante.
  const { data: claimed } = await admin
    .from('lgpd_requests')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('id, client_id, include_medical, medical_status')
    .maybeSingle()

  if (!claimed) return

  try {
    // Clínico só entra com aprovação explícita da equipe.
    const includeMedical = claimed.include_medical && claimed.medical_status === 'approved'
    const { jsonPath, pdfPath, expiresAt } = await buildClientExport(
      claimed.id, claimed.client_id, includeMedical,
    )

    await admin.from('lgpd_requests').update({
      status:           'completed',
      completed_at:     new Date().toISOString(),
      export_json_path: jsonPath,
      export_pdf_path:  pdfPath,
      expires_at:       expiresAt.toISOString(),
      error_message:    null,
      updated_at:       new Date().toISOString(),
    }).eq('id', claimed.id)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erro inesperado'
    await admin.from('lgpd_requests').update({
      status:        'failed',
      error_message: message,
      updated_at:    new Date().toISOString(),
    }).eq('id', claimed.id)
  }
}

// ─── Cliente ─────────────────────────────────────────────────────────────────

/** O titular solicita seus dados. */
export async function requestDataExport(
  _prev: { error?: string; success?: boolean } | null,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const ctx = await getTenantContext()
    assertClient(ctx)
    if (!ctx.clientId) return { error: 'Cliente não identificado.' }

    const includeMedical = formData.get('include_medical') === 'on'
    const admin = createAdminClient()

    const { data: client } = await admin
      .from('clients').select('tenant_id').eq('id', ctx.clientId).single()
    if (!client) return { error: 'Cliente não encontrado.' }

    const { data: created, error } = await admin.from('lgpd_requests').insert({
      client_id:       ctx.clientId,
      tenant_id:       client.tenant_id,
      type:            'export',
      status:          'pending',
      requested_via:   'web',
      include_medical: includeMedical,
      medical_status:  includeMedical ? 'pending' : 'not_requested',
    }).select('id').single()

    if (error) {
      // Índice único parcial: já existe um pedido em aberto para este titular.
      if (error.code === '23505') {
        return { error: 'Você já tem uma solicitação em andamento. Aguarde a conclusão.' }
      }
      return { error: `Não foi possível registrar a solicitação: ${error.message}` }
    }

    // Fora do request: o titular recebe a confirmação sem esperar o pacote.
    after(() => processExportRequest(created.id))

    revalidatePath('/[slug]/cliente/perfil', 'page')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}

/** Solicitações do titular logado, para a tela do portal do cliente. */
export async function getMyDataRequests(): Promise<LgpdRequestRow[]> {
  const ctx = await getTenantContext()
  if (!ctx.isClient || !ctx.clientId) return []

  const { data } = await createAdminClient()
    .from('lgpd_requests')
    .select('id, type, status, requested_at, completed_at, include_medical, medical_status, expires_at, error_message, export_pdf_path')
    .eq('client_id', ctx.clientId)
    .eq('type', 'export')
    .order('requested_at', { ascending: false })
    .limit(10)

  return (data ?? []).map(r => ({
    id: r.id, type: r.type, status: r.status,
    requested_at: r.requested_at, completed_at: r.completed_at,
    include_medical: r.include_medical, medical_status: r.medical_status,
    expires_at: r.expires_at, error_message: r.error_message,
    has_files: Boolean(r.export_pdf_path),
  }))
}

/** Links de download temporários. Só o próprio titular obtém os dele. */
export async function getExportDownloadUrls(
  requestId: string,
): Promise<{ pdf?: string; json?: string; error?: string }> {
  const ctx = await getTenantContext()
  assertClient(ctx)
  if (!ctx.clientId) return { error: 'Cliente não identificado.' }

  const { data: row } = await createAdminClient()
    .from('lgpd_requests')
    .select('client_id, status, expires_at, export_json_path, export_pdf_path')
    .eq('id', requestId)
    .maybeSingle()

  if (!row || row.client_id !== ctx.clientId) return { error: 'Solicitação não encontrada.' }
  if (row.status !== 'completed')            return { error: 'A solicitação ainda está sendo processada.' }
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return { error: 'O prazo de download expirou. Faça uma nova solicitação.' }
  }

  const [pdf, json] = await Promise.all([
    getSignedUrl(LGPD_BUCKET, row.export_pdf_path, 600),
    getSignedUrl(LGPD_BUCKET, row.export_json_path, 600),
  ])

  return { pdf: pdf ?? undefined, json: json ?? undefined }
}

// ─── Equipe ──────────────────────────────────────────────────────────────────

export type LgpdAdminRow = LgpdRequestRow & {
  client_id:    string
  client_name:  string
  requested_via: string
}

/** Solicitações do tenant, para a tela da equipe. */
export async function listDataRequests(): Promise<LgpdAdminRow[]> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'clients', 'VIEW')

  const { data } = await createAdminClient()
    .from('lgpd_requests')
    .select('id, type, status, requested_at, completed_at, include_medical, medical_status, expires_at, error_message, export_pdf_path, requested_via, client_id, clients(name)')
    .eq('tenant_id', ctx.tenantId!)
    .order('requested_at', { ascending: false })
    .limit(100)

  return (data ?? []).map(r => ({
    id: r.id, type: r.type, status: r.status,
    requested_at: r.requested_at, completed_at: r.completed_at,
    include_medical: r.include_medical, medical_status: r.medical_status,
    expires_at: r.expires_at, error_message: r.error_message,
    has_files: Boolean(r.export_pdf_path),
    client_id: r.client_id,
    client_name: (r.clients as { name?: string } | null)?.name ?? 'Cliente',
    requested_via: r.requested_via,
  }))
}

/**
 * Equipe libera (ou nega) a parte clínica do pacote.
 * Exige permissão de prontuário — não basta ter acesso a clientes.
 */
export async function reviewMedicalData(
  _prev: { error?: string; success?: boolean } | null,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'medical_records', 'MANAGE')

    const requestId = (formData.get('request_id') as string)?.trim()
    const decision  = (formData.get('decision') as string)?.trim()
    if (decision !== 'approved' && decision !== 'denied') {
      return { error: 'Decisão inválida.' }
    }

    const admin = createAdminClient()
    const { data: row } = await admin
      .from('lgpd_requests')
      .select('id, tenant_id, medical_status')
      .eq('id', requestId)
      .maybeSingle()

    if (!row || row.tenant_id !== ctx.tenantId) return { error: 'Solicitação não encontrada.' }
    if (row.medical_status !== 'pending')       return { error: 'Esta solicitação já foi avaliada.' }

    const { error } = await admin.from('lgpd_requests').update({
      medical_status:      decision,
      medical_reviewed_by: ctx.internalUserId,
      medical_reviewed_at: new Date().toISOString(),
      // Aprovar significa regerar o pacote com a parte clínica dentro.
      ...(decision === 'approved'
        ? { status: 'pending', completed_at: null, export_json_path: null, export_pdf_path: null }
        : {}),
      updated_at: new Date().toISOString(),
    }).eq('id', requestId)

    if (error) return { error: error.message }

    if (decision === 'approved') after(() => processExportRequest(requestId))

    revalidatePath('/admin/settings')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}
