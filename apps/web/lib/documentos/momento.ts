import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { COLUNAS_DO_DOCUMENTO, renderizarPendentes, type DocumentoEmitido } from './renderizar'
import { documentoParaExibir, rotuloDoQueFalta, type DocumentoParaExibir } from './leitura'
import type { DocumentoNaTela } from '@/components/shared/tela-de-assinatura'

/**
 * O MOMENTO de um documento (DC3/AG1/PC10, Bloco Documentos leva 2): o
 * agendamento, o pacote vendido ou o plano — e, de uma cliente só. É o que
 * vai junto num link e numa assinatura: "um link por cliente e momento, com
 * todos os documentos abertos dele".
 *
 * - `abertos`: os prontos para assinar (PENDENTE), já montados.
 * - `fora`: os que têm "faltam dados" (INCOMPLETO) — não entram, e a tela diz
 *   o que falta em cada um.
 *
 * Documento sem momento (o legado) anda sozinho.
 */

export interface ForaDaAssinatura { id: string; titulo: string; faltando: string[] }

export interface MomentoDoDocumento { abertos: DocumentoEmitido[]; fora: ForaDaAssinatura[] }

type Ancora = Pick<DocumentoEmitido, 'id' | 'client_id' | 'appointment_id' | 'treatment_plan_id'> & { client_package_id?: string | null }

export async function documentosDoMomento(tenantId: string, doc: Ancora): Promise<MomentoDoDocumento> {
  const admin = createAdminClient()
  let q = admin.from('issued_documents').select(COLUNAS_DO_DOCUMENTO)
    .eq('tenant_id', tenantId).eq('client_id', doc.client_id)
    .in('status', ['A_GERAR', 'INCOMPLETO', 'PENDENTE'])
  if (doc.appointment_id) q = q.eq('appointment_id', doc.appointment_id)
  else if (doc.client_package_id) q = q.eq('client_package_id', doc.client_package_id)
  else if (doc.treatment_plan_id) q = q.eq('treatment_plan_id', doc.treatment_plan_id).is('appointment_id', null)
  else q = q.eq('id', doc.id)
  const linhas = await ler(q.order('kind').order('title'), 'listar os documentos do momento') as unknown as DocumentoEmitido[] | null
  const montados = await renderizarPendentes(tenantId, linhas ?? [])
  return {
    abertos: montados.filter(d => d.status === 'PENDENTE'),
    fora: montados.filter(d => d.status === 'INCOMPLETO')
      .map(d => ({ id: d.id, titulo: d.title, faltando: (d.missing_fields ?? []).map(rotuloDoQueFalta) })),
  }
}

/** O documento como a tela de assinar o recebe. */
export function documentoNaTela(d: DocumentoParaExibir): DocumentoNaTela {
  return {
    id: d.resumo.id, titulo: d.resumo.titulo, tipo: d.resumo.tipo, status: d.resumo.status,
    faltando: d.resumo.faltando, codigo: d.resumo.codigo, motivo: d.resumo.motivo,
    cliente: { nome: d.cliente.nome, assinante: d.cliente.assinante },
    conteudo: d.conteudo, pdfUrl: d.pdfUrl, imagens: d.imagens, assinatura: d.assinatura,
  }
}

/** Os abertos de uma lista, montados de novo e prontos para a tela (assina-se com os dados de agora). */
export async function abertosNaTela(tenantId: string, ids: string[]): Promise<DocumentoNaTela[]> {
  const exibidos = await Promise.all(ids.map(id => documentoParaExibir(tenantId, id, { montarDeNovo: true })))
  return exibidos.filter((d): d is DocumentoParaExibir => !!d && d.resumo.status === 'PENDENTE').map(documentoNaTela)
}
