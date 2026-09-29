import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { getSignedUrl, MODELOS_DE_DOCUMENTO_BUCKET } from '@/lib/storage'
import { VARIAVEIS_DE_DOCUMENTO } from './variaveis'
import {
  garantirRenderizado, renderizarPendentes, COLUNAS_DO_DOCUMENTO,
  type DocumentoEmitido, type StatusDoDocumento,
} from './renderizar'

/**
 * O que as telas mostram de um documento emitido: a ficha do cliente, o painel
 * da sessão e a tela de assinar. Quem chama já conferiu a permissão e a rede.
 */

export interface ResumoDeDocumento {
  id:            string
  titulo:        string
  tipo:          DocumentoEmitido['kind']
  origem:        DocumentoEmitido['source']
  status:        StatusDoDocumento
  exigencia:     DocumentoEmitido['enforcement']
  momento:       string
  /** O que falta no cadastro, em português ("Cliente · CPF"). */
  faltando:      string[]
  agendamentoId: string | null
  agendamentoEm: string | null
  procedimento:  string | null
  criadoEm:      string
  assinadoEm:    string | null
  canal:         'CLINICA' | 'PORTAL' | 'LINK' | 'PAPEL' | null
  codigo:        string | null
  motivo:        string | null
  /** Link público de assinatura ainda valendo: até quando. */
  linkAte:       string | null
}

const CATALOGO = VARIAVEIS_DE_DOCUMENTO as Record<string, { grupo: string; rotulo: string }>

export function rotuloDoQueFalta(variavel: string): string {
  const v = CATALOGO[variavel]
  return v ? `${v.grupo} · ${v.rotulo}` : variavel
}

export async function resumirDocumentos(tenantId: string, docs: DocumentoEmitido[]): Promise<ResumoDeDocumento[]> {
  if (!docs.length) return []
  const admin = createAdminClient()
  const montados = await renderizarPendentes(tenantId, docs)
  const agendamentos = [...new Set(montados.map(d => d.appointment_id).filter((x): x is string => !!x))]
  const procedimentos = [...new Set(montados.map(d => d.procedure_id).filter((x): x is string => !!x))]
  const assinados = montados.filter(d => d.status === 'ASSINADO').map(d => d.id)
  const pendentes = montados.filter(d => d.status === 'PENDENTE').map(d => d.id)
  const [ags, procs, assins, links] = await Promise.all([
    agendamentos.length
      ? ler(admin.from('appointments').select('id, scheduled_at').in('id', agendamentos), 'buscar os agendamentos dos documentos')
      : Promise.resolve([]),
    procedimentos.length
      ? ler(admin.from('procedures').select('id, name').in('id', procedimentos), 'buscar os procedimentos dos documentos')
      : Promise.resolve([]),
    assinados.length
      ? ler(admin.from('document_signatures').select('issued_document_id, channel').in('issued_document_id', assinados), 'buscar as assinaturas')
      : Promise.resolve([]),
    pendentes.length
      ? ler(admin.from('document_sign_links').select('issued_document_id, expires_at')
          .in('issued_document_id', pendentes).is('used_at', null).is('revoked_at', null)
          .gt('expires_at', new Date().toISOString()), 'buscar os links de assinatura')
      : Promise.resolve([]),
  ])
  const linkAte = new Map((links ?? []).map(l => [l.issued_document_id as string, l.expires_at as string]))
  const quando = new Map((ags ?? []).map(a => [a.id as string, a.scheduled_at as string]))
  const nomeProc = new Map((procs ?? []).map(p => [p.id as string, p.name as string]))
  const canal = new Map((assins ?? []).map(s => [s.issued_document_id as string, s.channel as ResumoDeDocumento['canal']]))

  return montados.map(d => ({
    id:            d.id,
    titulo:        d.title,
    tipo:          d.kind,
    origem:        d.source,
    status:        d.status,
    exigencia:     d.enforcement,
    momento:       d.moment,
    faltando:      (d.missing_fields ?? []).map(rotuloDoQueFalta),
    agendamentoId: d.appointment_id,
    agendamentoEm: d.appointment_id ? quando.get(d.appointment_id) ?? null : null,
    procedimento:  d.procedure_id ? nomeProc.get(d.procedure_id) ?? null : null,
    criadoEm:      d.created_at,
    assinadoEm:    d.signed_at,
    canal:         canal.get(d.id) ?? null,
    codigo:        d.verification_code,
    motivo:        d.closed_reason,
    linkAte:       linkAte.get(d.id) ?? null,
  }))
}

