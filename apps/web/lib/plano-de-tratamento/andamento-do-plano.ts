import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler, lerTodas } from '@/lib/db'
import { redeTemRecurso } from '@estetica-os/nucleo/lib/planos/da-rede'
import { situacaoComercialDoPlano, type SituacaoComercial } from './situacao'

/**
 * O que se lê do banco para a situação de um plano aceito (PT1a/PT1f, Bloco
 * Plano de tratamento): os documentos dele, o contrato de plano e se o
 * dinheiro já entrou. Quem chama já conferiu a rede, o alcance e o "só os
 * meus" (é dado do servidor; nada vai à tela sem passar por eles).
 *
 * Sem dado clínico: só título, tipo e situação dos documentos.
 */

const ABERTOS = ['A_GERAR', 'INCOMPLETO', 'PENDENTE'] as const
const FEITOS  = ['ASSINADO', 'DISPENSADO'] as const

export interface DocumentosDoPlano {
  /** Os documentos do plano que não são o contrato (termos, outros). */
  total: number
  assinados: number
  abertos: number
  /** "Faltam dados do cadastro": não entram no link até o cadastro ter o dado. */
  faltamDados: number
}

export type SituacaoDoContrato =
  | 'SEM_CONTRATO'   // a rede não tem contrato de plano ativo (ou não tem Documentos)
  | 'NO_PDV'         // ainda não emitido: sai no PDV, com a forma de pagamento
  | 'FALTA_ASSINAR'
  | 'ASSINADO'
  | 'DISPENSADO'

export interface AndamentoDoPlano {
  documentos: DocumentosDoPlano
  contrato: SituacaoDoContrato
  recebido: boolean
}

function emLotes<T>(lista: T[], tamanho = 150): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho))
  return lotes
}

/** O andamento comercial de cada plano (só os ids pedidos, todos da rede `tenantId`). */
export async function andamentoDosPlanos(tenantId: string, planIds: string[]): Promise<Map<string, AndamentoDoPlano>> {
  const admin = createAdminClient()
  const mapa = new Map<string, AndamentoDoPlano>()
  for (const id of planIds) {
    mapa.set(id, { documentos: { total: 0, assinados: 0, abertos: 0, faltamDados: 0 }, contrato: 'SEM_CONTRATO', recebido: false })
  }
  if (!planIds.length) return mapa

  const temDocumentos = await redeTemRecurso(tenantId, 'documentos')
  const contratoAtivo = temDocumentos && ((await ler(admin.from('document_templates').select('id')
    .eq('tenant_id', tenantId).eq('kind', 'CONTRATO_PLANO').eq('is_active', true).limit(1), 'conferir o contrato de plano da rede')) ?? []).length > 0

  type Doc = { treatment_plan_id: string; kind: string; status: string }
  type Tx  = { treatment_plan_id: string }
  for (const lote of emLotes(planIds)) {
    const [docs, recebidos] = await Promise.all([
      temDocumentos
        ? lerTodas<Doc>((de, ate) => admin.from('issued_documents').select('treatment_plan_id, kind, status')
            .eq('tenant_id', tenantId).in('treatment_plan_id', lote).is('appointment_id', null)
            .in('status', [...ABERTOS, ...FEITOS]).order('id').range(de, ate), 'ler os documentos dos planos')
        : Promise.resolve([] as Doc[]),
      // "Recebido" é o que o PDV já lançou do plano (à vista ou no crediário):
      // a mesma régua do `getResumoDoPlano` (um lançamento de receita vivo).
      lerTodas<Tx>((de, ate) => admin.from('financial_transactions').select('treatment_plan_id')
        .in('treatment_plan_id', lote).eq('type', 'INCOME').is('estorno_de', null)
        .or('notes.is.null,notes.neq.Estornada').order('id').range(de, ate), 'ler o recebido dos planos'),
    ])
    for (const t of recebidos) { const a = mapa.get(t.treatment_plan_id); if (a) a.recebido = true }
    const contratoDe = new Map<string, Set<string>>()
    for (const d of docs) {
      const a = mapa.get(d.treatment_plan_id)
      if (!a) continue
      if (d.kind === 'CONTRATO_PLANO') {
        const s = contratoDe.get(d.treatment_plan_id) ?? new Set<string>()
        s.add(d.status); contratoDe.set(d.treatment_plan_id, s)
        continue
      }
      a.documentos.total += 1
      if ((FEITOS as readonly string[]).includes(d.status)) a.documentos.assinados += 1
      else a.documentos.abertos += 1
      if (d.status === 'INCOMPLETO') a.documentos.faltamDados += 1
    }
    for (const id of lote) {
      const a = mapa.get(id)!
      const s = contratoDe.get(id)
      a.contrato = s?.has('ASSINADO') ? 'ASSINADO'
        : s?.has('DISPENSADO') ? 'DISPENSADO'
        : s && [...s].some(x => (ABERTOS as readonly string[]).includes(x)) ? 'FALTA_ASSINAR'
        : contratoAtivo ? 'NO_PDV'
        : 'SEM_CONTRATO'
    }
  }
  return mapa
}

/** A situação de cada plano (PT1f), lendo o banco só para os aceitos. */
export async function situacoesDosPlanos(
  tenantId: string, planos: { id: string; status: string }[],
): Promise<Map<string, SituacaoComercial>> {
  const aceitos = planos.filter(p => p.status === 'ACCEPTED').map(p => p.id)
  const andamento = await andamentoDosPlanos(tenantId, aceitos)
  const mapa = new Map<string, SituacaoComercial>()
  for (const p of planos) {
    const a = andamento.get(p.id)
    mapa.set(p.id, situacaoComercialDoPlano({
      status: p.status,
      recebido: a?.recebido ?? false,
      documentosAbertos: a?.documentos.abertos ?? 0,
      contratoFalta: a ? a.contrato === 'NO_PDV' || a.contrato === 'FALTA_ASSINAR' : false,
    }))
  }
  return mapa
}
