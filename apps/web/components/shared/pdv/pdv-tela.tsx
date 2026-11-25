'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { ArrowLeft, Lock, Plus, Search, ShoppingBag } from 'lucide-react'
import { iniciaisDoNome } from '@estetica-os/utils'
import { SegSelect } from '@/components/shared/seg-select'
import { useFuso } from '@/components/shared/fuso'
import { Dica } from '@/components/shared/dica'
import { FormularioDeReceberAtendimento, type PacoteParaAbater } from '@/components/shared/receber-atendimento'
import { rotuloDaForma } from '@/lib/financeiro/formas'
import { rotaCliente, rotaNoPortal } from '@/lib/rotas'
import { ReceberOPlano } from '@/components/shared/pdv/receber-o-plano'
import {
  SITUACOES_DO_PDV, seloDaComanda, emAbertoDaComanda, detalheDaComanda, formasDaComandaEmTexto, descontosDaComanda,
  estornoAnteriorEmTexto, valorNaLista, produtosEstornadosEmTexto, pagoJuntoEmTexto, rotuloDoPagamentoDaComanda,
  estornoDaVendaEmTexto, recebidaAgoraEmTexto, voucherDoProdutoEstornadoEmTexto, vendaEstornadaEmTexto, rotuloDoDiaNoPdv, textoDasComValorEmAberto,
  abertasNasOutrasEmTexto, vazioDasAbertas, hrefDasComValorEmAberto, comandasDoFiltro, FILTRO_COM_VALOR_EM_ABERTO,
  rotuloDoTotalDaComanda, separarAsQueNaoValem, tituloDoPdv, verboDaComandaPaga, type AbertasNaOutraUnidade, type SaiDaComanda, type ComandaDoPdv, type SituacaoDoPdv,
} from '@/lib/pdv/situacoes'
import { NovaVenda, type VendaDoPdv } from '@/components/shared/pdv/nova-venda'
import { ProdutosDaComanda } from '@/components/shared/pdv/produtos-da-comanda'
import type { ItemDaComanda } from '@/lib/pdv/itens-da-comanda'
import type { ParcelaEmAberto } from '@/lib/pdv/parcelas-da-cliente'
import { ParcelasEmAberto } from '@/components/shared/pdv/parcelas-em-aberto'
import { AcoesDoLancamentoDaFicha } from '@/components/shared/acoes-do-lancamento-da-ficha'
import type { LancamentoDaComanda } from '@/lib/pdv/lancamentos-da-comanda'
import type { LinhaDaComanda } from '@/lib/pdv/linha-da-comanda'
import type { MembroDaVenda } from '@/components/shared/vender'

export interface ComandaEscolhida {
  comanda:            ComandaDoPdv
  /** Fase 5b: o preço do atendimento sozinho (a comanda vale ele e os produtos dela). */
  valorDoAtendimento: number | null
  /** D3 e A5 da 21ª: a quantidade da linha e o detalhe ("2 × R$ 150,00", "3 sessões: …"); nulo, um. */
  linha?:             LinhaDaComanda | null
  /** Fase 5b: os produtos acrescentados na comanda do atendimento. */
  itens:              ItemDaComanda[]
  /** Os produtos de Venda direta que ainda se podem acrescentar (só na comanda do atendimento a receber). */
  produtosParaAcrescentar: { id: string; name: string; price: number; unidade: string; disponivel: number }[]
  pacotesParaAbater:  PacoteParaAbater[]
  pagamentoCombinado: { metodo: string | null; rotulo: string; desconto?: number } | null
  /** com-06: a equipe do "Quem vendeu os produtos" da comanda com produto a vender (nulo, sem produto). */
  equipeDosProdutos?: MembroDaVenda[] | null
  /** A2 da 15ª: na comanda paga, quem estorna — só a quem não tem o Financeiro em Gerenciar (nulo: não diz). */
  quemEstorna?:       string[] | null
  /** A1 da 16ª: as parcelas em aberto da venda desta comanda, com o "Receber esta parcela". */
  parcelasDaComanda?: ParcelaEmAberto[]
  /** A2 da 17ª: os pagamentos da comanda paga; a quem estorna (`podeEstornar`), cada um com o "Estornar". */
  pagamentos?:        LancamentoDaComanda[] | null
  /** A1 da 18ª: o "Estornar" de cada pagamento (`podeEstornar`). */
  podeEstornar?:      boolean
  /** A32 da 20ª: a rede tem a fidelidade e a venda de produto não pontua (a linha do produto diz). */
  produtoNaoPontua?:  boolean
  /** A16 da 24ª: o contrato da venda do pacote que ainda espera a assinatura (a comanda leva até ela). */
  documentosParaColher?: { id: string; titulo: string }[]
  /** A10 da 30ª: na comanda do plano, quem completa o cadastro (os Clientes em Gerenciar). */
  cadastroDoPlano?:   { podeCompletar: boolean; quemCompleta: string[] | null } | null
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const horaNo = (fuso: string) => (iso: string | null) => iso
  ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: fuso }) : ''

