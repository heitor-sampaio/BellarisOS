import type { TenantContext } from '@estetica-os/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { getFechamentoDoDia } from '@/lib/metrics'
import { diaDoFechamento, janelaDoDia } from '@/lib/financeiro/fechamento'
import { fusoDaUnidade } from '@/lib/unidades/fuso-da-unidade'
import { comandasDoPdv, situacaoDoPdv } from '@/lib/pdv/comandas'
import { contarComValorEmAberto } from '@/lib/pdv/situacoes'
import { creditosDoCliente } from '@/lib/creditos/credito'
import { pagamentoCombinadoDoAtendimento } from '@/lib/documentos/leitura'
import { ler } from '@/lib/db'
import { ehUuid } from '@/lib/id-da-rota'
import { FusoProvider } from '@/components/shared/fuso'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { PdvTela, type ComandaEscolhida } from '@/components/shared/pdv/pdv-tela'
import type { VendaDoPdv } from '@/components/shared/pdv/nova-venda'
import { can, podeReceber, podeVerFechamento } from '@/lib/auth'
import { pacotesAVenda } from '@/lib/pacotes/leitura'
import { procedimentosAVenda } from '@/lib/pre-pago/leitura'
import { produtosAVenda } from '@/lib/produtos/leitura'
import { equipeDaVenda } from '@/lib/vendas/equipe-da-venda'
import { veComissaoDeTodos } from '@/lib/comissoes/quem-ve'
import { getAtendimentosAReceber } from '@/lib/metrics/a-receber'
import { parcelasEmAbertoDaCliente, CHAVES_DA_VENDA, type VendaDaComanda } from '@/lib/pdv/parcelas-da-cliente'
import { itensDaComanda } from '@/lib/pdv/itens-da-comanda'
import { linhaDaComandaDoPdv } from '@/lib/pdv/linha-da-comanda-leitura'
import { fidelidadeParaAVenda } from '@/lib/fidelidade/na-venda'
import { trocaNaComanda } from '@/lib/fidelidade/troca-na-comanda-leitura'
import { vendaDeProdutoNaoPontua } from '@/lib/fidelidade/leitura'
import { quemDesfazNoCaixa, quemCompletaOCadastro } from '@/lib/equipe/quem-desfaz'
import { podeEstornar } from '@/lib/financeiro/so-os-meus'
import { lancamentosDaComanda } from '@/lib/pdv/lancamentos-da-comanda'
import { faltaParaOContratoDoPacote } from '@/lib/documentos/falta-no-cadastro'

/**
 * O PDV, o corpo dos dois portais (PDV1, a revisão do Heitor de 2026-11-13:
 * "vamos fazer um PDV… o pagamento acontece por dentro desse PDV, seja do que
 * for"). Uma unidade de cada vez: a da página, ou a escolhida na rede
 * (`?unidade=`). À esquerda as comandas (`?ver=` Abertas, Fechadas hoje,
 * Todas); à direita a escolhida (`?comanda=`), com o "Receber".
 */
