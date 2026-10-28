import type { resumoDoFunil } from '@/lib/metrics/resultado'

/**
 * Os números do topo do quadro de Oportunidades (rede e unidade), já contados
 * por `resumoDoFunil` (lib/metrics). A conversão diz o que conta — quantos
 * viraram cliente de quantos estão no funil —, a mesma conta do dashboard e
 * dos Relatórios (D10 da simulação de 2026-10-28). Ganhos e perdidos só
 * aparecem quando o funil tem etapa de ganho ou de perda.
 */
export function ResumoDoQuadro({ stats }: { stats: ReturnType<typeof resumoDoFunil> }) {
  const pct = stats.conversaoPct === null ? null : stats.conversaoPct.toFixed(1).replace('.', ',')
  return (
    <>
      {stats.total} {stats.total === 1 ? 'lead' : 'leads'} no funil
      {stats.temGanho && ` · ${stats.ganhos} ${stats.ganhos === 1 ? 'ganho' : 'ganhos'}`}
      {stats.temPerda && ` · ${stats.perdidos} ${stats.perdidos === 1 ? 'perdido' : 'perdidos'}`}
      {pct !== null && ` · ${pct}% de conversão (${stats.convertidos} de ${stats.total} viraram clientes)`}
    </>
  )
}
