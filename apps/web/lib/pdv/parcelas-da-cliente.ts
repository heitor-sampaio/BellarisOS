import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { textoDoVencimento } from '@/lib/financeiro/vencimentos'

/**
 * O que a cliente tem em aberto NO CAIXA desta unidade (CX1, o plano de
 * adaptação do PDV — o Heitor, 13/11: "abrir a cliente no PDV mostra as
 * parcelas em aberto dela, e recebe-se ali"): as parcelas do crediário e os
 * "a receber" das vendas. O atendimento a receber não entra — ele é a comanda
 * dele, na lista do PDV.
 *
 * Só a unidade do PDV (princípio 3): o dinheiro entra no caixa da unidade do
 * lançamento, e a tela não recebe aqui o que o Fechamento de outra unidade
 * conta. A ficha da cliente mostra os de todas.
 *
 * Nada se soma: cada linha é um lançamento, com o valor dele.
 */
export interface ParcelaEmAberto {
  id:         string
  valor:      number
  numero:     number | null
  total:      number | null
  descricao:  string | null
  /** "Vencida em 10/11", "Vence hoje", "Vence 10/12/2026" — ou nulo, sem data. */
  vencimento: string | null
  vencida:    boolean
}

export async function parcelasEmAbertoDaCliente({ branchId, clienteId, fuso }: {
  branchId: string; clienteId: string; fuso: string
}): Promise<ParcelaEmAberto[]> {
  const linhas = await ler(createAdminClient().from('financial_transactions')
    .select('id, amount, parcela_numero, parcela_total, description, due_date')
    .eq('branch_id', branchId).eq('client_id', clienteId).eq('type', 'INCOME').eq('is_paid', false)
    .is('appointment_id', null).is('estorno_de', null).gt('amount', 0)
    .or('notes.is.null,notes.neq.Estornada')
    .order('due_date', { ascending: true, nullsFirst: false }).order('parcela_numero', { ascending: true, nullsFirst: false }),
    'ler o que a cliente tem em aberto') as {
      id: string; amount: number | string; parcela_numero: number | null; parcela_total: number | null; description: string | null; due_date: string | null
    }[] | null
  return (linhas ?? []).map(l => {
    const vencimento = textoDoVencimento(l.due_date, new Date(), fuso)
    return {
      id: l.id, valor: Number(l.amount), numero: l.parcela_numero, total: l.parcela_total, descricao: l.description,
      vencimento, vencida: !!vencimento?.startsWith('Vencida'),
    }
  })
}
