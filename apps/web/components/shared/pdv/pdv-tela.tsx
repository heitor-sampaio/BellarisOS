'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { ArrowLeft, Lock, Plus, Search, ShoppingBag } from 'lucide-react'
import { iniciaisDoNome } from '@estetica-os/utils'
import { SegSelect } from '@/components/shared/seg-select'
import { useFuso } from '@/components/shared/fuso'
import { FormularioDeReceberAtendimento, type PacoteParaAbater } from '@/components/shared/receber-atendimento'
import { rotuloDaForma } from '@/lib/financeiro/formas'
import { rotaCliente } from '@/lib/rotas'
import { ReceberOPlano } from '@/components/shared/pdv/receber-o-plano'
import { SITUACOES_DO_PDV, seloDaComanda, emAbertoDaComanda, detalheDaComanda, type ComandaDoPdv, type SituacaoDoPdv } from '@/lib/pdv/situacoes'
import { NovaVenda, type VendaDoPdv } from '@/components/shared/pdv/nova-venda'
import { ProdutosDaComanda } from '@/components/shared/pdv/produtos-da-comanda'
import type { ItemDaComanda } from '@/lib/pdv/itens-da-comanda'
import type { ParcelaEmAberto } from '@/lib/pdv/parcelas-da-cliente'
import { ParcelasEmAberto } from '@/components/shared/pdv/parcelas-em-aberto'

