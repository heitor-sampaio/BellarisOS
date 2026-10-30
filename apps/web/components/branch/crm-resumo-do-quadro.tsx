import type { resumoDoFunil } from '@/lib/metrics/resultado'

/**
 * Os números do topo do quadro de Oportunidades (rede e unidade), já contados
 * por `resumoDoFunil` (lib/metrics). A conversão é da OPORTUNIDADE — quantas
 * chegaram à etapa de ganho de quantas estão no funil (decisão do Heitor,
 * 2026-10-29) —, a mesma conta do dashboard e dos Relatórios. Funil sem etapa
 * de ganho não tem conversão: "—". Ganhos e perdidos só aparecem quando o
 * funil tem etapa de ganho ou de perda; "já é cliente" é filtro, não número.
 */
export function ResumoDoQuadro({ stats }: { stats: ReturnType<typeof resumoDoFunil> }) {
  const pct = stats.conversaoPct === null ? null : stats.conversaoPct.toFixed(1).replace('.', ',')
  return (
    <>
      {stats.total} {stats.total === 1 ? 'lead' : 'leads'} no funil
      {stats.temGanho && ` · ${stats.ganhos} ${stats.ganhos === 1 ? 'ganho' : 'ganhos'}`}
      {stats.temPerda && ` · ${stats.perdidos} ${stats.perdidos === 1 ? 'perdido' : 'perdidos'}`}
      {pct !== null && ` · ${pct}% de conversão (${stats.ganhos} de ${stats.total} ganhas)`}
      {!stats.temGanho && stats.total > 0 && ' · conversão — (o funil não tem etapa de ganho)'}
    </>
  )
}