const TOM: Record<'ok' | 'warn' | 'info' | 'perigo', React.CSSProperties> = {
  ok:     { background: 'var(--success-soft)', color: 'var(--success)', border: '1px solid transparent' },
  warn:   { background: 'var(--warning-soft)', color: 'var(--warning)', border: '1px solid var(--warning-border)' },
  info:   { background: 'var(--info-soft)', color: 'var(--info)', border: '1px solid var(--info-border)' },
  perigo: { background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid var(--danger-border)' },
}

function Selo({ c }: { c: ComandaDoPdv }) {
  const s = seloDaComanda(c)
  return (
    <span style={{
      ...TOM[s.tom], justifySelf: 'end', display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 9px',
      borderRadius: 'var(--radius-chip)', fontSize: 'var(--text-2xs)', fontWeight: 700, whiteSpace: 'nowrap',
    }}>{s.texto}</span>
  )
}

/**
 * O topo do PDV (PDV1; CX4): o título, o que entrou hoje e quantas comandas
 * estão abertas. Nas comandas, o "Fechar o dia" abre o fechamento DENTRO do
 * PDV (`?fechar=1`); no fechamento, "Voltar às comandas" (a quem recebe).
 */
export function CabecalhoDoPdv({ basePath, unidadeId, naRede, vista, recebidoHoje, abertas, comValorEmAberto = 0, unidadeNome = null, podeReceber = true, podeVerFechamento = true, children }: {
  basePath:     string
  unidadeId:    string
  naRede:       boolean
  vista:        'comandas' | 'fechar'
  recebidoHoje: number
  abertas:      number
  /** A2 da 21ª: as comandas de hoje pagas com valor ainda a receber (o crediário). */
  comValorEmAberto?: number
  /** A10 da 21ª: na rede, o nome da unidade — o "Hoje" é o dela. */
  unidadeNome?: string | null
  podeReceber?: boolean
  podeVerFechamento?: boolean
  children?:    React.ReactNode
}) {
  const daUnidade = naRede ? `unidade=${unidadeId}` : ''
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 800, letterSpacing: 'var(--tracking-tight)', color: 'var(--text)' }}>{tituloDoPdv(vista)}</h1>
      <span data-resumo-do-pdv style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', fontWeight: 600 }}>
        {rotuloDoDiaNoPdv(naRede ? unidadeNome : null)}: <b style={{ color: 'var(--text)' }}>{brl(recebidoHoje)}</b> recebidos · <b style={{ color: 'var(--text)' }}>{abertas}</b> {abertas === 1 ? 'comanda aberta' : 'comandas abertas'}
        {/* A12 da 23ª: a venda fechada com parcelas a receber está em "Fechadas hoje" — o topo leva a ela. */}
        {/* A14 da 24ª: e só a elas (`?so=a-receber`), não a "Fechadas hoje" inteira. */}
        {textoDasComValorEmAberto(comValorEmAberto) && <> · <Link data-com-valor-em-aberto href={hrefDasComValorEmAberto(basePath, naRede ? unidadeId : null)}
          style={{ color: 'var(--brand)', fontWeight: 'var(--weight-bold)' }}>{textoDasComValorEmAberto(comValorEmAberto)}</Link></>}
      </span>
      <span style={{ flex: 1 }} />
      {children}
      {vista === 'comandas' && podeVerFechamento && (
        <Link href={`${basePath}?fechar=1${daUnidade ? `&${daUnidade}` : ''}`} className="btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Lock size={14} aria-hidden /> Fechar o dia
        </Link>
      )}
      {vista === 'fechar' && podeReceber && (
        <Link href={daUnidade ? `${basePath}?${daUnidade}` : basePath} className="btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={14} aria-hidden /> Voltar às comandas
        </Link>
      )}
    </div>
  )
}

/**
 * A tela do PDV (PDV1, o desenho aprovado pelo Heitor em 2026-11-13): as
 * comandas da unidade à esquerda; a escolhida à direita, com o que está nela
 * e o "Receber". Não existe pagamento sem forma (PDV8): o "Receber" espera a
 * forma escolhida.
 */
