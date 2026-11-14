import type { resumoDoFunil } from '@/lib/metrics/resultado'
import { IrParaOsPerdidos } from './ir-para-os-perdidos'

/**
 * Os números do topo do quadro de Oportunidades (rede e unidade), já contados
 * por `resumoDoFunil` (lib/metrics). A conversão é da OPORTUNIDADE — quantas
 * chegaram à etapa de ganho de quantas estão no funil (decisão do Heitor,
 * 2026-10-29) —, a mesma conta do dashboard e dos Relatórios. Funil sem etapa
 * de ganho não tem conversão: "—". Ganhos e perdidos só aparecem quando o
 * funil tem etapa de ganho ou de perda; "já é cliente" é filtro, não número.
 *
 * A44 da 9ª simulação: "0 de 7 ganhas" não dizia a base — é TODA oportunidade
 * do funil, as abertas e as perdidas também; e o "N perdidos" leva à coluna
 * Perdido, que fica fora da primeira dobra.
 */
export function ResumoDoQuadro({ stats }: { stats: ReturnType<typeof resumoDoFunil> }) {
  const pct = stats.conversaoPct === null ? null : stats.conversaoPct.toFixed(1).replace('.', ',')
  const perdidos = `${stats.perdidos} ${stats.perdidos === 1 ? 'perdido' : 'perdidos'}`
  return (
    <span data-resumo-do-quadro>
      {stats.total} {stats.total === 1 ? 'oportunidade' : 'oportunidades'} no funil
      {stats.temGanho && ` · ${stats.ganhos} ${stats.ganhos === 1 ? 'ganho' : 'ganhos'}`}
      {stats.temPerda && <> · {stats.perdidos > 0 ? <IrParaOsPerdidos>{perdidos}</IrParaOsPerdidos> : perdidos}</>}
      {pct !== null && ` · ${pct}% de conversão: ${stats.ganhos} ${stats.ganhos === 1 ? 'ganha' : 'ganhas'} de ${stats.total} ${stats.total === 1 ? 'oportunidade' : 'oportunidades'} do funil (abertas, ganhas e perdidas)`}
      {!stats.temGanho && stats.total > 0 && ' · conversão — (o funil não tem etapa de ganho)'}
    </span>
  )
}
