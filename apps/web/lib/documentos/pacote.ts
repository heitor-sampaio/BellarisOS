import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { redeTemRecurso } from '@estetica-os/nucleo/lib/planos/da-rede'
import type { PagamentoDoPlano } from '@/lib/checkout/pagamento'
import { garantirRenderizado, COLUNAS_DO_DOCUMENTO, type DocumentoEmitido } from './renderizar'

/**
 * Os documentos da VENDA do pacote (PC2, Bloco Documentos leva 2): o contrato
 * de pacote ativo da rede e os documentos puxados dos procedimentos que
 * ficaram no pacote (DC1c). O gatilho da venda já os emitiu (A_GERAR); aqui
 * eles se montam com o pagamento da venda — o contrato o cita.
 *
 * A venda NÃO espera a assinatura (decidido pelos princípios 2 e 6: o "a
 * assinatura antes do dinheiro" do Heitor, PT1c, foi dito do PLANO; para o
 * pacote nada foi dito — avisar, não travar). A tela da venda mostra o que
 * ficou para assinar.
 */
export async function prepararDocumentosDoPacote(
  tenantId: string, pacoteVendido: string, pagamento: PagamentoDoPlano | null,
  /** O desconto da venda, em reais — parte do combinado que o contrato cita. */
  desconto = 0,
): Promise<DocumentoEmitido[]> {
  if (!(await redeTemRecurso(tenantId, 'documentos'))) return []
  const admin = createAdminClient()
  // O gatilho emite na venda; chamar de novo só completa o que faltar.
  await gravar(admin.rpc('documentos_emitir_do_pacote', { p_pacote_vendido: pacoteVendido }), 'emitir os documentos do pacote')
  const docs = await ler(admin.from('issued_documents').select(COLUNAS_DO_DOCUMENTO)
    .eq('tenant_id', tenantId).eq('client_package_id', pacoteVendido)
    .not('status', 'in', '(CANCELADO,SUBSTITUIDO)')
    .order('kind').order('title'), 'listar os documentos do pacote')
  const abertos = ['A_GERAR', 'INCOMPLETO', 'PENDENTE']
  return Promise.all(((docs ?? []) as unknown as DocumentoEmitido[]).map(async d =>
    abertos.includes(d.status)
      ? (await garantirRenderizado(tenantId, d.id, { forcar: true, pagamento: { valor: pagamento, desconto } })) ?? d
      : d,
  ))
}