export function PdvTela({ basePath, unidades, unidadeId, situacao, comandas, abertas, abertasNasOutras = [], comValorEmAberto = 0, recebidoHoje, escolhida, slugDaUnidade, novaVenda, vende = true, podeVerFechamento = true, recebidaAgora = null }: {
  basePath:      string
  /** `ativa: false`: a unidade desativada (não entra no "Em qual unidade é a venda?"). */
  unidades:      { id: string; name: string; ativa?: boolean }[]
  unidadeId:     string
  situacao:      SituacaoDoPdv
  comandas:      ComandaDoPdv[]
  abertas:       number
  /** A15 da 22ª: no PDV da rede, as comandas abertas de cada OUTRA unidade. */
  abertasNasOutras?: AbertasNaOutraUnidade[]
  /** A2 da 21ª: as de hoje pagas com valor a receber (o topo as cita). */
  comValorEmAberto?: number
  recebidoHoje:  number
  escolhida:     ComandaEscolhida | null
  slugDaUnidade: string
  /** A "Nova venda" aberta (`?nova=1`), com a cliente já escolhida ou não. */
  novaVenda:     { dados: VendaDoPdv | null; aviso?: string; perguntaAUnidade?: boolean } | null
  /** D4 da 30ª (UN-14): a unidade do PDV vende — a desativada só recebe o que ficou. */
  vende?:        boolean
  /** Vê o Fechamento do dia (`podeVerFechamento`): o "Fechar o dia" do topo. */
  podeVerFechamento?: boolean
  /** A2 da 19ª: a comanda que acabou de ser recebida (`?recebida=`) — a tela diz o que entrou. */
  recebidaAgora?: ComandaDoPdv | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const parametros = useSearchParams()
  const clienteDaUrl = parametros.get('cliente')
  // A14 da 24ª: `?so=a-receber` — só as vendas com parcelas a receber (o link do topo).
  const so = situacao === 'PAGAS' && parametros.get('so') === FILTRO_COM_VALOR_EM_ABERTO ? FILTRO_COM_VALOR_EM_ABERTO : null
  const hora = horaNo(useFuso())
  const [busca, setBusca] = useState('')

  const naRede = unidades.length > 1
  const href = (mais: Record<string, string>) => {
    const q = new URLSearchParams()
    if (naRede) q.set('unidade', unidadeId)
    if (situacao !== 'ABERTAS') q.set('ver', situacao)
    if (so) q.set('so', so)
    for (const [k, v] of Object.entries(mais)) q.set(k, v)
    const s = q.toString()
    return s ? `${basePath}?${s}` : basePath
  }
  // Trocar a unidade leva junto a venda que está aberta (com a cliente).
  const hrefNaUnidade = (id: string) => {
    const q = new URLSearchParams({ unidade: id })
    if (novaVenda) {
      q.set('nova', '1')
      if (novaVenda.dados) q.set('cliente', novaVenda.dados.cliente.id)
      else if (clienteDaUrl) q.set('cliente', clienteDaUrl)
    }
    return `${basePath}?${q.toString()}`
  }
  const textoDaRecebida = recebidaAgora ? recebidaAgoraEmTexto(recebidaAgora) : null
  const visiveis = useMemo(() => {
    const t = busca.trim().toLocaleLowerCase('pt-BR')
    const doFiltro = comandasDoFiltro(comandas, so)
    return t ? doFiltro.filter(c => c.cliente.toLocaleLowerCase('pt-BR').includes(t)) : doFiltro
  }, [busca, comandas, so])
  // Sem o filtro: o mesmo endereço, sem o `so` (e sem a comanda aberta, que pode não estar nele).
  const semOFiltro = () => {
    const q = new URLSearchParams()
    if (naRede) q.set('unidade', unidadeId)
    q.set('ver', situacao)
    return `${basePath}?${q.toString()}`
  }

  const linhaDaLista = (c: ComandaDoPdv, foraDoRecebido: boolean) => (
    <Link key={c.id} href={href({ comanda: c.id })} data-comanda={c.id}
      className={escolhida?.comanda.id === c.id ? 'pdv-linha is-escolhida' : 'pdv-linha'}>
      <span style={{ fontWeight: 800, fontSize: 'var(--text-base-sz)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.cliente}</span>
      {/* A1 da 17ª: a comanda do atendimento paga mostra o que foi cobrado. */}
      {foraDoRecebido
        ? <span data-valor-na-lista data-valor-fora-do-recebido style={{ fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--text-faint)', textDecoration: 'line-through' }}>{brl(valorNaLista(c))}</span>
        : <span data-valor-na-lista style={{ fontWeight: 800, textAlign: 'right', whiteSpace: 'nowrap' }}>{brl(valorNaLista(c))}</span>}
      <span title={detalheDaComanda(c, hora)} style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {detalheDaComanda(c, hora)}
      </span>
      <Selo c={c} />
    </Link>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <CabecalhoDoPdv basePath={basePath} unidadeId={unidadeId} naRede={naRede} vista="comandas"
        recebidoHoje={recebidoHoje} abertas={abertas} comValorEmAberto={comValorEmAberto} podeVerFechamento={podeVerFechamento}
        unidadeNome={unidades.find(u => u.id === unidadeId)?.name ?? null}>
        {naRede && (
          <SegSelect options={unidades.map(u => ({ key: u.id, label: u.name }))} value={unidadeId}
            onSelect={k => router.push(hrefNaUnidade(k))} ariaLabel="Unidade" />
        )}
        {/* D4 da 30ª (UN-14): a unidade desativada não vende — o botão some, e o vazio diz por quê. */}
        {vende && (
          <Link href={href({ nova: '1' })} className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={15} aria-hidden /> Nova venda
          </Link>
        )}
      </CabecalhoDoPdv>

      <div className="pdv-duas">
        <div className="card" data-lista-de-comandas>
          <div style={{ display: 'flex', gap: 8, padding: '14px 14px 10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <SegSelect options={SITUACOES_DO_PDV.map(s => ({ key: s.key, label: s.label }))} value={situacao}
              basePath={basePath} paramName="ver" extraParams={naRede ? { unidade: unidadeId } : undefined} ariaLabel="Comandas" />
            <label style={{ flex: 1, minWidth: 140, position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={14} aria-hidden style={{ position: 'absolute', left: 10, color: 'var(--text-faint)' }} />
              <input className="field" placeholder="Cliente" aria-label="Buscar a cliente" value={busca}
                onChange={e => setBusca(e.target.value)} style={{ paddingLeft: 30, width: '100%' }} />
            </label>
          </div>
          {so && (
            <p data-so-as-com-valor-em-aberto style={{ padding: '0 14px 10px', fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
              <span>Só as vendas com parcelas a receber</span>
              <Link href={semOFiltro()} style={{ color: 'var(--brand)', fontWeight: 700 }}>Ver todas as fechadas hoje</Link>
            </p>
          )}
          {/* A15 da 22ª: a comanda aberta numa outra unidade não some atrás do "Nenhuma comanda aberta". */}
          {situacao === 'ABERTAS' && abertasNasOutrasEmTexto(abertasNasOutras).length > 0 && visiveis.length > 0 && (
            <p data-abertas-nas-outras style={{ padding: '0 14px 10px', fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
              {abertasNasOutrasEmTexto(abertasNasOutras).map(o => (
                <Link key={o.id} href={hrefNaUnidade(o.id)} style={{ color: 'var(--brand)', fontWeight: 700 }}>{o.texto}</Link>
              ))}
            </p>
          )}
          {visiveis.length === 0 ? (
            <div style={{ padding: '24px 16px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 'var(--text-sm-sz)' }}>
                {busca.trim() ? `Nenhuma comanda de “${busca.trim()}”.`
                  : situacao === 'ABERTAS' ? vazioDasAbertas(naRede ? unidades.find(u => u.id === unidadeId)?.name : null, abertasNasOutras)
                  : situacao === 'PAGAS' ? (so ? 'Nenhuma venda de hoje com parcelas a receber.' : 'Nenhuma comanda fechada hoje.') : 'Nenhuma comanda hoje.'}
              </p>
              {/* A11 da 23ª: a comanda aberta na outra unidade é o caminho, dentro do vazio. */}
              {!busca.trim() && situacao === 'ABERTAS' && abertasNasOutrasEmTexto(abertasNasOutras).length > 0 && (
                <div data-abertas-nas-outras data-abertas-nas-outras-no-vazio style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                  {abertasNasOutrasEmTexto(abertasNasOutras).map(o => (
                    <Link key={o.id} href={hrefNaUnidade(o.id)} className="btn-secondary">{o.texto}</Link>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ paddingBottom: 8 }}>
              {/* A13 da 27ª (princípio 3): a sem cobrança e a estornada vêm à parte, com o valor riscado — não somam com as outras. */}
              {separarAsQueNaoValem(visiveis).valem.map(c => linhaDaLista(c, false))}
              {separarAsQueNaoValem(visiveis).foraDoRecebido.length > 0 && (
                <div data-comandas-fora-do-recebido>
                  <p className="overline" style={{ padding: '12px 14px 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    Fora do que se recebe
                    <Dica rotulo="Por que estas comandas ficam à parte">
                      Sem cobrança (cancelada, falta, sessão do pacote, pré-pago) ou estornada: o valor riscado não entra no que se recebe.
                    </Dica>
                  </p>
                  {separarAsQueNaoValem(visiveis).foraDoRecebido.map(c => linhaDaLista(c, true))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="card" data-comanda-aberta={!novaVenda && escolhida ? escolhida.comanda.id : undefined}>
          {novaVenda ? (
            <NovaVenda unidadeId={unidadeId} slugDaUnidade={slugDaUnidade} venda={novaVenda.dados} aviso={novaVenda.aviso}
              unidades={novaVenda.perguntaAUnidade ? unidades.filter(u => u.ativa !== false).map(u => ({ ...u, href: hrefNaUnidade(u.id) })) : null}
              hrefDaCliente={id => href(id ? { nova: '1', cliente: id } : { nova: '1' })}
              hrefCancelar={href({})}
              aoVender={() => { router.push(href({ ver: 'PAGAS' })); router.refresh() }} />
          ) : !escolhida ? (
            <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-faint)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <ShoppingBag size={28} aria-hidden />
              {/* A2 da 19ª (princípio 3): recebida, a comanda sai das abertas — a tela diz o que entrou e onde ela está. */}
              {textoDaRecebida && recebidaAgora && (
                <p data-recebida-agora role="status" style={{
                  color: 'var(--success)', background: 'var(--success-soft)', borderRadius: 'var(--radius-field-token)',
                  padding: '10px 14px', fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-semibold)', lineHeight: 1.45,
                }}>
                  {textoDaRecebida}{' '}
                  <Link href={href({ ver: 'PAGAS', comanda: recebidaAgora.id })} style={{ color: 'inherit', fontWeight: 'var(--weight-bold)' }}>Ver a comanda</Link>
                </p>
              )}
              {/* A4 da 19ª: no celular a lista fica em cima, não à esquerda. */}
              {vende ? (
                <p style={{ fontSize: 'var(--text-sm-sz)' }}>Escolha uma comanda na lista para ver o que está nela e receber, ou comece uma nova venda.</p>
              ) : (
                <p data-unidade-nao-vende style={{ fontSize: 'var(--text-sm-sz)' }}>
                  Esta unidade foi desativada e não vende mais: aqui se recebe o que ficou em aberto. A venda nova é numa unidade ativa.
                </p>
              )}
            </div>
          ) : (
            <ComandaNaTela e={escolhida} hora={hora} slugDaUnidade={slugDaUnidade}
              fichaHref={rotaCliente(pathname, slugDaUnidade, escolhida.comanda.clienteId)}
              hrefDaAssinatura={id => rotaNoPortal(pathname, slugDaUnidade, `/documentos/${id}/assinar`)}
              // A2 da 19ª: a recebida vai na URL, e a tela diz o que entrou.
              aoReceber={() => { router.push(href({ recebida: escolhida.comanda.id })); router.refresh() }}
              aoEstornar={escolhida.comanda.origem === 'ATENDIMENTO'
                // A2 da 17ª: o estorno do atendimento reabre a comanda — ela vai às Abertas, aberta.
                ? () => {
                    const q = new URLSearchParams({ comanda: escolhida.comanda.id })
                    if (naRede) q.set('unidade', unidadeId)
                    router.push(`${basePath}?${q.toString()}`); router.refresh()
                  }
                : () => router.refresh()} />
          )}
        </div>
      </div>
    </div>
  )
}

function ComandaNaTela({ e, hora, slugDaUnidade, fichaHref, hrefDaAssinatura, aoReceber, aoEstornar }: {
  e: ComandaEscolhida
  hora: (iso: string | null) => string
  slugDaUnidade: string
  fichaHref: string
  hrefDaAssinatura: (documentoId: string) => string
  aoReceber: () => void
  aoEstornar: () => void
}) {
  const c = e.comanda
  const aReceber = !c.paga && !c.canceladaEm
  // A10 da 23ª (princípio 3): o voucher, o desconto e os pontos escolhidos no Receber entram no total.
  const [noReceber, setNoReceber] = useState<{ comanda: string; linhas: SaiDaComanda[]; total: number } | null>(null)
  const saiNoReceber = aReceber && c.agendamentoId && !c.planoId && noReceber?.comanda === c.id && noReceber.linhas.length ? noReceber : null
  const emAberto = emAbertoDaComanda(c, useFuso())
  // A1 da 17ª (princípio 3): a comanda paga diz o desconto e o voucher, e o total é o cobrado (D6 da 27ª: com o em aberto).
  const descontos = c.origem === 'ATENDIMENTO' ? descontosDaComanda(c) : []
  // A15 da 24ª (princípio 3): a venda com desconto mostra o item cheio e a linha do desconto.
  const descontoDaVenda = c.origem === 'VENDA' ? e.linha?.desconto ?? 0 : 0
  // D9 da 29ª (PR-08): a venda devolvida em parte vale o vendido menos o devolvido
  // (`c.valor`, do banco); o item segue dizendo o vendido, e o devolvido tem a linha dele.
  const devolvido = c.origem === 'VENDA' ? e.linha?.devolvido ?? null : null
  const devolvidoDaVenda = devolvido?.valor ?? 0
  const totalPago = c.origem === 'ATENDIMENTO' && c.paga && !c.estornada && c.recebido != null
  // A2 da 17ª: a comanda reaberta diz o pagamento estornado de antes.
  const estornoAnterior = aReceber ? estornoAnteriorEmTexto(c, hora) : null
  // D2 da 18ª: a reaberta cita também o produto estornado.
  const produtoEstornado = aReceber && c.origem === 'ATENDIMENTO' ? produtosEstornadosEmTexto(e.itens, hora) : null
  // D1 da 19ª: a comanda da venda diz o estorno de antes — a receber de novo, ou recebida de novo.
  const estornoDaVenda = estornoDaVendaEmTexto(c, hora)
  // A7 da 19ª: o voucher da comanda paga depois do estorno só do produto.
  const voucherDoEstornado = c.origem === 'ATENDIMENTO' ? voucherDoProdutoEstornadoEmTexto(c, e.itens) : null
  // A1 da 18ª: o atendimento e os produtos recebidos juntos são dois lançamentos — a tela diz.
  const pagoJunto = e.pagamentos ? pagoJuntoEmTexto(e.pagamentos) : null
  // A1 da 18ª: o estorno é por lançamento — com produto, o atendimento ou o produto.
  const quemEstornaOQue = c.origem === 'ATENDIMENTO' && c.produtos > 0
    ? 'Estornar o atendimento ou o produto desta comanda é de quem tem o Financeiro em Gerenciar'
    : 'Estornar esta comanda é de quem tem o Financeiro em Gerenciar'
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 22px', borderBottom: '1px solid var(--hairline)' }}>
        <div aria-hidden style={{
          width: 42, height: 42, borderRadius: 'var(--radius-full)', background: 'var(--brand-soft)', color: 'var(--brand)',
          fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>{iniciaisDoNome(c.cliente)}</div>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 'var(--text-name)', fontWeight: 800, letterSpacing: 'var(--tracking-tight)', color: 'var(--text)' }}>{c.cliente}</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', marginTop: 2 }}>
            Comanda nº {String(c.numero).padStart(4, '0')} · {c.origem === 'VENDA' ? `venda das ${hora(c.abertaEm)}`
              : c.origem === 'PLANO' ? `aberta às ${hora(c.abertaEm)} no aceite do plano`
              : `aberta às ${hora(c.abertaEm)} ao iniciar o atendimento`}
          </p>
        </div>
        <span style={{ flex: 1 }} />
        <Link href={fichaHref} style={{ color: 'var(--brand)', fontWeight: 700, fontSize: 'var(--text-xs-sz)', textDecoration: 'none' }}>Ver ficha</Link>
      </div>
      <div className="pdv-comanda-corpo">
        <div className="pdv-itens" style={{ padding: '18px 22px' }}>
          <p className="overline" style={{ marginBottom: 4 }}>O que está na comanda</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 40px 110px', gap: 10, alignItems: 'center', padding: '11px 0', borderBottom: '1px solid var(--hairline)' }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontWeight: 700, color: 'var(--text)' }}>{c.procedimento ?? 'Atendimento'}</p>
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', marginTop: 2 }}>
                {c.origem === 'VENDA'
                  ? ['Venda', c.profissional ? `vendida por ${c.profissional}` : null].filter(Boolean).join(' · ')
                  : c.origem === 'PLANO'
                  ? ['Plano de tratamento', c.profissional ? `de ${c.profissional}` : null].filter(Boolean).join(' · ')
                  : [c.agendadoPara ? `Atendimento das ${hora(c.agendadoPara)}` : 'Atendimento', c.profissional].filter(Boolean).join(' · ')}
              </p>
              {e.linha?.detalhe && (
                <p data-detalhe-da-linha style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', marginTop: 2 }}>{e.linha.detalhe}</p>
              )}
            </div>
            <span data-quantidade-da-linha style={{ color: 'var(--text-muted)', textAlign: 'center', fontWeight: 600 }}>{e.linha?.quantidade ?? 1}</span>
            <span style={{ textAlign: 'right', fontWeight: 800, color: 'var(--text)' }}>{brl((e.valorDoAtendimento ?? c.valor) + descontoDaVenda + devolvidoDaVenda)}</span>
          </div>
          {c.origem === 'ATENDIMENTO' && (
            <ProdutosDaComanda comandaId={c.id} slug={slugDaUnidade} itens={e.itens} aReceber={aReceber} naoPontua={!!e.produtoNaoPontua}
              produtos={aReceber && c.agendamentoId ? e.produtosParaAcrescentar : null} />
          )}
          {/* D1 da 16ª (princípio 3): reaberta pelo estorno só do atendimento, o
              produto já vendido não entra no que se cobra — a tela diz quanto já foi pago.
              2026-11-16: e reaberta pelo estorno de UMA das formas, as que ficaram também. */}
          {aReceber && c.jaPago > 0 && (
            <div data-ja-pago-da-comanda style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 12, marginTop: 8, color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
              <span>Já pago</span>
              <span style={{ fontWeight: 700 }}>{brl(c.jaPago)}</span>
            </div>
          )}
          {descontos.map(d => (
            <div key={d.chave} data-desconto-da-comanda={d.chave} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 10, color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
              <span>{d.rotulo}</span>
              <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>−{brl(d.valor)}</span>
            </div>
          ))}
          {descontoDaVenda > 0 && (
            <div data-desconto-da-venda style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 10, color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
              <span>Desconto</span>
              <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>−{brl(descontoDaVenda)}</span>
            </div>
          )}
          {devolvido && devolvidoDaVenda > 0 && (
            <div data-devolvido-da-venda style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, paddingTop: 10, color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
              <span>{devolvido.itens ? `Devolvido: ${devolvido.itens}` : 'Devolvido'}</span>
              <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>−{brl(devolvidoDaVenda)}</span>
            </div>
          )}
          {saiNoReceber?.linhas.map(d => (
            <div key={d.chave} data-sai-no-receber={d.chave} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 10, color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
              <span>{d.rotulo}</span>
              <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>−{brl(d.valor)}</span>
            </div>
          ))}
          {/* D6 da 27ª (princípio 3): no crediário, o total é o da comanda (o recebido se diz ao lado, em "R$ … recebidos"). */}
          <div data-total-da-comanda style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, paddingTop: 12, marginTop: 8 }}>
            <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>{rotuloDoTotalDaComanda(c, { temDescontos: descontos.length > 0 })}</span>
            <b style={{ fontSize: 'var(--text-kpi)', fontWeight: 800, letterSpacing: 'var(--tracking-tight)', color: 'var(--text)', whiteSpace: 'nowrap' }}>{brl(totalPago ? valorNaLista(c) : saiNoReceber ? saiNoReceber.total : c.valor)}</b>
          </div>
        </div>
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p className="overline">Receber</p>
          {c.estornada ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
              {/* A2 da 20ª: cobrar de novo é uma Nova venda. */}
              {vendaEstornadaEmTexto(c)}
            </p>
          ) : c.canceladaEm ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
              Sem cobrança desde as {hora(c.canceladaEm)}: {(c.canceladaMotivo ?? 'Atendimento cancelado').toLocaleLowerCase('pt-BR')}. Não há o que receber.
            </p>
          ) : c.paga ? (
            <>
              <p data-comanda-paga style={{ color: 'var(--text)', fontSize: 'var(--text-sm-sz)' }}>
                {/* A9 da 30ª: com dinheiro em aberto, "Fechada" (a regra do selo). */}
                {verboDaComandaPaga(c)} às {hora(c.pagaEm)} · {formasDaComandaEmTexto(c)} · <b>{brl(c.recebido ?? 0)}</b> recebidos
                {/* A2 da 15ª: a quem não estorna, de quem é o estorno — a frase da ficha.
                    Mora na dica (2026-11-16 — era uma caixa fixa embaixo dos pagamentos). */}
                {e.quemEstorna && (
                  <>
                    {' '}
                    <Dica rotulo="Quem estorna esta comanda">
                      <span data-quem-estorna>
                        {quemEstornaOQue}
                        {e.quemEstorna.length > 0 ? `: ${e.quemEstorna.join(', ')} (na ficha da cliente, aba Financeiro).` : ' (ninguém na equipe tem hoje: veja em Configurações → Cargos).'}
                      </span>
                    </Dica>
                  </>
                )}
              </p>
              {/* A1/A17 da 15ª (princípio 3): a venda nasce paga, e o que ficou em aberto se diz. */}
              {emAberto && (
                <p data-comanda-em-aberto style={{
                  color: 'var(--warning)', background: 'var(--warning-soft)', border: '1px solid var(--warning-border)',
                  borderRadius: 'var(--radius-field-token)', padding: '8px 12px', fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-semibold)',
                }}>
                  {emAberto}
                </p>
              )}
              {/* A16 da 24ª (princípio 7): o contrato do pacote que espera a assinatura se colhe daqui. */}
              {(e.documentosParaColher ?? []).map(d => (
                <div key={d.id} data-colher-assinatura-da-venda={d.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 12px',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius-field-token)', background: 'var(--bg-app)',
                }}>
                  <span style={{ flex: '1 1 160px', minWidth: 0, fontSize: 'var(--text-sm-sz)', color: 'var(--text)', overflowWrap: 'anywhere' }}>
                    <b style={{ fontWeight: 'var(--weight-bold)' }}>{d.titulo}</b> · falta a assinatura
                  </span>
                  <Link href={hrefDaAssinatura(d.id)} className="btn-secondary">Colher a assinatura</Link>
                </div>
              ))}
              {e.parcelasDaComanda && e.parcelasDaComanda.length > 0 && (
                <ParcelasEmAberto parcelas={e.parcelasDaComanda} slug={slugDaUnidade} titulo="Parcelas desta venda" compacta />
              )}
              {/* A2 da 17ª (princípio 7): quem estorna estorna aqui, com a janela e o motivo de sempre.
                  A1 da 18ª: cada linha diz o que é, e o recebido junto se diz. */}
              {e.pagamentos && e.pagamentos.length > 0 && (e.podeEstornar || e.pagamentos.length > 1) && (
                <div data-pagamentos-da-comanda style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <p className="field-label">{e.pagamentos.length === 1 ? 'Pagamento desta comanda' : 'Pagamentos desta comanda'}</p>
                  {pagoJunto && (
                    <p data-pago-junto style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                      {pagoJunto}. Cada parte se estorna sozinha.
                    </p>
                  )}
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, border: '1px solid var(--border)', borderRadius: 'var(--radius-field)', background: 'var(--surface)' }}>
                    {e.pagamentos.map((l, i) => (
                      <li key={l.id} data-pagamento-da-comanda={l.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', minWidth: 0,
                        borderTop: i ? '1px solid var(--hairline)' : undefined,
                      }}>
                        {/* A14 da 22ª (design): o texto quebra em vez de cortar, e o valor fica inteiro ao lado. */}
                        <span title={l.descricao} style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                          <b style={{ color: 'var(--text)', fontWeight: 'var(--weight-bold)' }}>{rotuloDoPagamentoDaComanda(l) ?? l.descricao}</b> · {rotuloDaForma(l.metodo, l.vezes, { bandeira: l.bandeira })}
                        </span>
                        <span data-valor-do-pagamento style={{ whiteSpace: 'nowrap', fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)' }}>{brl(l.valor)}</span>
                        {e.podeEstornar && (
                          <AcoesDoLancamentoDaFicha slug={slugDaUnidade} podeEstornar podeReceber={false} aoEstornar={aoEstornar}
                            lancamento={{
                              id: l.id, descricao: l.descricao, valor: l.valor, pago: true, metodo: l.metodo,
                              vendaDeProduto: l.vendaDeProduto, vendaDeCredito: l.vendaDeCredito, doAtendimento: l.doAtendimento,
                            }} />
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : null}
          {estornoAnterior && (
            <p data-estorno-anterior style={{
              color: 'var(--text-muted)', background: 'var(--bg-app)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-field-token)', padding: '8px 12px', fontSize: 'var(--text-xs-sz)',
            }}>
              {estornoAnterior}. Ao receber de novo, o desconto se escolhe de novo.
            </p>
          )}
          {estornoDaVenda && (
            <p data-estorno-da-venda style={{
              color: 'var(--text-muted)', background: 'var(--bg-app)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-field-token)', padding: '8px 12px', fontSize: 'var(--text-xs-sz)',
            }}>
              {estornoDaVenda}
            </p>
          )}
          {voucherDoEstornado && (
            <p data-voucher-do-produto-estornado style={{
              color: 'var(--text-muted)', background: 'var(--bg-app)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-field-token)', padding: '8px 12px', fontSize: 'var(--text-xs-sz)',
            }}>
              {voucherDoEstornado}
            </p>
          )}
          {produtoEstornado && (
            <p data-produto-estornado style={{
              color: 'var(--text-muted)', background: 'var(--bg-app)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-field-token)', padding: '8px 12px', fontSize: 'var(--text-xs-sz)',
            }}>
              {produtoEstornado}. Fica fora do que falta receber.
            </p>
          )}
          {c.estornada || c.canceladaEm || c.paga ? null : aReceber && c.planoId ? (
            <ReceberOPlano key={c.id} planoId={c.planoId} slug={slugDaUnidade} aoReceber={aoReceber} cadastro={e.cadastroDoPlano ?? null} />
          ) : aReceber && c.agendamentoId ? (
            <FormularioDeReceberAtendimento key={`${c.id}:${c.valor}`} appointmentId={c.agendamentoId} slug={slugDaUnidade} price={c.valor}
              clienteId={c.clienteId} pagamentoCombinado={e.pagamentoCombinado} pacotesParaAbater={e.pacotesParaAbater}
              equipeDosProdutos={e.equipeDosProdutos ?? null}
              onFeito={aoReceber} aoMudarOQueSai={(linhas, total) => setNoReceber({ comanda: c.id, linhas, total })} />
          ) : null}
        </div>
      </div>
    </>
  )
}
