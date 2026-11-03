import 'server-only'
import { formatBRL, maskCPF } from '@estetica-os/utils'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import type { PdfDoc } from '@/lib/pdf'
import { rotuloDaForma } from '@/lib/financeiro/formas'
import { descontosDosLancamentos } from '@/lib/financeiro/desconto-do-lancamento'

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

const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
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
  const [tx, unidade, rede, cliente] = await Promise.all([
    ler(admin.from('financial_transactions')
      .select('id, description, amount, payment_method, cartao_vezes, paid_at, sale_discount, desconto_motivo, product_sale_id, client_package_id, procedure_sale_id, treatment_plan_id')
      .eq('id', l.id).single(), 'ler o lançamento do recibo'),
    ler(admin.from('branches').select('name, document, address, city, state, phone').eq('id', l.branchId).single(), 'ler a unidade do recibo'),
    ler(admin.from('tenants').select('name, document').eq('id', l.tenantId).single(), 'ler a clínica do recibo'),
    l.clientId
      ? ler(admin.from('clients').select('name, document, documento_tipo, documento_numero').eq('id', l.clientId).maybeSingle(), 'ler a cliente do recibo')
      : Promise.resolve(null),
  ])
  if (!tx || !unidade || !rede) throw new Error('Não consegui montar o recibo.')

  const descontos = await descontosDosLancamentos([tx as typeof tx & { id: string }])
  const doc = cliente?.document ? `CPF ${maskCPF(String(cliente.document))}`
    : cliente?.documento_numero ? `${cliente.documento_tipo === 'RNE' ? 'RNE' : 'Passaporte'} ${String(cliente.documento_numero)}` : null
  const numero = String(tx.id).slice(0, 8).toUpperCase()

  const pagamento: [string, string][] = [
    ['Recibo nº', numero],
    ['Recebemos de', String(cliente?.name ?? 'Cliente não identificada')],
    ...(doc ? [['Documento', doc] as [string, string]] : []),
    ['A quantia de', formatBRL(Number(tx.amount))],
    ['Referente a', String(tx.description ?? '—')],
    ['Forma de pagamento', tx.payment_method ? rotuloDaForma(String(tx.payment_method), (tx.cartao_vezes as number | null) ?? null) : 'Sem forma (pontos)'],
    ['Pago em', tx.paid_at ? dataHora(String(tx.paid_at)) : '—'],
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
      footer: `Emitido pelo BellarisOS em ${dataHora(new Date().toISOString())}. Este recibo não substitui a nota fiscal.`,
    },
  }
}