/** Todos os documentos do cliente, os abertos primeiro — a ficha. */
export async function documentosDoCliente(tenantId: string, clientId: string): Promise<ResumoDeDocumento[]> {
  const admin = createAdminClient()
  const docs = await ler(admin.from('issued_documents').select(COLUNAS_DO_DOCUMENTO)
    .eq('tenant_id', tenantId).eq('client_id', clientId)
    .neq('status', 'SUBSTITUIDO')
    .order('created_at', { ascending: false }).limit(200), 'listar os documentos do cliente')
  const resumo = await resumirDocumentos(tenantId, (docs ?? []) as unknown as DocumentoEmitido[])
  const ordem = (s: StatusDoDocumento) => (['A_GERAR', 'INCOMPLETO', 'PENDENTE'].includes(s) ? 0 : 1)
  return resumo.sort((a, b) => ordem(a.status) - ordem(b.status))
}

/** Os documentos de um agendamento — o painel da sessão. */
export async function documentosDoAgendamento(tenantId: string, appointmentId: string): Promise<ResumoDeDocumento[]> {
  const admin = createAdminClient()
  const docs = await ler(admin.from('issued_documents').select(COLUNAS_DO_DOCUMENTO)
    .eq('tenant_id', tenantId).eq('appointment_id', appointmentId)
    .not('status', 'in', '(CANCELADO,SUBSTITUIDO)')
    .order('kind').order('title'), 'listar os documentos do atendimento')
  return resumirDocumentos(tenantId, (docs ?? []) as unknown as DocumentoEmitido[])
}

export interface DocumentoParaExibir {
  resumo:     ResumoDeDocumento
  clienteId:  string
  cliente:    { nome: string; cpf: string | null }
  branchId:   string | null
  /** A forma canônica (EDITOR): o navegador desenha e calcula o hash DESTES bytes. */
  conteudo:   string | null
  /** O PDF enviado (ARQUIVO), por link temporário. */
  pdfUrl:     string | null
  hash:       string | null
  assinatura: { png: string | null; nome: string; em: string; canal: string; conduzidoPor: string | null } | null
}

/** Um documento inteiro, para ler e assinar. `montarDeNovo` para quem vai assinar. */
export async function documentoParaExibir(
  tenantId: string, docId: string, opcoes: { montarDeNovo?: boolean } = {},
): Promise<DocumentoParaExibir | null> {
  const doc = await garantirRenderizado(tenantId, docId, { forcar: opcoes.montarDeNovo })
  if (!doc) return null
  const admin = createAdminClient()
  const [[resumo], cliente, assinatura, versao] = await Promise.all([
    resumirDocumentos(tenantId, [doc]),
    ler(admin.from('clients').select('name, document').eq('id', doc.client_id).single(), 'buscar o cliente'),
    doc.status === 'ASSINADO'
      ? ler(admin.from('document_signatures').select('signature_png, signer_name, signed_at, channel, conducted_by')
          .eq('issued_document_id', doc.id).maybeSingle(), 'buscar a assinatura')
      : Promise.resolve(null),
    doc.source === 'ARQUIVO' && doc.template_version_id
      ? ler(admin.from('document_template_versions').select('file_path').eq('id', doc.template_version_id).single(), 'buscar o arquivo do documento')
      : Promise.resolve(null),
  ])
  if (!cliente) return null
  let conduzidoPor: string | null = null
  if (assinatura?.conducted_by) {
    const u = await ler(admin.from('users').select('name').eq('id', assinatura.conducted_by).maybeSingle(), 'buscar quem conduziu')
    conduzidoPor = (u?.name as string) ?? null
  }
  return {
    resumo:    resumo!,
    clienteId: doc.client_id,
    cliente:   { nome: cliente.name as string, cpf: (cliente.document as string | null) ?? null },
    branchId:  doc.branch_id,
    conteudo:  doc.content,
    pdfUrl:    versao?.file_path ? await getSignedUrl(MODELOS_DE_DOCUMENTO_BUCKET, versao.file_path as string, 30 * 60) : null,
    hash:      doc.content_sha256,
    assinatura: assinatura
      ? {
          png:   (assinatura.signature_png as string | null) ?? null,
          nome:  assinatura.signer_name as string,
          em:    assinatura.signed_at as string,
          canal: assinatura.channel as string,
          conduzidoPor,
        }
      : null,
  }
}

