import { can, ownerFilter } from '@/lib/auth'
import type { TenantContext } from '@estetica-os/types'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { FinanceiroComissoes } from '@/components/shared/financeiro-comissoes'
import { periodosRecentes, periodoDaChave } from '@/lib/comissoes/periodo'
import {
  configDeComissaoDaRede, resumoDasComissoes, extratoDasComissoes, fechamentosRecentes,
} from '@/lib/comissoes/leitura'

/**
 * Financeiro → Comissões, o corpo dos dois portais. A página da rede passa as
 * unidades da rede (e o filtro); a da unidade, só a dela. O período é o do
 * fechamento que a rede escolheu (Configurações → Comissões).
 *
 * Quem tem `financial` com escopo "só os meus" vê só a própria linha e não
 * fecha — é a tela que o financeiro da rede prometia a essa pessoa.
 */
export async function ComissoesDaEquipe({ ctx, unidades, unidadeAtual, basePath, voltarPara, periodoPedido }: {
  ctx:           TenantContext
  /** As unidades ao alcance desta tela (no portal da unidade, uma). */
  unidades:      { id: string; name: string }[]
  /** Recorte da rede por uma unidade. */
  unidadeAtual?: string
  basePath:      string
  voltarPara:    string
  periodoPedido?: string
}) {
  const config = await configDeComissaoDaRede(ctx.tenantId!)
  const periodos = periodosRecentes(config.periodo, new Date(), 12)
  const periodo = periodoDaChave(periodoPedido, config.periodo) ?? periodos[0]!
  // O período pedido pode ser mais antigo que a lista: entra nela.
  const lista = periodos.some(p => p.chave === periodo.chave) ? periodos : [...periodos, periodo]

  const doFiltro = unidadeAtual && unidades.some(u => u.id === unidadeAtual) ? [unidadeAtual] : unidades.map(u => u.id)
  const soAsProprias = ownerFilter(ctx, 'financial')
  const recorte = {
    tenantId: ctx.tenantId!, branchIds: doFiltro, inicio: periodo.inicio, fim: periodo.fim,
    profissionalId: soAsProprias,
  }
  const [resumo, extrato, fechamentos] = await Promise.all([
    resumoDasComissoes(recorte),
    extratoDasComissoes(recorte),
    fechamentosRecentes(ctx.tenantId!, doFiltro, soAsProprias),
  ])

  // Os totais somam as LINHAS do resumo, que já vêm agregadas no banco (uma
  // por profissional e unidade) — não há teto de linhas a truncar aqui.
  const totais = resumo.reduce((t, r) => ({
    aPagar:   Math.round((t.aPagar + r.aPagar) * 100) / 100,
    liberado: Math.round((t.liberado + r.liberado) * 100) / 100,
    pago:     Math.round((t.pago + r.pago) * 100) / 100,
  }), { aPagar: 0, liberado: 0, pago: 0 })

  return (
    <>
      <RealtimeRefresher tables={['commissions']} />
      <FinanceiroComissoes
        titulo={soAsProprias ? 'Minhas comissões' : 'Comissões'}
        basePath={basePath}
        voltarPara={voltarPara}
        periodos={lista.map(p => ({ chave: p.chave, rotulo: p.rotulo }))}
        periodoAtual={periodo.chave}
        unidades={unidades.length > 1 ? unidades : undefined}
        unidadeAtual={unidadeAtual}
        resumo={resumo}
        totais={totais}
        extrato={extrato}
        fechamentos={fechamentos}
        podeFechar={can(ctx, 'financial', 'MANAGE') && !soAsProprias}
        soAsProprias={!!soAsProprias}
        modoPagamento={config.modo === 'PAGAMENTO'}
      />
    </>
  )
}
