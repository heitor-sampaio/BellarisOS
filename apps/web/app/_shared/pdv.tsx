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
import type { VendaDoPdv } from '@/components/shared/pdv/nova-venda'
import { can, podeVerFechamento } from '@/lib/auth'
import { pacotesAVenda } from '@/lib/pacotes/leitura'
import { procedimentosAVenda } from '@/lib/pre-pago/leitura'
import { produtosAVenda } from '@/lib/produtos/leitura'
import { equipeDaVenda } from '@/lib/vendas/equipe-da-venda'
import { veComissaoDeTodos } from '@/lib/comissoes/quem-ve'
import { getAtendimentosAReceber } from '@/lib/metrics/a-receber'
import { parcelasEmAbertoDaCliente } from '@/lib/pdv/parcelas-da-cliente'
import { itensDaComanda } from '@/lib/pdv/itens-da-comanda'
import { fidelidadeParaAVenda } from '@/lib/fidelidade/na-venda'

/**
 * O PDV, o corpo dos dois portais (PDV1, a revisão do Heitor de 2026-11-13:
 * "vamos fazer um PDV… o pagamento acontece por dentro desse PDV, seja do que
 * for"). Uma unidade de cada vez: a da página, ou a escolhida na rede
 * (`?unidade=`). À esquerda as comandas (`?ver=` Abertas, Pagas hoje,
 * Todas); à direita a escolhida (`?comanda=`), com o "Receber".
 */
export async function Pdv({ ctx, unidades, unidadeId, slugDaUnidade, basePath, ver, comandaId, nova, clienteId, unidadeEscolhida = true }: {
  ctx:        TenantContext
  unidades:   { id: string; name: string }[]
  unidadeId:  string
  /** O endereço da unidade: o recebimento revalida as telas dela. */
  slugDaUnidade: string
  basePath:   string
  ver?:       string
  comandaId?: string
  /** `?nova=1`: a "Nova venda" aberta; `?cliente=` é a cliente dela (a busca e o inbox chegam assim). */
  nova?:      string
  clienteId?: string
  /**
   * A unidade veio na URL (ou só há uma). Sem ela, a "Nova venda" na rede
   * pergunta "Em qual unidade?" antes — não vende calada na primeira (F33).
   */
  unidadeEscolhida?: boolean
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
      ? await ler(admin.from('appointments').select('procedure_id, status, price')
          .eq('id', comanda.agendamentoId).maybeSingle(), 'ler o atendimento da comanda') as { procedure_id: string | null; status: string; price: number | string | null } | null
      : null
    const aReceber = !comanda.paga && !comanda.canceladaEm
    // Fase 5b: os produtos acrescentados na comanda do atendimento, e os que
    // ainda se podem acrescentar (os de Venda direta, no estoque da unidade).
    const doAtendimento = comanda.origem === 'ATENDIMENTO'
    const [itens, produtos] = await Promise.all([
      doAtendimento ? itensDaComanda(ctx.tenantId!, comanda.id, admin) : [],
      doAtendimento && aReceber ? produtosAVenda(ctx.tenantId!, unidadeId) : [],
    ])
    const comProdutos = itens.some(i => !i.vendido)
    // Com produto na comanda, o atendimento não se abate do pacote: a comanda se recebe inteira.
    const pacotes = aReceber && !comProdutos && agendamento?.status === 'COMPLETED' && agendamento.procedure_id
      ? (await creditosDoCliente(admin, ctx.tenantId!, comanda.clienteId))
          .filter(c => c.tipo === 'PACOTE' && c.procedureId === agendamento.procedure_id)
          .map(c => ({ sessaoId: c.id, pacote: c.origem, restantes: c.restantes, preco: c.preco }))
      : []
    escolhida = {
      comanda,
      valorDoAtendimento: agendamento ? Number(agendamento.price ?? 0) : null,
      itens,
      produtosParaAcrescentar: produtos.map(p => ({ id: p.id, name: p.name, price: p.price, unidade: p.unidade, disponivel: p.disponivel })),
      pacotesParaAbater: pacotes,
      pagamentoCombinado: aReceber && comanda.agendamentoId
        ? await pagamentoCombinadoDoAtendimento(ctx.tenantId!, comanda.agendamentoId) : null,
    }
  }

  // A "Nova venda" (PDV2): o catálogo, o estoque e "Quem vendeu" são os da
  // unidade do PDV. A cliente é da rede (H5): o id da URL se confere na rede.
  let novaVenda: { dados: VendaDoPdv | null; aviso?: string; perguntaAUnidade?: boolean } | null = null
  if (nova === '1' && !unidadeEscolhida) {
    novaVenda = { dados: null, perguntaAUnidade: true }
  } else if (nova === '1') {
    const admin = createAdminClient()
    const cliente = clienteId && /^[0-9a-f-]{36}$/i.test(clienteId)
      ? await ler(admin.from('clients').select('id, name, phone, is_active')
          .eq('id', clienteId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a cliente da venda') as
          { id: string; name: string; phone: string | null; is_active: boolean } | null
      : null
    if (!cliente) novaVenda = { dados: null }
    // A arquivada não compra (princípio 3: a tela diz por quê, não volta calada à busca).
    else if (!cliente.is_active) novaVenda = { dados: null, aviso: `${cliente.name} está arquivada. Para vender, reative a cliente na ficha.` }
    else {
      const [pacotes, procedimentos, produtos, equipe, aReceber, emAberto, fidelidade] = await Promise.all([
        pacotesAVenda(ctx.tenantId!, unidadeId), procedimentosAVenda(ctx.tenantId!, unidadeId), produtosAVenda(ctx.tenantId!, unidadeId),
        equipeDaVenda(ctx.tenantId!, unidadeId, ctx.internalUserId, veComissaoDeTodos(ctx)),
        getAtendimentosAReceber({ tenantId: ctx.tenantId!, clienteId: cliente.id }),
        // CX1: as parcelas do crediário e os a receber dela no caixa DESTA unidade.
        parcelasEmAbertoDaCliente({ branchId: unidadeId, clienteId: cliente.id, fuso }),
        // FD2a: os pontos e os vouchers de desconto dela, para usar na venda à vista.
        fidelidadeParaAVenda(ctx.tenantId!, cliente.id, unidadeId),
      ])
      novaVenda = { dados: { cliente: { id: cliente.id, name: cliente.name, phone: cliente.phone }, pacotes, procedimentos, produtos, equipe, aReceber: aReceber.itens, podeAgendar: can(ctx, 'agenda', 'MANAGE'), emAberto, fidelidade } }
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
          novaVenda={novaVenda}
          podeVerFechamento={podeVerFechamento(ctx)}
        />
      </FusoProvider>
    </>
  )
}
