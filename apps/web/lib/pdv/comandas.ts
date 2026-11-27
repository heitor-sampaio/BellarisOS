import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerTodas } from '@/lib/db'
import { nomesDasMaquininhas } from '@/lib/financeiro/vezes-da-rede'
import { maquininhaDoRotulo } from '@/lib/financeiro/formas'

/**
 * As comandas do PDV (PDV1/PDV2, a revisão do Heitor de 2026-11-13). A
 * situação sai do banco (`pdv_comandas`): aberta é a não cancelada sem o
 * lançamento vivo pago; paga, a que tem. Nada se conta aqui.
 */

import type { ComandaDoPdv, EstornoAnteriorDaComanda, SituacaoDoPdv } from './situacoes'
import { pagaEmDaComanda } from './situacoes'
export { SITUACOES_DO_PDV, situacaoDoPdv, type ComandaDoPdv, type SituacaoDoPdv } from './situacoes'

interface Linha {
  id: string; numero: number; origem: ComandaDoPdv['origem']; aberta_em: string; cancelada_em: string | null; cancelada_motivo: string | null
  client_id: string; cliente: string | null; appointment_id: string | null; procedimento: string | null
  profissional: string | null; agendado_para: string | null; atendimento_status: string | null
  valor: number | string; paga: boolean; paga_em: string | null; recebido: number | string | null; forma: string | null; estornada: boolean | null
  treatment_plan_id: string | null
  em_aberto: number | string | null; parcelas_em_aberto: number | null; proxima_parcela: string | null; produtos: number | null
  ja_pago: number | string | null
  formas: { forma: string; vezes: number | null; valor: number | string; bandeira?: string | null; maquininha?: string | null }[] | null
  desconto: number | string | null; fidelidade: number | string | null; voucher: string | null
  estorno_anterior: {
    quando: string; valor: number | string; forma: string | null; vezes: number | null
    desconto: number | string | null; fidelidade: number | string | null; voucher: string | null
  } | null
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
  // A15 da 26ª: o nome da maquininha do cartão (só com mais de uma na rede).
  const maquininhas = linhas.some(l => l.formas?.some(f => f.maquininha)) ? await nomesDasMaquininhas(args.tenantId) : null
  // A2 da 38ª (princípio 3): a comanda quitada depois (a última parcela do crediário, o
  // a receber) diz a hora do último pagamento — `paga_em` é a do fechamento.
  const quitadas = linhas.filter(l => l.paga && l.origem !== 'VENDA' && !(Number(l.em_aberto ?? 0) > 0))
  const ultimo = new Map<string, string>()
  const guardar = (chave: string | null, quando: string | null) => {
    if (chave && quando && (!ultimo.has(chave) || Date.parse(quando) > Date.parse(ultimo.get(chave)!))) ultimo.set(chave, quando)
  }
  const emLotes = (xs: readonly string[]) => Array.from({ length: Math.ceil(xs.length / 150) }, (_, i) => xs.slice(i * 150, (i + 1) * 150))
  for (const [coluna, ids] of [
    ['appointment_id', [...new Set(quitadas.filter(l => l.origem === 'ATENDIMENTO').map(l => l.appointment_id).filter(Boolean) as string[])]],
    ['treatment_plan_id', [...new Set(quitadas.filter(l => l.origem === 'PLANO').map(l => l.treatment_plan_id).filter(Boolean) as string[])]],
  ] as const) {
    for (const lote of emLotes(ids)) {
      const pagos = await lerTodas<{ appointment_id: string | null; treatment_plan_id: string | null; paid_at: string | null }>((de, ate) => admin
        .from('financial_transactions').select('appointment_id, treatment_plan_id, paid_at, branches!inner(tenant_id)')
        .eq('branches.tenant_id', args.tenantId).in(coluna, lote)
        .eq('type', 'INCOME').eq('is_paid', true).is('estorno_de', null)
        .or('notes.is.null,notes.neq.Estornada')
        .order('id').range(de, ate), 'ler o último pagamento das comandas')
      for (const t of pagos) guardar(coluna === 'appointment_id' ? t.appointment_id : t.treatment_plan_id, t.paid_at)
    }
  }
  return linhas.map(l => ({
    id: l.id, numero: l.numero, origem: l.origem, abertaEm: l.aberta_em, canceladaEm: l.cancelada_em, canceladaMotivo: l.cancelada_motivo,
    clienteId: l.client_id, cliente: l.cliente ?? '—', agendamentoId: l.appointment_id,
    procedimento: l.procedimento, profissional: l.profissional, agendadoPara: l.agendado_para,
    atendimento: l.atendimento_status, valor: Number(l.valor), paga: l.paga,
    pagaEm: pagaEmDaComanda({ paga: l.paga, origem: l.origem, emAberto: Number(l.em_aberto ?? 0), pagaEm: l.paga_em },
      ultimo.get((l.origem === 'PLANO' ? l.treatment_plan_id : l.appointment_id) ?? '')),
    recebido: l.recebido == null ? null : Number(l.recebido), forma: l.forma, estornada: !!l.estornada,
    planoId: l.treatment_plan_id,
    emAberto: Number(l.em_aberto ?? 0), parcelasEmAberto: l.parcelas_em_aberto ?? 0, proximaParcela: l.proxima_parcela, produtos: l.produtos ?? 0,
    jaPago: Number(l.ja_pago ?? 0),
    // D3, A1 e A2 da 17ª: as formas, os descontos e o estorno anterior (do banco).
    // A1 da 19ª: e a bandeira do cartão.
    formas: (l.formas ?? []).map(f => ({ forma: f.forma, vezes: Number(f.vezes ?? 1), valor: Number(f.valor), bandeira: f.bandeira ?? null, maquininha: maquininhaDoRotulo(maquininhas, f.maquininha) })),
    desconto: Number(l.desconto ?? 0), fidelidade: Number(l.fidelidade ?? 0), voucher: l.voucher ?? null,
    estornoAnterior: l.estorno_anterior ? {
      quando: l.estorno_anterior.quando, valor: Number(l.estorno_anterior.valor), forma: l.estorno_anterior.forma,
      vezes: Number(l.estorno_anterior.vezes ?? 1), desconto: Number(l.estorno_anterior.desconto ?? 0),
      fidelidade: Number(l.estorno_anterior.fidelidade ?? 0), voucher: l.estorno_anterior.voucher ?? null,
    } satisfies EstornoAnteriorDaComanda : null,
  }))
}
