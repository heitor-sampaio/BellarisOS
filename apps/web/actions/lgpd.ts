'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getTenantContext, assertClient, assertPermission, can } from '@/lib/auth'
import { bloqueioDoSuporte } from '@/lib/suporte/travas'
import { createAdminClient } from '@/lib/supabase/admin'
import { LGPD_BUCKET } from '@/lib/lgpd/export'
import { processExportRequest } from '@/lib/lgpd/processar'
import { avisarPedidoDaCliente } from '@/lib/lgpd/aviso-do-pedido'
import { ler, mensagemDoErro } from '@/lib/db'
import { registrarAcessoAoProntuario } from '@/lib/prontuario/acessos'

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

    const client = await ler(admin
      .from('clients').select('tenant_id').eq('id', ctx.clientId).single(), 'buscar o cliente')
    if (!client) return { error: 'Cliente não encontrado.' }

    // O pacote geral pronto com o prontuário em análise ainda é o pedido em
    // andamento (J-65): a clínica refaz o MESMO pacote quando decidir. Pedir
    // de novo abriria um segundo pedido do prontuário.
    const emAnalise = await ler(admin.from('lgpd_requests').select('id')
      .eq('client_id', ctx.clientId).eq('include_medical', true).eq('medical_status', 'pending')
      .limit(1), 'conferir o prontuário em análise')
    if ((emAnalise ?? []).length) {
      return { error: 'Você já tem uma solicitação em andamento: o prontuário está em análise na clínica.' }
    }

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
    // A49 da 9ª: a clínica fica sabendo no sino (e com o caminho da aba LGPD).
    after(() => avisarPedidoDaCliente(created.id))

    revalidatePath('/[slug]/cliente/perfil', 'page')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

/** Solicitações do titular logado, para a tela do portal do cliente. */
export async function getMyDataRequests(): Promise<LgpdRequestRow[]> {
  const ctx = await getTenantContext()
  if (!ctx.isClient || !ctx.clientId) return []

  const data = await ler(createAdminClient()
    .from('lgpd_requests')
    .select('id, type, status, requested_at, completed_at, include_medical, medical_status, expires_at, error_message, export_pdf_path')
    .eq('client_id', ctx.clientId)
    .eq('type', 'export')
    // O pacote que a EQUIPE gerou pela ficha (A21) não é pedido dela.
    .neq('requested_via', 'equipe')
    .order('requested_at', { ascending: false })
    .limit(10), 'carregar os pedidos de LGPD')

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

  const row = await ler(createAdminClient()
    .from('lgpd_requests')
    .select('client_id, status, expires_at, export_json_path, export_pdf_path')
    .eq('id', requestId)
    .maybeSingle(), 'buscar o pedido de LGPD')

  if (!row || row.client_id !== ctx.clientId) return { error: 'Solicitação não encontrada.' }
  if (row.status !== 'completed')            return { error: 'A solicitação ainda está sendo processada.' }
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return { error: 'O prazo de download expirou. Faça uma nova solicitação.' }
  }

  // O link já diz "baixar", com o nome do arquivo (2026-10-21): a tela abria
  // num popup, que falha no app Android (WebView). Assim a tela navega para ele
  // e o arquivo baixa, sem janela nova.
  const assinar = async (caminho: string | null, nome: string) => {
    if (!caminho) return undefined
    const { data, error } = await createAdminClient().storage.from(LGPD_BUCKET).createSignedUrl(caminho, 600, { download: nome })
    if (error) console.error('[lgpd] assinar o download:', error.message)
    return data?.signedUrl ?? undefined
  }
  const [pdf, json] = await Promise.all([
    assinar(row.export_pdf_path as string | null, 'meus-dados.pdf'),
    assinar(row.export_json_path as string | null, 'meus-dados.json'),
  ])

  return { pdf, json }
}

// ─── Equipe ──────────────────────────────────────────────────────────────────

export type LgpdAdminRow = LgpdRequestRow & {
  client_id:    string
  client_name:  string
  requested_via: string
  /** Quando a clínica liberou ou negou o prontuário (A50 da 8ª: a aba não dizia). */
  medical_reviewed_at?: string | null
}

