import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { redeTemRecurso } from '@estetica-os/nucleo/lib/planos/da-rede'
import { pagamentoNormalizado, frasesDoPagamento, pagamentoDoRetrato, descontoDoRetrato, type PagamentoDoPlano } from '@/lib/checkout/pagamento'
import { garantirRenderizado, COLUNAS_DO_DOCUMENTO, type DocumentoEmitido } from './renderizar'
import { situacaoDoContratoDaVenda } from './contrato-da-venda'
import { rotuloDoQueFalta } from './leitura'
import { oQueFalta } from './o-que-falta'

/**
 * Os documentos da VENDA do pacote (PC2, Bloco Documentos leva 2): o contrato
 * de pacote ativo da rede e os documentos puxados dos procedimentos que
 * ficaram no pacote (DC1c). O gatilho da venda já os emitiu (A_GERAR); aqui
 * eles se montam com o pagamento da venda — o contrato o cita.
 *
 * O CONTRATO de pacote não nasce aqui: ele é colhido ANTES do dinheiro
 * (`contratoDaVendaDoPacote`, PC2 — o Heitor, 2026-11-13: "o ideal era
 * funcionar como no plano de tratamento"; do plano: "primeiro colhe
 * assinatura, depois paga"), e a venda o adota. Os termos e os outros
 * documentos não seguram o dinheiro: nascem aqui, e a tela da venda mostra o
 * que ficou para assinar.
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

/** O contrato da venda que falta colher, como a tela da venda o mostra. */
export interface ContratoParaAssinar {
  id: string
  titulo: string
  status: string
  /** Como a pessoa lê ("Endereço"). */
  faltando: string[]
  /** Variáveis opcionais que saíram vazias (D6 da 12ª), só aviso. */
  vazias: string[]
  /** Um link de assinatura vivo, até quando. */
  linkAte: string | null
  /**
   * A10 da 37ª (DQ-06, colher "pelo app"): a cliente tem o app e a rede tem o
   * portal no plano — a venda oferece o "Pedir no portal" (e diz se já pediu).
   * Nulo sem o app (A26 da 7ª) ou sem o portal no plano (C57a).
   */
  noPortal: { pedidoEm: string | null } | null
}

/**
 * O contrato de pacote ANTES do dinheiro (PC2, auditoria de 2026-11-18): a
 * venda pede, o banco devolve o contrato desta cliente e deste pacote (o
 * aberto, o assinado ou o dispensado — ou um novo, a montar), e aqui ele se
 * monta com o combinado da venda.
 *
 * - `null`: a venda segue — a rede não tem contrato de pacote ativo, ou ele
 *   está dispensado, ou assinado com este combinado.
 * - `assinar`: falta a assinatura (ou faltam dados): nada de dinheiro ainda.
 * - `substituir`: assinado com outro pagamento (ou noutra unidade); a venda
 *   pergunta antes de trocar (A45 da 5ª, como no plano). Com `substituir`
 *   confirmado, nasce um contrato novo — a assinar.
 */
export async function contratoDaVendaDoPacote(args: {
  tenantId: string; clienteId: string; pacoteId: string; unidadeId: string; ator: string | null
  pagamento: PagamentoDoPlano | null; desconto: number
  /** A resposta à pergunta de substituir: só troca o assinado que diverge do combinado. */
  substituir: boolean
}): Promise<null | { assinar: ContratoParaAssinar } | { substituir: { titulo: string; pagamento: string } }> {
  if (!(await redeTemRecurso(args.tenantId, 'documentos'))) return null
  const admin = createAdminClient()
  const pedir = async (substituir: boolean) => gravar(admin.rpc('documento_contrato_da_venda_do_pacote', {
    p_tenant: args.tenantId, p_cliente: args.clienteId, p_pacote: args.pacoteId,
    p_unidade: args.unidadeId, p_ator: args.ator, p_substituir: substituir,
  }), 'preparar o contrato da venda do pacote') as Promise<string | null>
  const lerContrato = async (id: string) => ler(admin.from('issued_documents')
    .select('id, title, status, branch_id, payment_snapshot, template_version_id')
    .eq('id', id).eq('tenant_id', args.tenantId).abortSignal(new AbortController().signal).maybeSingle(), 'ler o contrato da venda do pacote')

  let id = await pedir(false)
  if (!id) return null
  let doc = await lerContrato(id)
  if (!doc) return null
  const versao = doc.template_version_id
    ? await ler(admin.from('document_template_versions').select('uses_payment').eq('id', doc.template_version_id as string).maybeSingle(),
        'conferir se o contrato cita o pagamento')
    : null
  const combinado = pagamentoNormalizado(args.pagamento, args.desconto)
  const situacao = situacaoDoContratoDaVenda({
    status: doc.status as string, payment_snapshot: doc.payment_snapshot,
    branch_id: (doc.branch_id as string | null) ?? null, citaPagamento: versao?.uses_payment === true,
  }, combinado, args.unidadeId)
  if (situacao === 'VENDE') return null
  if (situacao === 'SUBSTITUIR') {
    if (!args.substituir) {
      return { substituir: {
        titulo: doc.title as string,
        pagamento: frasesDoPagamento(pagamentoDoRetrato(doc.payment_snapshot), descontoDoRetrato(doc.payment_snapshot)),
      } }
    }
    // Confirmado: o assinado fica guardado como substituído, e nasce um a assinar.
    id = await pedir(true)
    if (!id) return null
    doc = await lerContrato(id)
    if (!doc) return null
  }
  // Aberto: monta com o combinado DESTA venda (o que a cliente assina é o que se cobra — princípio 3).
  const montado = await garantirRenderizado(args.tenantId, id, { forcar: true, pagamento: { valor: args.pagamento, desconto: args.desconto } })
  const [link, portal, cliente, pedido] = await Promise.all([
    ler(admin.from('document_sign_links').select('expires_at')
      .eq('issued_document_id', id).is('used_at', null).is('revoked_at', null)
      .gt('expires_at', new Date().toISOString()).order('expires_at', { ascending: false }).limit(1).maybeSingle(),
      'buscar o link de assinatura do contrato'),
    redeTemRecurso(args.tenantId, 'portal'),
    ler(admin.from('clients').select('auth_id').eq('id', args.clienteId).eq('tenant_id', args.tenantId).maybeSingle(), 'ver se a cliente tem o app'),
    ler(admin.from('issued_documents').select('pedido_no_portal_em').eq('id', id).eq('tenant_id', args.tenantId).maybeSingle(), 'ver se o contrato já foi pedido no portal'),
  ])
  return { assinar: {
    id,
    titulo: (montado?.title ?? doc.title) as string,
    status: (montado?.status ?? doc.status) as string,
    faltando: oQueFalta((montado?.missing_fields ?? []).map(rotuloDoQueFalta)),
    vazias: montado?.vazias ?? [],
    linkAte: (link?.expires_at as string | undefined) ?? null,
    noPortal: portal && cliente?.auth_id ? { pedidoEm: (pedido?.pedido_no_portal_em as string | null | undefined) ?? null } : null,
  } }
}
