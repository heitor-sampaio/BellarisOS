import type { TenantContext } from '@estetica-os/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { getFechamentoDoDia } from '@/lib/metrics'
import { diaDoFechamento, janelaDoDia } from '@/lib/financeiro/fechamento'
import { fusoDaUnidade } from '@/lib/unidades/fuso-da-unidade'
import { comandasDoPdv, situacaoDoPdv } from '@/lib/pdv/comandas'
import { creditosDoCliente } from '@/lib/creditos/credito'
import { pagamentoCombinadoDoAtendimento } from '@/lib/documentos/leitura'
import { ler } from '@/lib/db'
import { FusoProvider } from '@/components/shared/fuso'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { PdvTela, type ComandaEscolhida } from '@/components/shared/pdv/pdv-tela'

/**
 * O PDV, o corpo dos dois portais (PDV1, a revisão do Heitor de 2026-11-13:
 * "vamos fazer um PDV… o pagamento acontece por dentro desse PDV, seja do que
 * for"). Uma unidade de cada vez: a da página, ou a escolhida na rede
 * (`?unidade=`). À esquerda as comandas (`?ver=` Abertas, Pagas hoje,
 * Todas); à direita a escolhida (`?comanda=`), com o "Receber".
 */
export async function Pdv({ ctx, unidades, unidadeId, slugDaUnidade, basePath, ver, comandaId }: {
  ctx:        TenantContext
  unidades:   { id: string; name: string }[]
  unidadeId:  string
  /** O endereço da unidade: o recebimento revalida as telas dela. */
  slugDaUnidade: string
  basePath:   string
  ver?:       string
  comandaId?: string
}) {
  // O dia no relógio da UNIDADE (F62), como o Fechamento.
  const fuso = await fusoDaUnidade(ctx.tenantId, unidadeId)
  const dia = diaDoFechamento(undefined, new Date(), fuso)
  const janela = janelaDoDia(dia, new Date(), fuso)!
  const situacao = situacaoDoPdv(ver)
  const [lista, abertas, resumo] = await Promise.all([
    comandasDoPdv({ tenantId: ctx.tenantId!, branchId: unidadeId, situacao, de: janela.from, ate: janela.to }),
    situacao === 'ABERTAS' ? null
      : comandasDoPdv({ tenantId: ctx.tenantId!, branchId: unidadeId, situacao: 'ABERTAS', de: janela.from, ate: janela.to }),
    // "Hoje: R$ X recebidos" é o total de entradas do Fechamento do dia (lib/metrics).
    getFechamentoDoDia({ tenantId: ctx.tenantId!, branchId: unidadeId, from: janela.from, to: janela.to, dia }),
  ])

  const comanda = comandaId ? lista.find(c => c.id === comandaId) ?? null : null
  let escolhida: ComandaEscolhida | null = null
  if (comanda) {
    // O "Abater do pacote" (D9 da 10/28) vale para o atendimento concluído,
    // como na tela do atendimento; o combinado no contrato vem escolhido.
    const admin = createAdminClient()
    const agendamento = comanda.agendamentoId
      ? await ler(admin.from('appointments').select('procedure_id, status')
          .eq('id', comanda.agendamentoId).maybeSingle(), 'ler o atendimento da comanda') as { procedure_id: string | null; status: string } | null
      : null
    const aReceber = !comanda.paga && !comanda.canceladaEm
    const pacotes = aReceber && agendamento?.status === 'COMPLETED' && agendamento.procedure_id
      ? (await creditosDoCliente(admin, ctx.tenantId!, comanda.clienteId))
          .filter(c => c.tipo === 'PACOTE' && c.procedureId === agendamento.procedure_id)
          .map(c => ({ sessaoId: c.id, pacote: c.origem, restantes: c.restantes, preco: c.preco }))
      : []
    escolhida = {
      comanda,
      pacotesParaAbater: pacotes,
      pagamentoCombinado: aReceber && comanda.agendamentoId
        ? await pagamentoCombinadoDoAtendimento(ctx.tenantId!, comanda.agendamentoId) : null,
    }
  }

  return (
    <>
      <RealtimeRefresher tables={['financeiro_sinais', 'appointments']} />
      <FusoProvider fuso={fuso}>
        <PdvTela
          basePath={basePath}
          unidades={unidades}
          unidadeId={unidadeId}
          situacao={situacao}
          comandas={lista}
          abertas={(abertas ?? lista).length}
          recebidoHoje={resumo.total.entradas}
          escolhida={escolhida}
          slugDaUnidade={slugDaUnidade}
        />
      </FusoProvider>
    </>
  )
}