/** Solicitações do tenant, para a tela da equipe. */
export async function listDataRequests(): Promise<LgpdAdminRow[]> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'clients', 'VIEW')

  const data = await ler(createAdminClient()
    .from('lgpd_requests')
    .select('id, type, status, requested_at, completed_at, include_medical, medical_status, medical_reviewed_at, expires_at, error_message, export_pdf_path, requested_via, client_id, clients(name)')
    .eq('tenant_id', ctx.tenantId!)
    .order('requested_at', { ascending: false })
    .limit(100), 'carregar os pedidos de LGPD')

  return (data ?? []).map(r => ({
    id: r.id, type: r.type, status: r.status,
    requested_at: r.requested_at, completed_at: r.completed_at,
    include_medical: r.include_medical, medical_status: r.medical_status,
    expires_at: r.expires_at, error_message: r.error_message,
    has_files: Boolean(r.export_pdf_path),
    client_id: r.client_id,
    client_name: (r.clients as { name?: string } | null)?.name ?? 'Cliente',
    requested_via: r.requested_via,
    medical_reviewed_at: (r as { medical_reviewed_at?: string | null }).medical_reviewed_at ?? null,
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
    const row = await ler(admin
      .from('lgpd_requests')
      .select('id, tenant_id, client_id, medical_status')
      .eq('id', requestId)
      .maybeSingle(), 'buscar o pedido de LGPD')

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

    if (error) {
      // Aprovar reabre o pedido (volta a `pending`); se o cliente já abriu
      // OUTRO pedido nesse meio-tempo, o índice de "um pedido aberto por
      // cliente" recusa — e a tela mostrava o "duplicate key" cru.
      if (error.code === '23505') {
        return { error: 'O cliente já tem outra solicitação em andamento. Libere o prontuário depois que ela terminar.' }
      }
      return { error: error.message }
    }

    if (decision === 'approved') {
      // O prontuário sai da clínica por decisão de alguém: fica no registro de
      // acessos (lib/prontuario/acessos.ts).
      await registrarAcessoAoProntuario(ctx, row.client_id as string, 'lgpd', requestId)
      after(() => processExportRequest(requestId))
    }

    revalidatePath('/admin/settings')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

// ─── Equipe, pela ficha (A21 da 6ª simulação) ────────────────────────────────
//
// A LGPD só se pedia pelo PORTAL: a cliente sem o app, ou que pede no balcão,
// ficava sem caminho. Quem tem Clientes em Gerenciar exporta pela ficha; o
// prontuário só entra com o Prontuário em Gerenciar (a mesma régua de liberar),
// e então já sai liberado, com o acesso registrado. O pedido fica registrado
// como da equipe (`requested_via = 'equipe'`, quem pediu e o nome do ctx).

export interface ExportacaoDaFicha {
  id:              string
  status:          string
  requestedAt:     string
  completedAt:     string | null
  expiresAt:       string | null
  incluiProntuario: boolean
  pedidoPor:       string | null
  temArquivos:     boolean
  erro:            string | null
}

/** A ficha é da rede (H5): qualquer unidade. */
async function fichaDaRede(tenantId: string, clientId: string) {
  if (typeof clientId !== 'string' || !/^[0-9a-f-]{36}$/i.test(clientId)) return null
  return ler(createAdminClient().from('clients').select('id, tenant_id').eq('id', clientId).eq('tenant_id', tenantId).maybeSingle(), 'buscar a cliente')
}

/** O último pacote que a equipe gerou para esta cliente (a janela da ficha). */
export async function exportacaoDaFicha(clientId: string): Promise<ExportacaoDaFicha | null> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'clients', 'MANAGE')
  if (!(await fichaDaRede(ctx.tenantId!, clientId))) return null
  const r = await ler(createAdminClient().from('lgpd_requests')
    .select('id, status, requested_at, completed_at, expires_at, include_medical, medical_status, requested_by_name, export_pdf_path, error_message')
    .eq('client_id', clientId).eq('tenant_id', ctx.tenantId!).eq('type', 'export').eq('requested_via', 'equipe')
    .order('requested_at', { ascending: false }).limit(1).maybeSingle(), 'buscar o pacote da ficha')
  if (!r) return null
  return {
    id: r.id as string, status: r.status as string, requestedAt: r.requested_at as string,
    completedAt: r.completed_at as string | null, expiresAt: r.expires_at as string | null,
    incluiProntuario: !!r.include_medical && r.medical_status === 'approved',
    pedidoPor: r.requested_by_name as string | null, temArquivos: !!r.export_pdf_path,
    erro: r.status === 'failed' ? 'Não foi possível gerar o pacote. Gere de novo.' : null,
  }
}

/** Gera o pacote pela ficha. */
export async function exportarDadosPelaEquipe(
  clientId: string, o: { incluirProntuario?: boolean } = {},
): Promise<{ ok: true } | { error: string }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'clients', 'MANAGE')
    const travado = bloqueioDoSuporte(ctx, 'exportar os dados da cliente')
    if (travado) return { error: travado }
    const incluir = o?.incluirProntuario === true
    if (incluir && !can(ctx, 'medical_records', 'MANAGE')) {
      return { error: 'Incluir o prontuário pede o Prontuário em Gerenciar.' }
    }
    if (!(await fichaDaRede(ctx.tenantId!, clientId))) return { error: 'Cliente não encontrada.' }

    const agora = new Date().toISOString()
    const { data: criado, error } = await createAdminClient().from('lgpd_requests').insert({
      client_id: clientId, tenant_id: ctx.tenantId!, type: 'export', status: 'pending', requested_via: 'equipe',
      requested_by: ctx.internalUserId ?? null, requested_by_name: ctx.userName || null,
      include_medical: incluir, medical_status: incluir ? 'approved' : 'not_requested',
      ...(incluir ? { medical_reviewed_by: ctx.internalUserId ?? null, medical_reviewed_at: agora } : {}),
    }).select('id').single()
    if (error) {
      if (error.code === '23505') return { error: 'Já há um pacote desta cliente sendo gerado (dela, pelo app, ou da equipe). Aguarde alguns minutos.' }
      return { error: `Não foi possível gerar o pacote: ${error.message}` }
    }
    // O prontuário sai da clínica por decisão de alguém: fica no registro de acessos.
    if (incluir) await registrarAcessoAoProntuario(ctx, clientId, 'lgpd', criado.id as string)
    after(() => processExportRequest(criado.id as string))
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

