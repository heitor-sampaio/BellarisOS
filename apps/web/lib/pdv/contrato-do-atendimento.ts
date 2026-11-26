import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { redeTemRecurso } from '@estetica-os/nucleo/lib/planos/da-rede'
import { descontoDoRetrato, frasesDoPagamento, pagamentoDoRetrato, type PagamentoDoPlano } from '@/lib/checkout/pagamento'
import { garantirRenderizado } from '@/lib/documentos/renderizar'
import { contratosAssinadosComPagamento } from '@/lib/documentos/plano'
import { mudaOCombinadoDoContrato } from './contrato-combinado'

/**
 * O contrato do PROCEDIMENTO no receber da comanda do atendimento (D1 da 33ª;
 * DG-03 e VD-10 do catálogo). O PDV recebe partindo do combinado (FP-02: o
 * meio combinado vem escolhido) e, quando o que se recebe muda o combinado de
 * um contrato JÁ ASSINADO, pergunta antes — como o plano (A45 da 5ª,
 * `contratoQueSeriaSubstituido`) e o pacote (`confirmarSubstituirContrato`).
 * Confirmado, o banco substitui o assinado na MESMA transação do dinheiro
 * (`confirmar_pagamento_do_atendimento`, `p_dados.substituir_contrato`, com o
 * `documento_substituir` de sempre), e o novo nasce com o combinado de agora
 * para a cliente assinar.
 */

/** O combinado do contrato do atendimento, para o receber partir dele (o meio, as vezes, o crediário e o desconto). */
export interface CombinadoDoContrato {
  metodo: string | null
  rotulo: string
  desconto: number
  /** O pagamento inteiro do retrato: a tela parte dele (as vezes do cartão, o crediário). */
  pagamento: PagamentoDoPlano | null
}

/**
 * O combinado do contrato vivo (não cancelado, substituído nem dispensado) do
 * atendimento, com o pagamento inteiro: a leitura de antes
 * (`pagamentoCombinadoDoAtendimento`, que saiu) levava só o meio, e o
 * "crédito 3x" voltava em 1x — o receber "como combinado" já mudava o contrato.
 */
export async function combinadoDoContratoDoAtendimento(tenantId: string, appointmentId: string): Promise<CombinadoDoContrato | null> {
  const linhas = await ler(createAdminClient().from('issued_documents').select('payment_snapshot')
    .eq('tenant_id', tenantId).eq('appointment_id', appointmentId).eq('kind', 'CONTRATO')
    .not('status', 'in', '(CANCELADO,SUBSTITUIDO,DISPENSADO)').not('payment_snapshot', 'is', null)
    .order('created_at', { ascending: false }).limit(1), 'buscar o pagamento combinado no contrato')
  const retrato = linhas?.[0]?.payment_snapshot
  if (retrato == null) return null
  const pagamento = pagamentoDoRetrato(retrato)
  const desconto = descontoDoRetrato(retrato)
  return { metodo: pagamento?.metodo ?? null, rotulo: frasesDoPagamento(pagamento, desconto), desconto, pagamento }
}

/**
 * O contrato ASSINADO do atendimento (que cita o pagamento) que este
 * recebimento mudaria — ou nulo. Devolve o título e o combinado por extenso,
 * para a pergunta ("O contrato “X” já foi assinado para outro pagamento (…)").
 */
export async function contratoQueMudaNoReceber(
  tenantId: string, appointmentId: string, pagamento: PagamentoDoPlano | null, desconto: number,
): Promise<{ id: string; titulo: string; pagamento: string } | null> {
  if (!(await redeTemRecurso(tenantId, 'documentos'))) return null
  // A mesma leitura do checkout do plano (os assinados que citam o pagamento).
  const c = (await contratosAssinadosComPagamento(tenantId, { atendimentoId: appointmentId }))
    .find(d => mudaOCombinadoDoContrato(d.payment_snapshot, pagamento, desconto))
  if (!c) return null
  return { id: c.id, titulo: c.title, pagamento: frasesDoPagamento(pagamentoDoRetrato(c.payment_snapshot), descontoDoRetrato(c.payment_snapshot)) }
}

/**
 * Depois do recebimento que substituiu o contrato: monta o texto do novo (o
 * banco já gravou nele o combinado de agora). Falhar aqui não desfaz o
 * recebimento: o novo fica "Em preparação" e se monta na primeira tela que o
 * abre (`garantirRenderizado`, com o retrato gravado).
 */
export async function montarOContratoNovo(tenantId: string, substituido: string): Promise<void> {
  try {
    const linha = await ler(createAdminClient().from('issued_documents').select('replaced_by')
      .eq('tenant_id', tenantId).eq('id', substituido).maybeSingle(), 'buscar o contrato novo') as { replaced_by: string | null } | null
    if (linha?.replaced_by) await garantirRenderizado(tenantId, linha.replaced_by)
  } catch (e) {
    console.error('[receber] montar o contrato novo', e instanceof Error ? e.message : e)
  }
}
