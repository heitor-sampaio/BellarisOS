import 'server-only'
import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { analisarMarcacao, interpolarArvore, formaCanonica, textoDaArvore } from './marcacao'
import { ehOpcional } from './variaveis'
import { valoresDoDocumento, type DadosDoDocumento } from './valores'
import { gerarCodigoDeVerificacao } from './codigo'

/**
 * Monta o texto de um documento emitido e grava.
 *
 * O gatilho do agendamento só cria a linha (A_GERAR): ele não sabe pôr ponto
 * em CPF nem escrever a data por extenso. Toda tela que MOSTRA um documento
 * chama `garantirRenderizado` antes — a ficha, a sessão, a tela de assinar.
 *
 * Enquanto não é assinado, o documento pode ser montado de novo (o cadastro do
 * cliente foi completado, virou o dia): o hash conferido na assinatura garante
 * que foi assinado exatamente o que foi mostrado.
 */

export type StatusDoDocumento = 'A_GERAR' | 'INCOMPLETO' | 'PENDENTE' | 'ASSINADO' | 'DISPENSADO' | 'CANCELADO' | 'SUBSTITUIDO'

export interface DocumentoEmitido {
  id:                  string
  tenant_id:           string
  branch_id:           string | null
  client_id:           string
  template_version_id: string | null
  appointment_id:      string | null
  treatment_plan_id:   string | null
  procedure_id:        string | null
  kind:                'TERMO' | 'CONTRATO' | 'CONTRATO_PLANO'
  source:              'EDITOR' | 'ARQUIVO'
  title:               string
  moment:              string
  enforcement:         'BLOQUEIA' | 'AVISA'
  status:              StatusDoDocumento
  content:             string | null
  content_sha256:      string | null
  missing_fields:      string[]
  verification_code:   string | null
  signed_at:           string | null
  closed_reason:       string | null
  created_at:          string
}

export const COLUNAS_DO_DOCUMENTO =
  'id, tenant_id, branch_id, client_id, template_version_id, appointment_id, treatment_plan_id, procedure_id, ' +
  'kind, source, title, moment, enforcement, status, content, content_sha256, missing_fields, ' +
  'verification_code, signed_at, closed_reason, created_at'

const ABERTOS: StatusDoDocumento[] = ['A_GERAR', 'INCOMPLETO', 'PENDENTE']

export function sha256(texto: string | Buffer): string {
  return createHash('sha256').update(texto).digest('hex')
}

/** Tudo que as variáveis de um documento de atendimento podem pedir. */
async function dadosDoDocumento(doc: DocumentoEmitido): Promise<DadosDoDocumento> {
  const admin = createAdminClient()
  const [cliente, rede, unidade, procedimento, agendamento] = await Promise.all([
    ler(admin.from('clients')
      .select('name, document, birth_date, phone, email, zip_code, address, address_number, address_complement, neighborhood, city, state')
      .eq('id', doc.client_id).eq('tenant_id', doc.tenant_id).single(), 'buscar o cliente do documento'),
    ler(admin.from('tenants').select('name, document, phone, email').eq('id', doc.tenant_id).single(), 'buscar a rede do documento'),
    doc.branch_id
      ? ler(admin.from('branches').select('name, document, address, city, state, phone')
          .eq('id', doc.branch_id).eq('tenant_id', doc.tenant_id).maybeSingle(), 'buscar a unidade do documento')
      : Promise.resolve(null),
    doc.procedure_id
      ? ler(admin.from('procedures').select('name').eq('id', doc.procedure_id).maybeSingle(), 'buscar o procedimento do documento')
      : Promise.resolve(null),
    doc.appointment_id
      ? ler(admin.from('appointments').select('scheduled_at, price, professional_id')
          .eq('id', doc.appointment_id).maybeSingle(), 'buscar o agendamento do documento')
      : Promise.resolve(null),
  ])
  let profissional: string | null = null
  if (agendamento?.professional_id) {
    const u = await ler(admin.from('users').select('name').eq('id', agendamento.professional_id).maybeSingle(), 'buscar o profissional')
    profissional = (u?.name as string) ?? null
  }
  return {
    agora:        new Date(),
    cliente:      cliente as DadosDoDocumento['cliente'],
    rede:         rede as DadosDoDocumento['rede'],
    unidade:      (unidade as DadosDoDocumento['unidade']) ?? null,
    procedimento: (procedimento as DadosDoDocumento['procedimento']) ?? null,
    agendamento:  agendamento
      ? { scheduled_at: agendamento.scheduled_at as string, price: agendamento.price as number, profissional }
      : null,
  }
}

