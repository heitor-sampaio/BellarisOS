import 'server-only'
import { formatBRL, maskCPF } from '@estetica-os/utils'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import type { PdfDoc } from '@/lib/pdf'
import { rotuloDaForma } from '@/lib/financeiro/formas'
import { descontosDosLancamentos } from '@/lib/financeiro/desconto-do-lancamento'
import { parcelasEmTexto } from '@/lib/checkout/resumo-do-pagamento'
import { fusoDaUnidade } from '@/lib/unidades/fuso-da-unidade'

/**
 * O RECIBO de um pagamento (ven-06 da revisão, 2026-11-02; o Heitor: "Um
 * recibo simples em PDF, pelo app ou impresso"). "A Carla pede recibo e a
 * Bruna não tem o que imprimir."
 *
 * Só do lançamento de RECEITA PAGO e vivo (sem estorno): do a receber não se
 * dá recibo, e o estornado foi devolvido. O texto sai do lançamento como ele
 * está gravado — quem pagou, quanto, o quê, como e quando — e da unidade que
 * recebeu. Não é nota fiscal, e diz isso.
 *
 * Quem pode tirar é da rota (`app/api/recibos/[id]`): aqui só se monta.
 */
export interface LancamentoDoRecibo {
  id: string; tenantId: string; branchId: string; clientId: string | null
}

// No relógio da unidade que recebeu (F62b); sem ela, Brasília.
const dataHora = (iso: string, fuso = 'America/Sao_Paulo') => new Date(iso).toLocaleString('pt-BR', {
  timeZone: fuso, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

/** O lançamento que pode ter recibo (pago, receita, vivo), ou nulo. */
export async function lancamentoDoRecibo(id: string): Promise<LancamentoDoRecibo | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const tx = await ler(createAdminClient().from('financial_transactions')
    .select('id, branch_id, client_id, type, category, is_paid, notes, branches!inner(tenant_id)')
    .eq('id', id).maybeSingle(), 'buscar o lançamento do recibo')
  if (!tx || tx.type !== 'INCOME' || !tx.is_paid || tx.notes === 'Estornada' || tx.category === 'Estorno') return null
  return {
    id: tx.id as string,
    tenantId: (tx.branches as unknown as { tenant_id: string }).tenant_id,
    branchId: tx.branch_id as string,
    clientId: (tx.client_id as string | null) ?? null,
  }
}

/** O recibo, pronto para `buildPdf`. */
export async function reciboDoLancamento(l: LancamentoDoRecibo): Promise<{ doc: PdfDoc; arquivo: string }> {
  const admin = createAdminClient()
  const fuso = await fusoDaUnidade(l.tenantId, l.branchId)
  const [tx, unidade, rede, cliente] = await Promise.all([
    ler(admin.from('financial_transactions')
      .select('id, description, amount, payment_method, cartao_vezes, cartao_bandeira, paid_at, sale_discount, desconto_motivo, product_sale_id, client_package_id, procedure_sale_id, treatment_plan_id, appointment_id')
      .eq('id', l.id).single(), 'ler o lançamento do recibo'),
    ler(admin.from('branches').select('name, document, address, city, state, phone').eq('id', l.branchId).single(), 'ler a unidade do recibo'),
    ler(admin.from('tenants').select('name, document').eq('id', l.tenantId).single(), 'ler a clínica do recibo'),
    l.clientId
      ? ler(admin.from('clients').select('name, document, documento_tipo, documento_numero').eq('id', l.clientId).maybeSingle(), 'ler a cliente do recibo')
      : Promise.resolve(null),
  ])
  if (!tx || !unidade || !rede) throw new Error('Não consegui montar o recibo.')

  // A43 da 7ª simulação: o recibo do atendimento dizia só "Atendimento concluído"
  // (a descrição do lançamento). O que foi pago é o procedimento daquele
  // atendimento, em que dia e com quem.
  const atendimento = tx.appointment_id
    ? await ler(admin.from('appointments')
        .select('scheduled_at, procedures(name), users!appointments_professional_id_fkey(name)')
        .eq('id', String(tx.appointment_id)).maybeSingle(), 'ler o atendimento do recibo')
    : null
  const procedimento = (atendimento?.procedures as unknown as { name?: string } | null)?.name ?? 'Atendimento'
  const profissional = (atendimento?.users as unknown as { name?: string } | null)?.name ?? null
  const referente = atendimento
    ? `${procedimento} — atendimento de ${dataHora(String(atendimento.scheduled_at), fuso).replace(', ', ' às ')}${profissional ? `, com ${profissional}` : ''}`
    : String(tx.description ?? '—')
  const vezes = (tx.cartao_vezes as number | null) ?? null
  const parcelasDoCartao = tx.payment_method === 'CREDIT_CARD' && vezes && vezes > 1 ? parcelasEmTexto(Number(tx.amount), vezes) : null
  const descontos = await descontosDosLancamentos([tx as typeof tx & { id: string }])
  const doc = cliente?.document ? `CPF ${maskCPF(String(cliente.document))}`
    : cliente?.documento_numero ? `${cliente.documento_tipo === 'RNE' ? 'RNE' : 'Passaporte'} ${String(cliente.documento_numero)}` : null
  const numero = String(tx.id).slice(0, 8).toUpperCase()

  const pagamento: [string, string][] = [
    ['Recibo nº', numero],
    ['Recebemos de', String(cliente?.name ?? 'Cliente não identificada')],
    ...(doc ? [['Documento', doc] as [string, string]] : []),
    ['A quantia de', formatBRL(Number(tx.amount))],
    ['Referente a', referente],
    // A39: com a bandeira ("Crédito Visa 5x").
    ['Forma de pagamento', tx.payment_method ? rotuloDaForma(String(tx.payment_method), (tx.cartao_vezes as number | null) ?? null, { bandeira: (tx.cartao_bandeira as string | null) ?? null }) : 'Sem forma (pontos)'],
    // As vezes na maquininha: o que a cliente vê na fatura do cartão (A43).
    ...(parcelasDoCartao ? [['Parcelas no cartão', parcelasDoCartao] as [string, string]] : []),
    ['Pago em', tx.paid_at ? dataHora(String(tx.paid_at), fuso) : '—'],
    ...(descontos[String(tx.id)] ? [['Desconto', descontos[String(tx.id)]!.replace(/^Desconto ?·? ?/, '')] as [string, string]] : []),
  ]
  const emitente: [string, string][] = [
    ['Clínica', String(rede.name)],
    ['Unidade', String(unidade.name)],
    ...(unidade.document || rede.document ? [['CNPJ/CPF', String(unidade.document ?? rede.document)] as [string, string]] : []),
    ...(unidade.address ? [['Endereço', [unidade.address, unidade.city, unidade.state].filter(Boolean).join(', ')] as [string, string]] : []),
    ...(unidade.phone ? [['Telefone', String(unidade.phone)] as [string, string]] : []),
  ]
  return {
    arquivo: `recibo-${numero.toLowerCase()}.pdf`,
    doc: {
      title: 'Recibo',
      subtitle: `${String(rede.name)} — ${String(unidade.name)}`,
      sections: [{ fields: pagamento }, { title: 'Quem recebeu', fields: emitente }],
      footer: `Emitido pelo BellarisOS em ${dataHora(new Date().toISOString(), fuso)}. Este recibo não substitui a nota fiscal.`,
    },
  }
}
