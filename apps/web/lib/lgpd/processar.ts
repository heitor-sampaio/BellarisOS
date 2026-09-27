import { createAdminClient } from '@/lib/supabase/admin'
import { buildClientExport } from '@/lib/lgpd/export'
import { gravar, ler } from '@/lib/db'

/**
 * Processa um pedido de LGPD: monta o pacote, sobe os arquivos e fecha o
 * registro. Fora de `actions/`, de propósito.
 *
 * Morava em `actions/lgpd.ts`, e todo export de um arquivo `'use server'` é
 * endpoint público (§9.9): qualquer um, SEM LOGIN, disparava a montagem do
 * pacote de dados de qualquer pedido pelo id. Quem chama são o `after()` das
 * actions de LGPD e o cron `/api/cron/lgpd-exports` — os dois do servidor.
 * Achado na varredura de cobertura de 2026-09-27.
 */
export async function processExportRequest(requestId: string): Promise<void> {
  const admin = createAdminClient()

  // Só sai de 'pending' quem ainda está em 'pending': se o cron e o after()
  // caírem no mesmo pedido, apenas um segue adiante.
  const claimed = await ler(admin
    .from('lgpd_requests')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('id, client_id, include_medical, medical_status')
    .maybeSingle(), 'conferir se já há pedido em aberto')

  if (!claimed) return

  try {
    // Clínico só entra com aprovação explícita da equipe.
    const includeMedical = claimed.include_medical && claimed.medical_status === 'approved'
    const { jsonPath, pdfPath, expiresAt } = await buildClientExport(
      claimed.id, claimed.client_id, includeMedical,
    )

    await gravar(admin.from('lgpd_requests').update({
      status:           'completed',
      completed_at:     new Date().toISOString(),
      export_json_path: jsonPath,
      export_pdf_path:  pdfPath,
      expires_at:       expiresAt.toISOString(),
      error_message:    null,
      updated_at:       new Date().toISOString(),
    }).eq('id', claimed.id), 'atualizar o pedido de LGPD')
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erro inesperado'
    await gravar(admin.from('lgpd_requests').update({
      status:        'failed',
      error_message: message,
      updated_at:    new Date().toISOString(),
    }).eq('id', claimed.id), 'atualizar o pedido de LGPD')
  }
}