export interface ComandaEscolhida {
  comanda:            ComandaDoPdv
  /** Fase 5b: o preço do atendimento sozinho (a comanda vale ele e os produtos dela). */
  valorDoAtendimento: number | null
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
export function CabecalhoDoPdv({ basePath, unidadeId, naRede, vista, recebidoHoje, abertas, podeReceber = true, podeVerFechamento = true, children }: {
  basePath:     string
  unidadeId:    string
  naRede:       boolean
  vista:        'comandas' | 'fechar'
  recebidoHoje: number
  abertas:      number
  podeReceber?: boolean
  podeVerFechamento?: boolean
  children?:    React.ReactNode
}) {
  const daUnidade = naRede ? `unidade=${unidadeId}` : ''
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 800, letterSpacing: 'var(--tracking-tight)', color: 'var(--text)' }}>PDV</h1>
      <span data-resumo-do-pdv style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', fontWeight: 600 }}>
        Hoje: <b style={{ color: 'var(--text)' }}>{brl(recebidoHoje)}</b> recebidos · <b style={{ color: 'var(--text)' }}>{abertas}</b> {abertas === 1 ? 'comanda aberta' : 'comandas abertas'}
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
export function PdvTela({ basePath, unidades, unidadeId, situacao, comandas, abertas, recebidoHoje, escolhida, slugDaUnidade, novaVenda, podeVerFechamento = true }: {
  basePath:      string
  unidades:      { id: string; name: string }[]
  unidadeId:     string
  situacao:      SituacaoDoPdv
  comandas:      ComandaDoPdv[]
  abertas:       number
  recebidoHoje:  number
  escolhida:     ComandaEscolhida | null
  slugDaUnidade: string
  /** A "Nova venda" aberta (`?nova=1`), com a cliente já escolhida ou não. */
  novaVenda:     { dados: VendaDoPdv | null; aviso?: string; perguntaAUnidade?: boolean } | null
  /** Vê o Fechamento do dia (`podeVerFechamento`): o "Fechar o dia" do topo. */
  podeVerFechamento?: boolean
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
  const visiveis = useMemo(() => {
    const t = busca.trim().toLocaleLowerCase('pt-BR')
    return t ? comandas.filter(c => c.cliente.toLocaleLowerCase('pt-BR').includes(t)) : comandas
  }, [busca, comandas])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <CabecalhoDoPdv basePath={basePath} unidadeId={unidadeId} naRede={naRede} vista="comandas"
        recebidoHoje={recebidoHoje} abertas={abertas} podeVerFechamento={podeVerFechamento}>
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
          {visiveis.length === 0 ? (
            <p style={{ padding: '24px 16px 28px', textAlign: 'center', color: 'var(--text-faint)', fontSize: 'var(--text-sm-sz)' }}>
              {busca.trim() ? `Nenhuma comanda de “${busca.trim()}”.`
                : situacao === 'ABERTAS' ? 'Nenhuma comanda aberta. Ela nasce quando um atendimento é iniciado e tem o que cobrar.'
                : situacao === 'PAGAS' ? 'Nenhuma comanda paga hoje.' : 'Nenhuma comanda hoje.'}
            </p>
          ) : (
            <div style={{ paddingBottom: 8 }}>
              {visiveis.map(c => (
                <Link key={c.id} href={href({ comanda: c.id })} data-comanda={c.id}
                  className={escolhida?.comanda.id === c.id ? 'pdv-linha is-escolhida' : 'pdv-linha'}>
                  <span style={{ fontWeight: 800, fontSize: 'var(--text-base-sz)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.cliente}</span>
                  <span style={{ fontWeight: 800, textAlign: 'right' }}>{brl(c.valor)}</span>
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
              <p style={{ fontSize: 'var(--text-sm-sz)' }}>Escolha uma comanda à esquerda para ver o que está nela e receber, ou comece uma nova venda.</p>
            </div>
          ) : (
            <ComandaNaTela e={escolhida} hora={hora} slugDaUnidade={slugDaUnidade}
              fichaHref={rotaCliente(pathname, slugDaUnidade, escolhida.comanda.clienteId)}
              aoReceber={() => { router.push(href({})); router.refresh() }} />
          )}
        </div>
      </div>
    </div>
  )
}

function ComandaNaTela({ e, hora, slugDaUnidade, fichaHref, aoReceber }: {
  e: ComandaEscolhida
  hora: (iso: string | null) => string
  slugDaUnidade: string
  fichaHref: string
  aoReceber: () => void
}) {
  const c = e.comanda
  const aReceber = !c.paga && !c.canceladaEm
  const emAberto = emAbertoDaComanda(c, useFuso())
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
            </div>
            <span style={{ color: 'var(--text-muted)', textAlign: 'center', fontWeight: 600 }}>1</span>
            <span style={{ textAlign: 'right', fontWeight: 800, color: 'var(--text)' }}>{brl(e.valorDoAtendimento ?? c.valor)}</span>
          </div>
          {c.origem === 'ATENDIMENTO' && (
            <ProdutosDaComanda comandaId={c.id} slug={slugDaUnidade} itens={e.itens} aReceber={aReceber}
              produtos={aReceber && c.agendamentoId ? e.produtosParaAcrescentar : null} />
          )}
          {/* D1 da 16ª (princípio 3): reaberta pelo estorno só do atendimento, o
              produto já vendido não entra no que se cobra — a tela diz quanto já foi pago. */}
          {aReceber && c.jaPago > 0 && (
            <div data-ja-pago-da-comanda style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 12, marginTop: 8, color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
              <span>Já pago (os produtos)</span>
              <span style={{ fontWeight: 700 }}>{brl(c.jaPago)}</span>
            </div>
          )}
          <div data-total-da-comanda style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 12, marginTop: 8 }}>
            <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>{aReceber && c.jaPago > 0 ? 'Falta receber' : 'Total'}</span>
            <b style={{ fontSize: 'var(--text-kpi)', fontWeight: 800, letterSpacing: 'var(--tracking-tight)', color: 'var(--text)' }}>{brl(c.valor)}</b>
          </div>
        </div>
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p className="overline">Receber</p>
          {c.estornada ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
              Venda estornada: o dinheiro dela voltou. Não há o que receber.
            </p>
          ) : c.canceladaEm ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
              Sem cobrança desde as {hora(c.canceladaEm)}: {(c.canceladaMotivo ?? 'Atendimento cancelado').toLocaleLowerCase('pt-BR')}. Não há o que receber.
            </p>
          ) : c.paga ? (
            <>
              <p data-comanda-paga style={{ color: 'var(--text)', fontSize: 'var(--text-sm-sz)' }}>
                {c.origem === 'VENDA' ? 'Vendida' : c.origem === 'PLANO' ? 'Recebido' : 'Paga'} às {hora(c.pagaEm)} · {rotuloDaForma(c.forma)} · <b>{brl(c.recebido ?? 0)}</b> recebidos
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
                <ParcelasEmAberto parcelas={e.parcelasDaComanda} slug={slugDaUnidade} titulo="Parcelas desta venda" />
              )}
              {/* A2 da 15ª: a quem não estorna, de quem é o estorno — a frase da ficha. */}
              {e.quemEstorna && (
                <p data-quem-estorna style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 'var(--radius-field-token)', padding: '8px 12px' }}>
                  Estornar esta comanda é de quem tem o Financeiro em Gerenciar
                  {e.quemEstorna.length > 0 ? `: ${e.quemEstorna.join(', ')} (na ficha da cliente, aba Financeiro).` : ' (ninguém na equipe tem hoje: veja em Configurações → Cargos).'}
                </p>
              )}
            </>
          ) : aReceber && c.planoId ? (
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
