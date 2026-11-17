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
import { rotaCliente } from '@/lib/rotas'
import { ReceberOPlano } from '@/components/shared/pdv/receber-o-plano'
import {
  SITUACOES_DO_PDV, seloDaComanda, emAbertoDaComanda, detalheDaComanda, formasDaComandaEmTexto, descontosDaComanda,
  estornoAnteriorEmTexto, valorNaLista, produtosEstornadosEmTexto, pagoJuntoEmTexto, rotuloDoPagamentoDaComanda,
  estornoDaVendaEmTexto, recebidaAgoraEmTexto, voucherDoProdutoEstornadoEmTexto, vendaEstornadaEmTexto, rotuloDoDiaNoPdv, textoDasComValorEmAberto,
  abertasNasOutrasEmTexto, type AbertasNaOutraUnidade, type ComandaDoPdv, type SituacaoDoPdv,
} from '@/lib/pdv/situacoes'
import { NovaVenda, type VendaDoPdv } from '@/components/shared/pdv/nova-venda'
import { ProdutosDaComanda } from '@/components/shared/pdv/produtos-da-comanda'
import type { ItemDaComanda } from '@/lib/pdv/itens-da-comanda'
import type { ParcelaEmAberto } from '@/lib/pdv/parcelas-da-cliente'
import { ParcelasEmAberto } from '@/components/shared/pdv/parcelas-em-aberto'
import { AcoesDoLancamentoDaFicha } from '@/components/shared/acoes-do-lancamento-da-ficha'
import type { LancamentoDaComanda } from '@/lib/pdv/lancamentos-da-comanda'
import type { LinhaDaComanda } from '@/lib/pdv/linha-da-comanda'

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
      <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 800, letterSpacing: 'var(--tracking-tight)', color: 'var(--text)' }}>PDV</h1>
      <span data-resumo-do-pdv style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', fontWeight: 600 }}>
        {rotuloDoDiaNoPdv(naRede ? unidadeNome : null)}: <b style={{ color: 'var(--text)' }}>{brl(recebidoHoje)}</b> recebidos · <b style={{ color: 'var(--text)' }}>{abertas}</b> {abertas === 1 ? 'comanda aberta' : 'comandas abertas'}
        {textoDasComValorEmAberto(comValorEmAberto) && <span data-com-valor-em-aberto> · {textoDasComValorEmAberto(comValorEmAberto)}</span>}
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
export function PdvTela({ basePath, unidades, unidadeId, situacao, comandas, abertas, abertasNasOutras = [], comValorEmAberto = 0, recebidoHoje, escolhida, slugDaUnidade, novaVenda, podeVerFechamento = true, recebidaAgora = null }: {
  basePath:      string
  unidades:      { id: string; name: string }[]
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
  /** Vê o Fechamento do dia (`podeVerFechamento`): o "Fechar o dia" do topo. */
  podeVerFechamento?: boolean
  /** A2 da 19ª: a comanda que acabou de ser recebida (`?recebida=`) — a tela diz o que entrou. */
  recebidaAgora?: ComandaDoPdv | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const clienteDaUrl = useSearchParams().get('cliente')
  const hora = horaNo(useFuso())
  const [busca, setBusca] = useState('')

  const naRede = unidades.length > 1
  const href = (mais: Record<string, string>) => {
    const q = new URLSearchParams()
    if (naRede) q.set('unidade', unidadeId)
    if (situacao !== 'ABERTAS') q.set('ver', situacao)
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
    return t ? comandas.filter(c => c.cliente.toLocaleLowerCase('pt-BR').includes(t)) : comandas
  }, [busca, comandas])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <CabecalhoDoPdv basePath={basePath} unidadeId={unidadeId} naRede={naRede} vista="comandas"
        recebidoHoje={recebidoHoje} abertas={abertas} comValorEmAberto={comValorEmAberto} podeVerFechamento={podeVerFechamento}
        unidadeNome={unidades.find(u => u.id === unidadeId)?.name ?? null}>
        {naRede && (
          <SegSelect options={unidades.map(u => ({ key: u.id, label: u.name }))} value={unidadeId}
            onSelect={k => router.push(hrefNaUnidade(k))} ariaLabel="Unidade" />
        )}
        <Link href={href({ nova: '1' })} className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Plus size={15} aria-hidden /> Nova venda
        </Link>
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
          {/* A15 da 22ª: a comanda aberta numa outra unidade não some atrás do "Nenhuma comanda aberta". */}
          {situacao === 'ABERTAS' && abertasNasOutrasEmTexto(abertasNasOutras).length > 0 && (
            <p data-abertas-nas-outras style={{ padding: '0 14px 10px', fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
              {abertasNasOutrasEmTexto(abertasNasOutras).map(o => (
                <Link key={o.id} href={hrefNaUnidade(o.id)} style={{ color: 'var(--brand)', fontWeight: 700 }}>{o.texto}</Link>
              ))}
            </p>
          )}
          {visiveis.length === 0 ? (
            <p style={{ padding: '24px 16px 28px', textAlign: 'center', color: 'var(--text-faint)', fontSize: 'var(--text-sm-sz)' }}>
              {busca.trim() ? `Nenhuma comanda de “${busca.trim()}”.`
                : situacao === 'ABERTAS' ? 'Nenhuma comanda aberta. Ela nasce quando um atendimento é iniciado e tem o que cobrar.'
                : situacao === 'PAGAS' ? 'Nenhuma comanda fechada hoje.' : 'Nenhuma comanda hoje.'}
            </p>
          ) : (
            <div style={{ paddingBottom: 8 }}>
              {visiveis.map(c => (
                <Link key={c.id} href={href({ comanda: c.id })} data-comanda={c.id}
                  className={escolhida?.comanda.id === c.id ? 'pdv-linha is-escolhida' : 'pdv-linha'}>
                  <span style={{ fontWeight: 800, fontSize: 'var(--text-base-sz)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.cliente}</span>
                  {/* A1 da 17ª: a comanda do atendimento paga mostra o que foi pago. */}
                  <span data-valor-na-lista style={{ fontWeight: 800, textAlign: 'right' }}>{brl(valorNaLista(c))}</span>
                  <span title={detalheDaComanda(c, hora)} style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {detalheDaComanda(c, hora)}
                  </span>
                  <Selo c={c} />
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card" data-comanda-aberta={!novaVenda && escolhida ? escolhida.comanda.id : undefined}>
          {novaVenda ? (
            <NovaVenda unidadeId={unidadeId} slugDaUnidade={slugDaUnidade} venda={novaVenda.dados} aviso={novaVenda.aviso}
              unidades={novaVenda.perguntaAUnidade ? unidades.map(u => ({ ...u, href: hrefNaUnidade(u.id) })) : null}
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
              <p style={{ fontSize: 'var(--text-sm-sz)' }}>Escolha uma comanda na lista para ver o que está nela e receber, ou comece uma nova venda.</p>
            </div>
          ) : (
            <ComandaNaTela e={escolhida} hora={hora} slugDaUnidade={slugDaUnidade}
              fichaHref={rotaCliente(pathname, slugDaUnidade, escolhida.comanda.clienteId)}
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

function ComandaNaTela({ e, hora, slugDaUnidade, fichaHref, aoReceber, aoEstornar }: {
  e: ComandaEscolhida
  hora: (iso: string | null) => string
  slugDaUnidade: string
  fichaHref: string
  aoReceber: () => void
  aoEstornar: () => void
}) {
  const c = e.comanda
  const aReceber = !c.paga && !c.canceladaEm
  const emAberto = emAbertoDaComanda(c, useFuso())
  // A1 da 17ª (princípio 3): a comanda paga diz o desconto e o voucher, e o total é o que foi pago.
  const descontos = c.origem === 'ATENDIMENTO' ? descontosDaComanda(c) : []
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
            <span style={{ textAlign: 'right', fontWeight: 800, color: 'var(--text)' }}>{brl(e.valorDoAtendimento ?? c.valor)}</span>
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
          <div data-total-da-comanda style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 12, marginTop: 8 }}>
            <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>{aReceber && c.jaPago > 0 ? 'Falta receber' : totalPago && descontos.length ? 'Total pago' : 'Total'}</span>
            <b style={{ fontSize: 'var(--text-kpi)', fontWeight: 800, letterSpacing: 'var(--tracking-tight)', color: 'var(--text)' }}>{brl(totalPago ? c.recebido! : c.valor)}</b>
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
                {c.origem === 'VENDA' ? 'Vendida' : c.origem === 'PLANO' ? 'Recebido' : 'Paga'} às {hora(c.pagaEm)} · {formasDaComandaEmTexto(c)} · <b>{brl(c.recebido ?? 0)}</b> recebidos
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
            <ReceberOPlano key={c.id} planoId={c.planoId} slug={slugDaUnidade} aoReceber={aoReceber} />
          ) : aReceber && c.agendamentoId ? (
            <FormularioDeReceberAtendimento key={`${c.id}:${c.valor}`} appointmentId={c.agendamentoId} slug={slugDaUnidade} price={c.valor}
              clienteId={c.clienteId} pagamentoCombinado={e.pagamentoCombinado} pacotesParaAbater={e.pacotesParaAbater}
              onFeito={aoReceber} />
          ) : null}
        </div>
      </div>
    </>
  )
}