/**
 * Os documentos ASSINADOS do cliente, para a linha do tempo da ficha e o
 * histórico do portal. Inclui o legado (os termos fixos do checkout antigo,
 * copiados de `consent_terms` pela migration 20260930000003).
 */
export async function assinadosDoCliente(
  tenantId: string | null, clientId: string,
): Promise<{ id: string; titulo: string; assinadoEm: string; canal: string | null; codigo: string | null }[]> {
  const admin = createAdminClient()
  let q = admin.from('issued_documents')
    .select('id, title, signed_at, verification_code, document_signatures(channel)')
    .eq('client_id', clientId).eq('status', 'ASSINADO')
  if (tenantId) q = q.eq('tenant_id', tenantId)
  const linhas = await ler(q.order('signed_at', { ascending: false }).limit(200), 'listar os documentos assinados do cliente')
  // A assinatura é 1:1 (issued_document_id único): o PostgREST devolve objeto.
  const canalDe = (s: unknown) => (s && typeof s === 'object' && 'channel' in s ? String((s as { channel: string }).channel) : null)
  return (linhas ?? []).map(l => ({
    id:         l.id as string,
    titulo:     l.title as string,
    assinadoEm: l.signed_at as string,
    canal:      canalDe(l.document_signatures),
    codigo:     (l.verification_code as string | null) ?? null,
  }))
}

/**
 * Os documentos do CLIENTE, vistos por ele no portal: os que pedem assinatura
 * e os assinados. Cancelado, dispensado e substituído não aparecem — não são
 * nada que ele precise fazer ou guardar.
 */
export async function documentosNoPortal(clientId: string): Promise<ResumoDeDocumento[]> {
  const admin = createAdminClient()
  const cliente = await ler(admin.from('clients').select('tenant_id').eq('id', clientId).maybeSingle(), 'buscar o cliente')
  if (!cliente?.tenant_id) return []
  const todos = await documentosDoCliente(cliente.tenant_id as string, clientId)
  return todos.filter(d => ['A_GERAR', 'INCOMPLETO', 'PENDENTE', 'ASSINADO'].includes(d.status))
}

/** Um documento do próprio cliente — ou null, se não for dele. */
export async function documentoDoClienteParaExibir(clientId: string, docId: string): Promise<DocumentoParaExibir | null> {
  if (!/^[0-9a-f-]{36}$/i.test(docId)) return null
  const admin = createAdminClient()
  const dono = await ler(admin.from('issued_documents').select('tenant_id, client_id, status')
    .eq('id', docId).eq('client_id', clientId).maybeSingle(), 'buscar o documento do cliente')
  if (!dono || ['CANCELADO', 'DISPENSADO', 'SUBSTITUIDO'].includes(dono.status as string)) return null
  // Montado de novo ao abrir: o cliente assina com os dados de agora.
  return documentoParaExibir(dono.tenant_id as string, docId, { montarDeNovo: dono.status !== 'ASSINADO' })
}