/**
 * ⚠️ Com `abortSignal` de propósito: dentro de uma renderização o React
 * MEMORIZA `fetch` GET idênticos. A releitura depois de montar o documento é a
 * mesma URL da leitura de antes — sem o sinal, ela devolvia a resposta velha
 * (A_GERAR, sem texto) e a tela de assinar abria vazia. Fetch com sinal não é
 * memorizado.
 */
async function lerDocumento(tenantId: string, docId: string): Promise<DocumentoEmitido | null> {
  const admin = createAdminClient()
  const linha = await ler(admin.from('issued_documents').select(COLUNAS_DO_DOCUMENTO)
    .eq('id', docId).eq('tenant_id', tenantId).abortSignal(new AbortController().signal).maybeSingle(), 'buscar o documento')
  return (linha as unknown as DocumentoEmitido | null) ?? null
}

/**
 * Garante que o documento tem o texto montado. `forcar` monta de novo mesmo o
 * que já está PENDENTE — é o que a tela de assinar faz, para o cliente assinar
 * com os dados de agora.
 */
export async function garantirRenderizado(
  tenantId: string, docId: string, opcoes: { forcar?: boolean } = {},
): Promise<DocumentoEmitido | null> {
  const doc = await lerDocumento(tenantId, docId)
  if (!doc || !ABERTOS.includes(doc.status)) return doc
  if (doc.status === 'PENDENTE' && !opcoes.forcar) return doc
  if (!doc.template_version_id) return doc

  const admin = createAdminClient()
  const versao = await ler(admin.from('document_template_versions')
    .select('source, body_markup, file_sha256, file_name')
    .eq('id', doc.template_version_id).eq('tenant_id', tenantId).single(), 'buscar a versão do modelo')
  if (!versao) return doc

  let conteudo: string | null = null
  let texto: string
  let hash: string
  let faltando: string[] = []

  if (versao.source === 'EDITOR') {
    const valores = valoresDoDocumento(await dadosDoDocumento(doc))
    const r = interpolarArvore(analisarMarcacao(versao.body_markup as string), v => valores[v] ?? null, ehOpcional)
    conteudo = formaCanonica(r.arvore)
    texto = textoDaArvore(r.arvore)
    hash = sha256(conteudo)
    faltando = r.faltando
  } else {
    // O PDF enviado vai como está: o hash do documento é o hash do arquivo.
    texto = `Documento em PDF: ${versao.file_name ?? 'arquivo'}`
    hash = versao.file_sha256 as string
  }

  await gravar(admin.rpc('documento_registrar_render', {
    p_doc:      doc.id,
    p_tenant:   tenantId,
    p_status:   faltando.length ? 'INCOMPLETO' : 'PENDENTE',
    p_conteudo: conteudo,
    p_texto:    texto,
    p_sha256:   hash,
    p_faltando: faltando,
    p_codigo:   gerarCodigoDeVerificacao(),
  }), 'montar o documento')

  return lerDocumento(tenantId, docId)
}

/** Monta os que ainda não foram montados (ou ficaram incompletos) de uma lista. */
export async function renderizarPendentes(tenantId: string, docs: DocumentoEmitido[]): Promise<DocumentoEmitido[]> {
  return Promise.all(docs.map(async d => (
    d.status === 'A_GERAR' || d.status === 'INCOMPLETO'
      ? (await garantirRenderizado(tenantId, d.id)) ?? d
      : d
  )))
}
