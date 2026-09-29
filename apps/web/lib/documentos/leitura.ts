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
}

const CATALOGO = VARIAVEIS_DE_DOCUMENTO as Record<string, { grupo: string; rotulo: string }>

export function rotuloDoQueFalta(variavel: string): string {
  const v = CATALOGO[variavel]
  return v ? `${v.grupo} · ${v.rotulo}` : variavel
}

async function resumir(tenantId: string, docs: DocumentoEmitido[]): Promise<ResumoDeDocumento[]> {
  if (!docs.length) return []
  const admin = createAdminClient()
  const montados = await renderizarPendentes(tenantId, docs)
  const agendamentos = [...new Set(montados.map(d => d.appointment_id).filter((x): x is string => !!x))]
  const procedimentos = [...new Set(montados.map(d => d.procedure_id).filter((x): x is string => !!x))]
  const assinados = montados.filter(d => d.status === 'ASSINADO').map(d => d.id)
  const [ags, procs, assins] = await Promise.all([
    agendamentos.length
      ? ler(admin.from('appointments').select('id, scheduled_at').in('id', agendamentos), 'buscar os agendamentos dos documentos')
      : Promise.resolve([]),
    procedimentos.length
      ? ler(admin.from('procedures').select('id, name').in('id', procedimentos), 'buscar os procedimentos dos documentos')
      : Promise.resolve([]),
    assinados.length
      ? ler(admin.from('document_signatures').select('issued_document_id, channel').in('issued_document_id', assinados), 'buscar as assinaturas')
      : Promise.resolve([]),
  ])
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
  }))
}

/** Todos os documentos do cliente, os abertos primeiro — a ficha. */
export async function documentosDoCliente(tenantId: string, clientId: string): Promise<ResumoDeDocumento[]> {
  const admin = createAdminClient()
  const docs = await ler(admin.from('issued_documents').select(COLUNAS_DO_DOCUMENTO)
    .eq('tenant_id', tenantId).eq('client_id', clientId)
    .neq('status', 'SUBSTITUIDO')
    .order('created_at', { ascending: false }).limit(200), 'listar os documentos do cliente')
  const resumo = await resumir(tenantId, (docs ?? []) as unknown as DocumentoEmitido[])
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
  return resumir(tenantId, (docs ?? []) as unknown as DocumentoEmitido[])
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
    resumir(tenantId, [doc]),
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
