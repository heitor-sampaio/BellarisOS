import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import type { SituacaoDoDocumento, TipoDeDocumento } from '@/lib/documentos/situacao'

/**
 * A tela de Documentos (2026-10-14): os termos e contratos emitidos, com a
 * situação de cada um, e os números do topo. A situação e as contagens são do
 * Postgres (`documentos_emitidos*`, migration `20261014000002`); aqui só se
 * pede a página e o resumo.
 */

export const DOCUMENTOS_POR_PAGINA = 50

export interface DocumentoNoPainel {
  id:            string
  titulo:        string
  tipo:          TipoDeDocumento
  status:        string
  situacao:      SituacaoDoDocumento
  exigencia:     'BLOQUEIA' | 'AVISA'
  faltando:      string[]
  clienteId:     string
  cliente:       string | null
  branchId:      string | null
  procedimento:  string | null
  agendamentoEm: string | null
  planoId:       string | null
  criadoEm:      string
  assinadoEm:    string | null
  /** Onde foi assinado: CLINICA, PORTAL, LINK, PAPEL. */
  canal:         string | null
  /** O envio mais recente: LINK_GERADO, NOTIFICADO_PORTAL, LINK_ENVIADO_CONVERSA. */
  envio:         string | null
  enviadoEm:     string | null
  /** O cliente abriu (identidade conferida no link). */
  abertoEm:      string | null
  /** Link de assinatura valendo: até quando. */
  linkAte:       string | null
  motivo:        string | null
  codigo:        string | null
}

export interface ResumoDosDocumentos {
  total: number; abertos: number; faltamDados: number; aEnviar: number; enviados: number
  assinados: number; dispensados: number; cancelados: number
}

/**
 * `professionalId`: o prontuário "só os meus" (decisão do Heitor, 2026-10-29)
 * — só os documentos das clientes que ela atende (um agendamento com ela).
 * Nulo = sem recorte. Obrigatório de propósito: quem chama decide.
 */
interface Recorte { tenantId: string; branchIds: string[] | null; from: Date; to: Date; professionalId: string | null }

type Linha = Record<string, unknown> & { total?: number | string }

const daLinha = (l: Linha): DocumentoNoPainel => ({
  id: l.id as string, titulo: l.titulo as string, tipo: l.tipo as TipoDeDocumento, status: l.status as string,
  situacao: l.situacao as SituacaoDoDocumento, exigencia: l.exigencia as DocumentoNoPainel['exigencia'],
  faltando: (l.faltando as string[] | null) ?? [], clienteId: l.cliente_id as string, cliente: (l.cliente as string | null) ?? null,
  branchId: (l.branch_id as string | null) ?? null, procedimento: (l.procedimento as string | null) ?? null,
  agendamentoEm: (l.agendamento_em as string | null) ?? null, planoId: (l.plano_id as string | null) ?? null,
  criadoEm: l.criado_em as string, assinadoEm: (l.assinado_em as string | null) ?? null,
  canal: (l.canal as string | null) ?? null, envio: (l.envio as string | null) ?? null,
  enviadoEm: (l.enviado_em as string | null) ?? null, abertoEm: (l.aberto_em as string | null) ?? null,
  linkAte: (l.link_ate as string | null) ?? null, motivo: (l.motivo as string | null) ?? null,
  codigo: (l.codigo as string | null) ?? null,
})

export async function getDocumentosDoPainel(r: Recorte & {
  situacao?: SituacaoDoDocumento | null; tipo?: TipoDeDocumento | null; busca?: string | null; offset?: number
}): Promise<{ linhas: DocumentoNoPainel[]; total: number }> {
  const linhas = await ler(createAdminClient().rpc('documentos_emitidos_pagina', {
    p_tenant: r.tenantId, p_branch_ids: r.branchIds, p_from: r.from.toISOString(), p_to: r.to.toISOString(),
    p_professional_id: r.professionalId,
    p_situacao: r.situacao ?? null, p_tipo: r.tipo ?? null, p_busca: r.busca?.trim() || null,
    p_limite: DOCUMENTOS_POR_PAGINA, p_offset: r.offset ?? 0,
  }), 'carregar os documentos') as Linha[] | null
  return { linhas: (linhas ?? []).map(daLinha), total: Number(linhas?.[0]?.total ?? 0) }
}

export async function getResumoDosDocumentos(r: Recorte): Promise<ResumoDosDocumentos> {
  const linhas = await ler(createAdminClient().rpc('documentos_emitidos_resumo', {
    p_tenant: r.tenantId, p_branch_ids: r.branchIds, p_from: r.from.toISOString(), p_to: r.to.toISOString(),
    p_professional_id: r.professionalId,
  }), 'resumir os documentos') as Record<string, number | string>[] | null
  const l = linhas?.[0] ?? {}
  const n = (k: string) => Number(l[k] ?? 0)
  return {
    total: n('total'), abertos: n('abertos'), faltamDados: n('faltam_dados'), aEnviar: n('a_enviar'),
    enviados: n('enviados'), assinados: n('assinados'), dispensados: n('dispensados'), cancelados: n('cancelados'),
  }
}
