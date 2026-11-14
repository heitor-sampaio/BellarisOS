import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerTodas } from '@/lib/db'

/**
 * As comandas do PDV (PDV1/PDV2, a revisão do Heitor de 2026-11-13). A
 * situação sai do banco (`pdv_comandas`): aberta é a não cancelada sem o
 * lançamento vivo pago; paga, a que tem. Nada se conta aqui.
 */

import type { ComandaDoPdv, SituacaoDoPdv } from './situacoes'
export { SITUACOES_DO_PDV, situacaoDoPdv, type ComandaDoPdv, type SituacaoDoPdv } from './situacoes'

interface Linha {
  id: string; numero: number; origem: ComandaDoPdv['origem']; aberta_em: string; cancelada_em: string | null; cancelada_motivo: string | null
  client_id: string; cliente: string | null; appointment_id: string | null; procedimento: string | null
  profissional: string | null; agendado_para: string | null; atendimento_status: string | null
  valor: number | string; paga: boolean; paga_em: string | null; recebido: number | string | null; forma: string | null; estornada: boolean | null
}

/** As comandas de UMA unidade na situação pedida; a janela é a do dia (pagas e canceladas). */
export async function comandasDoPdv(args: {
  tenantId: string; branchId: string; situacao: SituacaoDoPdv; de: Date; ate: Date
}): Promise<ComandaDoPdv[]> {
  const admin = createAdminClient()
  const linhas = await lerTodas<Linha>((de, ate) => admin
    .rpc('pdv_comandas', {
      p_tenant: args.tenantId, p_branch: args.branchId, p_situacao: args.situacao,
      p_de: args.de.toISOString(), p_ate: args.ate.toISOString(),
    })
    .order('aberta_em', { ascending: false }).order('id')
    .range(de, ate), 'carregar as comandas do PDV')
  return linhas.map(l => ({
    id: l.id, numero: l.numero, origem: l.origem, abertaEm: l.aberta_em, canceladaEm: l.cancelada_em, canceladaMotivo: l.cancelada_motivo,
    clienteId: l.client_id, cliente: l.cliente ?? '—', agendamentoId: l.appointment_id,
    procedimento: l.procedimento, profissional: l.profissional, agendadoPara: l.agendado_para,
    atendimento: l.atendimento_status, valor: Number(l.valor), paga: l.paga, pagaEm: l.paga_em,
    recebido: l.recebido == null ? null : Number(l.recebido), forma: l.forma, estornada: !!l.estornada,
  }))
}
