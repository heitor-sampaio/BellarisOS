import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { redeTemRecurso } from '@estetica-os/nucleo/lib/planos/da-rede'
import { pagamentoNormalizado, mesmoPagamento, type PagamentoDoPlano } from '@/lib/checkout/pagamento'
import { garantirRenderizado, COLUNAS_DO_DOCUMENTO, type DocumentoEmitido } from './renderizar'

/**
 * Os documentos do FECHAMENTO do plano: um termo por procedimento distinto e o
 * contrato de plano da rede (§9.4.1).
 *
 * Nascem no checkout depois de escolhido o pagamento — o contrato o cita — e
 * a regra do "não fecha sem assinar" é conferida aqui, ANTES do primeiro
 * lançamento de dinheiro. O gatilho no plano é a segunda linha.
 */

type Contrato = Pick<DocumentoEmitido, 'id' | 'title' | 'template_version_id'> & { payment_snapshot: unknown }

async function contratosAssinadosComPagamento(tenantId: string, planId: string): Promise<Contrato[]> {
  const admin = createAdminClient()
  const assinados = await ler(admin.from('issued_documents')
    .select('id, title, template_version_id, payment_snapshot')
    .eq('tenant_id', tenantId).eq('treatment_plan_id', planId).is('appointment_id', null)
    .eq('status', 'ASSINADO').eq('kind', 'CONTRATO_PLANO'), 'buscar o contrato assinado do plano')
  const versoes = [...new Set((assinados ?? []).map(d => d.template_version_id as string | null).filter((x): x is string => !!x))]
  if (!versoes.length) return []
  const comPagamento = await ler(admin.from('document_template_versions')
    .select('id').in('id', versoes).eq('uses_payment', true), 'conferir quais contratos citam o pagamento')
  const citam = new Set((comPagamento ?? []).map(v => v.id as string))
  return ((assinados ?? []) as Contrato[]).filter(d => d.template_version_id && citam.has(d.template_version_id))
}

/**
 * Emite o que falta, troca o contrato já assinado com OUTRO pagamento (ele
 * fica substituído, com a assinatura, como prova) e monta o texto com o
 * pagamento escolhido. Devolve os documentos do plano.
 */
export async function prepararDocumentosDoPlano(
  tenantId: string, planId: string, pagamento: PagamentoDoPlano | null, ator: string | null,
  /** O desconto do checkout, em reais — parte do combinado que o contrato cita. */
  desconto = 0,
): Promise<DocumentoEmitido[]> {
  // Termos e contratos fora do plano da rede: o fechamento segue sem documento.
  if (!(await redeTemRecurso(tenantId, 'documentos'))) return []
  const admin = createAdminClient()
  await gravar(admin.rpc('documentos_emitir_do_plano', { p_plano: planId }), 'emitir os documentos do plano')

  const normalizado = pagamentoNormalizado(pagamento, desconto)
  for (const c of await contratosAssinadosComPagamento(tenantId, planId)) {
    if (!mesmoPagamento(c.payment_snapshot, normalizado)) {
      await gravar(admin.rpc('documento_substituir', { p_doc: c.id, p_tenant: tenantId, p_ator: ator }),
        'substituir o contrato assinado com outro pagamento')
    }
  }

  const docs = await ler(admin.from('issued_documents').select(COLUNAS_DO_DOCUMENTO)
    .eq('tenant_id', tenantId).eq('treatment_plan_id', planId).is('appointment_id', null)
    .not('status', 'in', '(CANCELADO,SUBSTITUIDO)')
    .order('kind').order('title'), 'listar os documentos do plano')

  const abertos = ['A_GERAR', 'INCOMPLETO', 'PENDENTE']
  return Promise.all(((docs ?? []) as unknown as DocumentoEmitido[]).map(async d =>
    abertos.includes(d.status)
      ? (await garantirRenderizado(tenantId, d.id, { forcar: true, pagamento: { valor: pagamento, desconto } })) ?? d
      : d,
  ))
}

/**
 * A recusa do checkout, ou null. Emite antes de conferir: quem chama a action
 * direto, sem ter passado pela documentação, não escapa por "ainda não havia
 * documento".
 */
export async function recusaDosDocumentosDoPlano(
  tenantId: string, planId: string, pagamento: PagamentoDoPlano | null, desconto = 0,
): Promise<string | null> {
  // Sem o módulo, ninguém assinaria nem dispensaria: não trava o checkout.
  if (!(await redeTemRecurso(tenantId, 'documentos'))) return null
  const admin = createAdminClient()
  await gravar(admin.rpc('documentos_emitir_do_plano', { p_plano: planId }), 'emitir os documentos do plano')
  const pendentes = await ler(admin.rpc('documentos_pendentes_do_plano', { p_plano: planId }), 'conferir os documentos do plano')
  const travam = ((pendentes ?? []) as { title: string; enforcement: string }[]).filter(p => p.enforcement === 'BLOQUEIA')
  if (travam.length) return `Falta assinar: ${travam.map(t => t.title).join(', ')}.`

  const normalizado = pagamentoNormalizado(pagamento, desconto)
  const divergente = (await contratosAssinadosComPagamento(tenantId, planId))
    .find(c => !mesmoPagamento(c.payment_snapshot, normalizado))
  if (divergente) {
    return 'A forma de pagamento ou o desconto são diferentes dos do contrato assinado. Volte à documentação para o cliente assinar o contrato com o pagamento de agora.'
  }
  return null
}