/** Os links do pacote gerado pela ficha (10 min). Com o prontuário dentro, pede o Prontuário em Gerenciar. */
export async function baixarExportacaoPelaEquipe(requestId: string): Promise<{ pdf?: string; json?: string; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'clients', 'MANAGE')
  if (typeof requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(requestId)) return { error: 'Pacote não encontrado.' }
  const admin = createAdminClient()
  const row = await ler(admin.from('lgpd_requests')
    .select('tenant_id, requested_via, status, expires_at, include_medical, medical_status, export_json_path, export_pdf_path')
    .eq('id', requestId).maybeSingle(), 'buscar o pacote')
  if (!row || row.tenant_id !== ctx.tenantId || row.requested_via !== 'equipe') return { error: 'Pacote não encontrado.' }
  if (row.include_medical && row.medical_status === 'approved' && !can(ctx, 'medical_records', 'MANAGE')) {
    return { error: 'Este pacote tem o prontuário: baixar pede o Prontuário em Gerenciar.' }
  }
  if (row.status !== 'completed') return { error: 'O pacote ainda está sendo gerado.' }
  if (row.expires_at && new Date(row.expires_at as string) < new Date()) return { error: 'O prazo de download expirou. Gere de novo.' }
  const assinar = async (caminho: string | null, nome: string) => {
    if (!caminho) return undefined
    const { data, error } = await admin.storage.from(LGPD_BUCKET).createSignedUrl(caminho, 600, { download: nome })
    if (error) console.error('[lgpd] assinar o download da equipe:', error.message)
    return data?.signedUrl ?? undefined
  }
  const [pdf, json] = await Promise.all([
    assinar(row.export_pdf_path as string | null, 'dados-da-cliente.pdf'),
    assinar(row.export_json_path as string | null, 'dados-da-cliente.json'),
  ])
  return { pdf, json }
}
