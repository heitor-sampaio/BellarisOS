import { createAdminClient } from '@/lib/supabase/admin'
import { lerTodas } from '@/lib/db'

/**
 * Os atendimentos CONCLUÍDOS a receber (D5 da simulação de 2026-10-27).
 *
 * A conta é uma só, no banco (`atendimentos_a_receber`): concluído, com
 * preço, avulso — sem plano, sem sessão de pacote, sem unidade pré-paga, que
 * já foram pagos na venda — e sem recebimento lançado. O de R$ 0 (a
 * avaliação) não entra: não tem o que receber (D9). É o mesmo conjunto que
 * `confirmar_pagamento_do_atendimento` aceita.
 *
 * Quem usa: a janela da agenda, o Fechamento do dia e a ficha da cliente.
 */
export interface AtendimentoAReceber {
  appointmentId:    string
  branchId:         string
  branchSlug:       string
  clientId:         string | null
  clientName:       string | null
  procedureId:      string | null
  procedureName:    string | null
  professionalName: string | null
  price:            number
  scheduledAt:      string
  completedAt:      string | null
}

export interface ListaAReceber {
  itens: AtendimentoAReceber[]
  /** Da lista inteira, contado no banco — a tela não soma. */
  total: { n: number; valor: number }
}

type Linha = {
  appointment_id: string; branch_id: string; branch_slug: string; client_id: string | null; client_name: string | null
  procedure_id: string | null; procedure_name: string | null; professional_name: string | null
  price: number | string; scheduled_at: string; completed_at: string | null
  total_n: number | string; total_valor: number | string | null
}

export async function getAtendimentosAReceber(args: {
  tenantId:        string
  unidadeId?:      string | null
  clienteId?:      string | null
  agendamentoId?:  string | null
  /** O "só os meus" do financeiro: os atendimentos deste profissional. */
  profissionalId?: string | null
}): Promise<ListaAReceber> {
  const linhas = await lerTodas<Linha>((de, ate) => createAdminClient()
    .rpc('atendimentos_a_receber', {
      p_tenant:       args.tenantId,
      p_unidade:      args.unidadeId ?? null,
      p_cliente:      args.clienteId ?? null,
      p_agendamento:  args.agendamentoId ?? null,
      p_profissional: args.profissionalId ?? null,
    })
    .order('completed_at').order('appointment_id')
    .range(de, ate), 'listar os atendimentos a receber')
  return {
    itens: linhas.map(l => ({
      appointmentId:    l.appointment_id,
      branchId:         l.branch_id,
      branchSlug:       l.branch_slug,
      clientId:         l.client_id,
      clientName:       l.client_name,
      procedureId:      l.procedure_id,
      procedureName:    l.procedure_name,
      professionalName: l.professional_name,
      price:            Number(l.price),
      scheduledAt:      l.scheduled_at,
      completedAt:      l.completed_at,
    })),
    total: { n: Number(linhas[0]?.total_n ?? 0), valor: Number(linhas[0]?.total_valor ?? 0) },
  }
}