export async function Pdv({ ctx, unidades, unidadeId, slugDaUnidade, basePath, ver, comandaId, nova, clienteId, recebidaId, unidadeEscolhida = true }: {
  ctx:        TenantContext
  /** `ativa: false` — a unidade desativada (D4 da 30ª, UN-14): recebe o que ficou, não vende. */
  unidades:   { id: string; name: string; ativa?: boolean }[]
  unidadeId:  string
  /** O endereço da unidade: o recebimento revalida as telas dela. */
  slugDaUnidade: string
  basePath:   string
  ver?:       string
  comandaId?: string
  /** `?nova=1`: a "Nova venda" aberta; `?cliente=` é a cliente dela (a busca e o inbox chegam assim). */
  nova?:      string
  clienteId?: string
  /** A2 da 19ª: `?recebida=` — a comanda que acabou de ser recebida (a tela diz o que entrou). */
  recebidaId?: string
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
  const [lista, abertas, pagasHoje, resumo] = await Promise.all([
    comandasDoPdv({ tenantId: ctx.tenantId!, branchId: unidadeId, situacao, de: janela.from, ate: janela.to }),
    situacao === 'ABERTAS' ? null
      : comandasDoPdv({ tenantId: ctx.tenantId!, branchId: unidadeId, situacao: 'ABERTAS', de: janela.from, ate: janela.to }),
    // A2 da 21ª: as pagas de hoje com valor a receber (o crediário), que o topo cita.
    situacao === 'PAGAS' ? null
      : comandasDoPdv({ tenantId: ctx.tenantId!, branchId: unidadeId, situacao: 'PAGAS', de: janela.from, ate: janela.to }),
    // "Hoje: R$ X recebidos" é o total de entradas do Fechamento do dia (lib/metrics).
    getFechamentoDoDia({ tenantId: ctx.tenantId!, branchId: unidadeId, from: janela.from, to: janela.to, dia }),
  ])
  // A15 da 22ª (princípio 3): no PDV da rede, as comandas abertas das OUTRAS unidades — a
  // aberta não depende do dia (a janela só recorta as pagas e as canceladas).
  const abertasNasOutras = unidades.length > 1
    ? await Promise.all(unidades.filter(u => u.id !== unidadeId).map(async u => ({
        id: u.id, nome: u.name,
        abertas: (await comandasDoPdv({ tenantId: ctx.tenantId!, branchId: u.id, situacao: 'ABERTAS', de: janela.from, ate: janela.to })).length,
      })))
    : []

  const comanda = comandaId ? lista.find(c => c.id === comandaId) ?? null : null
  // A2 da 19ª: a recebida saiu das abertas — lê-se entre as pagas de hoje. Só a do atendimento
  // (a da venda e a do plano seguem na lista ou dizem o recebido nelas). Vale também a comanda
  // aberta na URL que já não está nas Abertas: o tempo real tira a recebida da lista antes do
  // "Receber" mudar a URL.
  const procurada = ehUuid(recebidaId) ? recebidaId
    : comandaId && !comanda && situacao === 'ABERTAS' && ehUuid(comandaId) ? comandaId : null
  const recebida = procurada
    ? (lista.find(c => c.id === procurada) ?? (pagasHoje ?? []).find(c => c.id === procurada) ?? null)
    : null
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
    const [itens, produtos, linha] = await Promise.all([
      doAtendimento ? itensDaComanda(ctx.tenantId!, comanda.id, admin) : [],
      doAtendimento && aReceber ? produtosAVenda(ctx.tenantId!, unidadeId) : [],
      // D3 e A5 da 21ª: a quantidade vendida (e as sessões do plano), não o "1" fixo.
      doAtendimento ? null : linhaDaComandaDoPdv(admin, ctx.tenantId!, comanda.id),
    ])
    const comProdutos = itens.some(i => !i.vendido)
    // A16 da 24ª (princípio 7): o contrato da venda do pacote que espera a assinatura — a
    // comanda leva até ela (era só logo depois da venda, ou pela ficha). Colher não pede permissão.
    const pacoteDaVenda = comanda.origem === 'VENDA' && !comanda.estornada
      ? (await ler(admin.from('comandas').select('client_package_id')
          .eq('id', comanda.id).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'ler o pacote da comanda') as { client_package_id: string | null } | null)?.client_package_id ?? null
      : null
    const documentosParaColher = pacoteDaVenda
      ? ((await ler(admin.from('issued_documents').select('id, title')
          .eq('tenant_id', ctx.tenantId!).eq('client_package_id', pacoteDaVenda).eq('status', 'PENDENTE')
          .order('kind').order('title'), 'ler os documentos da venda do pacote')) as { id: string; title: string }[] | null ?? [])
          .map(d => ({ id: d.id, titulo: d.title }))
      : []
    // Com produto na comanda, o atendimento não se abate do pacote: a comanda se recebe inteira.
    const pacotes = aReceber && !comProdutos && agendamento?.status === 'COMPLETED' && agendamento.procedure_id
      ? (await creditosDoCliente(admin, ctx.tenantId!, comanda.clienteId))
          .filter(c => c.tipo === 'PACOTE' && c.procedureId === agendamento.procedure_id)
          .map(c => ({ sessaoId: c.id, pacote: c.origem, restantes: c.restantes, preco: c.preco }))
      : []
    escolhida = {
      comanda,
      valorDoAtendimento: agendamento ? Number(agendamento.price ?? 0) : null,
      linha,
      itens,
      produtosParaAcrescentar: produtos.map(p => ({ id: p.id, name: p.name, price: p.price, unidade: p.unidade, disponivel: p.disponivel })),
      pacotesParaAbater: pacotes,
      pagamentoCombinado: aReceber && comanda.agendamentoId
        ? await pagamentoCombinadoDoAtendimento(ctx.tenantId!, comanda.agendamentoId) : null,
      // com-06 (o Heitor: "Campo vazio não gera comissão para ninguém"): o produto
      // acrescentado na comanda tem "Quem vendeu os produtos", vazio — era quem atendeu.
      equipeDosProdutos: aReceber && comProdutos
        ? await equipeDaVenda(ctx.tenantId!, unidadeId, ctx.internalUserId, veComissaoDeTodos(ctx)) : null,
      // A2 da 15ª (princípios 3 e 7): a comanda paga diz a quem não estorna de quem é o estorno.
      quemEstorna: comanda.paga && !comanda.estornada && !podeEstornar(ctx)
        ? await quemDesfazNoCaixa(ctx.tenantId!, unidadeId) : null,
      // A2 da 17ª (princípio 7; o bloco PDV: o estorno "dentro da comanda"): os pagamentos da
      // comanda paga; a quem estorna, cada um com o "Estornar" de sempre (a action confere tudo
      // de novo). A1 da 18ª: a quem não estorna também — é dali que sai o "Pago junto".
      pagamentos: comanda.paga && !comanda.estornada
        ? await lancamentosDaComanda(admin, ctx.tenantId!, unidadeId, comanda.id) : null,
      podeEstornar: podeEstornar(ctx),
      documentosParaColher,
      // A10 da 30ª (CLAUDE.md §14): o "Completar o cadastro" do receber o plano é de quem
      // tem os Clientes em Gerenciar; os outros leem quem completa.
      cadastroDoPlano: comanda.origem === 'PLANO' && aReceber
        ? (can(ctx, 'clients', 'MANAGE') ? { podeCompletar: true, quemCompleta: null }
          : { podeCompletar: false, quemCompleta: await quemCompletaOCadastro(ctx.tenantId!, unidadeId) })
        : null,
      // A32 da 20ª: a linha do produto diz que ele não pontua (a regra da rede).
      produtoNaoPontua: itens.length > 0 ? await vendaDeProdutoNaoPontua(ctx.tenantId!, admin) : false,
      // A1 da 16ª (princípio 7): a comanda do crediário recebe as parcelas dela ali mesmo.
      parcelasDaComanda: comanda.paga && !comanda.estornada && comanda.emAberto > 0 && podeReceber(ctx)
        ? await parcelasEmAbertoDaCliente({
            branchId: unidadeId, clienteId: comanda.clienteId, fuso,
            // 2026-11-16: a do atendimento também (o crediário do avulso), com os produtos dela.
            daVenda: {
              ...((await ler(admin.from('comandas').select(['appointment_id', ...CHAVES_DA_VENDA].join(', '))
                .eq('id', comanda.id).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'ler a venda da comanda') as (VendaDaComanda & { appointment_id: string | null }) | null) ?? {}),
              produtos: itens.map(i => i.vendaId).filter((v): v is string => !!v),
            },
          })
        : [],
    }
  }

  // A "Nova venda" (PDV2): o catálogo, o estoque e "Quem vendeu" são os da
  // unidade do PDV. A cliente é da rede (H5): o id da URL se confere na rede.
  let novaVenda: { dados: VendaDoPdv | null; aviso?: string; perguntaAUnidade?: boolean } | null = null
  // D4 da 30ª (plataforma:UN-14, "de vender: só as ativas"): o PDV da unidade
  // desativada segue recebendo o que ficou (UN-13), sem a "Nova venda"; a tela
  // diz por quê, e as actions de venda recusam (lib/vendas/unidade-da-venda.ts).
  const vende = unidades.find(u => u.id === unidadeId)?.ativa !== false
  if (nova === '1' && !vende && unidadeEscolhida) {
    novaVenda = null
  } else if (nova === '1' && !unidadeEscolhida) {
    novaVenda = { dados: null, perguntaAUnidade: true }
  } else if (nova === '1') {
    const admin = createAdminClient()
    // O id da URL (a busca, o inbox) só vai ao banco se for uuid (BU1): o
    // `/^[0-9a-f-]{36}$/` deixava passar 36 hífens, e o 22P02 dava a tela de erro.
    const cliente = ehUuid(clienteId)
      ? await ler(admin.from('clients').select('id, name, phone, is_active')
          .eq('id', clienteId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a cliente da venda') as
          { id: string; name: string; phone: string | null; is_active: boolean } | null
      : null
    if (!cliente) novaVenda = { dados: null }
    // A arquivada não compra (princípio 3: a tela diz por quê, não volta calada à busca).
    else if (!cliente.is_active) novaVenda = { dados: null, aviso: `${cliente.name} está arquivada. Para vender, reative a cliente na ficha.` }
    else {
      const [pacotes, procedimentos, produtos, equipe, aReceber, emAberto, fidelidadeLida, contrato, troca] = await Promise.all([
        pacotesAVenda(ctx.tenantId!, unidadeId), procedimentosAVenda(ctx.tenantId!, unidadeId), produtosAVenda(ctx.tenantId!, unidadeId),
        equipeDaVenda(ctx.tenantId!, unidadeId, ctx.internalUserId, veComissaoDeTodos(ctx)),
        getAtendimentosAReceber({ tenantId: ctx.tenantId!, clienteId: cliente.id }),
        // CX1: as parcelas do crediário e os a receber dela no caixa DESTA unidade.
        parcelasEmAbertoDaCliente({ branchId: unidadeId, clienteId: cliente.id, fuso }),
        // FD2a: os pontos e os vouchers de desconto dela, para usar na venda à vista.
        fidelidadeParaAVenda(ctx.tenantId!, cliente.id),
        // A6 da 18ª: o que o contrato de pacote pede do cadastro dela e falta — antes de vender.
        faltaParaOContratoDoPacote(ctx.tenantId!, cliente.id),
        // A50 da 24ª: trocar pontos por voucher de desconto aqui mesmo (era só na ficha).
        trocaNaComanda(ctx, { clienteId: cliente.id, branchId: unidadeId, procedimentoId: null }),
      ])
      // Sem saldo para descontar nem voucher, a troca ainda abre o bloco da fidelidade.
      const fidelidade = troca
        ? { ...(fidelidadeLida ?? { saldo: 0, valorDoPonto: 0, minimo: 0, tetoPct: 100, vouchers: [] }), troca }
        : fidelidadeLida
      novaVenda = { dados: {
        cliente: { id: cliente.id, name: cliente.name, phone: cliente.phone }, pacotes, procedimentos, produtos, equipe, aReceber: aReceber.itens,
        podeAgendar: can(ctx, 'agenda', 'MANAGE'), emAberto, fidelidade,
        contratoDoPacote: pacotes.length && contrato ? { ...contrato, podeCompletar: can(ctx, 'clients', 'MANAGE') } : null,
      } }
    }
  }

  return (
    <>
      <RealtimeRefresher tables={['financeiro_sinais']} topicos={['agenda']} />
      <FusoProvider fuso={fuso}>
        <PdvTela
          basePath={basePath}
          unidades={unidades}
          unidadeId={unidadeId}
          situacao={situacao}
          comandas={lista}
          abertas={(abertas ?? lista).length}
          abertasNasOutras={abertasNasOutras}
          comValorEmAberto={contarComValorEmAberto(pagasHoje ?? lista)}
          recebidoHoje={resumo.total.entradas}
          escolhida={escolhida}
          slugDaUnidade={slugDaUnidade}
          novaVenda={novaVenda}
          vende={vende}
          podeVerFechamento={podeVerFechamento(ctx)}
          recebidaAgora={recebida && recebida.paga && recebida.origem === 'ATENDIMENTO' ? recebida : null}
        />
      </FusoProvider>
    </>
  )
}
