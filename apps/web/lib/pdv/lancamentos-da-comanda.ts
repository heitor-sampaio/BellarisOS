import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { CHAVES_DA_VENDA, type VendaDaComanda } from '@/lib/pdv/parcelas-da-cliente'

/**
 * Os pagamentos de uma comanda paga que se estornam ali mesmo (A2 da 17ª
 * simulação; o bloco PDV: "Mantém, dentro da comanda: … o estorno e a
 * devolução"). São os lançamentos VIVOS e PAGOS de receita da comanda — na do
 * atendimento, o do atendimento e os dos produtos dela; na da venda e do plano,
 * os da venda — da unidade do PDV. O "Estornar" de cada um é o de sempre
 * (`AcoesDoLancamentoDaFicha` → `ConfirmarEstorno` → `reverseTransaction`, que
 * confere tudo de novo). Nada se soma aqui.
 */
export interface LancamentoDaComanda {
  id:             string
  descricao:      string
  valor:          number
  metodo:         string | null
  vezes:          number | null
  /** A1 da 19ª: a bandeira do cartão (a taxa depende dela). */
  bandeira:       string | null
  vendaDeProduto: boolean
  vendaDeCredito: boolean
  doAtendimento:  boolean
  /** A30 da 32ª: a parcela do crediário que ele é (1 de 2); nulo: não é parcela. */
  parcela:        { numero: number; total: number } | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function lancamentosDaComanda(
  admin: ReturnType<typeof createAdminClient>, tenantId: string, branchId: string, comandaId: string,
): Promise<LancamentoDaComanda[]> {
  const comanda = await ler(admin.from('comandas').select(['appointment_id', ...CHAVES_DA_VENDA].join(', '))
    .eq('id', comandaId).eq('tenant_id', tenantId).eq('branch_id', branchId).maybeSingle(), 'ler a comanda') as
    (VendaDaComanda & { appointment_id: string | null }) | null
  if (!comanda) return []
  const partes: string[] = []
  if (comanda.appointment_id && UUID.test(comanda.appointment_id)) {
    partes.push(`appointment_id.eq.${comanda.appointment_id}`)
    const itens = await ler(admin.from('comanda_itens').select('product_sale_id')
      .eq('comanda_id', comandaId).not('product_sale_id', 'is', null), 'ler os produtos da comanda') as { product_sale_id: string }[] | null
    const vendas = (itens ?? []).map(i => i.product_sale_id).filter(id => UUID.test(id))
    if (vendas.length) partes.push(`product_sale_id.in.(${vendas.join(',')})`)
  }
  for (const k of CHAVES_DA_VENDA) {
    const v = comanda[k]
    if (typeof v === 'string' && UUID.test(v)) partes.push(`${k}.eq.${v}`)
  }
  if (!partes.length) return []
  const linhas = await ler(admin.from('financial_transactions')
    .select('id, description, amount, payment_method, cartao_vezes, cartao_bandeira, appointment_id, product_sale_id, credito_vendido_id, parcela_numero, parcela_total')
    .eq('branch_id', branchId).eq('type', 'INCOME').eq('is_paid', true).is('estorno_de', null)
    .or('notes.is.null,notes.neq.Estornada')
    .or(partes.join(','))
    .order('paid_at', { ascending: true }).order('id'), 'ler os pagamentos da comanda') as {
      id: string; description: string | null; amount: number | string; payment_method: string | null; cartao_vezes: number | null; cartao_bandeira: string | null
      appointment_id: string | null; product_sale_id: string | null; credito_vendido_id: string | null
      parcela_numero: number | null; parcela_total: number | null
    }[] | null
  return (linhas ?? []).map(l => ({
    id: l.id, descricao: l.description ?? 'Pagamento', valor: Number(l.amount), metodo: l.payment_method, vezes: l.cartao_vezes, bandeira: l.cartao_bandeira,
    vendaDeProduto: !!l.product_sale_id, vendaDeCredito: !!l.credito_vendido_id, doAtendimento: !!l.appointment_id,
    parcela: l.parcela_numero && l.parcela_total ? { numero: l.parcela_numero, total: l.parcela_total } : null,
  }))
}
