'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Lock, Plus, Search, ShoppingBag } from 'lucide-react'
import { iniciaisDoNome } from '@estetica-os/utils'
import { SegSelect } from '@/components/shared/seg-select'
import { useFuso } from '@/components/shared/fuso'
import { FormularioDeReceberAtendimento, type PacoteParaAbater } from '@/components/shared/receber-atendimento'
import { rotuloDaForma } from '@/lib/financeiro/formas'
import { rotaCliente } from '@/lib/rotas'
import { SITUACOES_DO_PDV, type ComandaDoPdv, type SituacaoDoPdv } from '@/lib/pdv/situacoes'
import { NovaVenda, type VendaDoPdv } from '@/components/shared/pdv/nova-venda'

export interface ComandaEscolhida {
  comanda:            ComandaDoPdv
  pacotesParaAbater:  PacoteParaAbater[]
  pagamentoCombinado: { metodo: string | null; rotulo: string; desconto?: number } | null
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const horaNo = (fuso: string) => (iso: string | null) => iso
  ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: fuso }) : ''

/** A situação da comanda, como o balcão a lê. */
function selo(c: ComandaDoPdv): { texto: string; tom: 'ok' | 'warn' | 'info' | 'perigo' } {
  if (c.estornada) return { texto: 'Estornada', tom: 'perigo' }
  if (c.canceladaEm) return c.canceladaMotivo === 'Sessão do pacote' || c.canceladaMotivo === 'Procedimento pré-pago'
    ? { texto: c.canceladaMotivo, tom: 'ok' } : { texto: 'Cancelada', tom: 'perigo' }
  if (c.paga) return { texto: 'Paga', tom: 'ok' }
  if (c.atendimento === 'IN_PROGRESS') return { texto: 'Em atendimento', tom: 'info' }
  return { texto: 'Atendida, a pagar', tom: 'warn' }
}

const TOM: Record<'ok' | 'warn' | 'info' | 'perigo', React.CSSProperties> = {
  ok:     { background: 'var(--success-soft)', color: 'var(--success)', border: '1px solid transparent' },
  warn:   { background: 'var(--warning-soft)', color: 'var(--warning)', border: '1px solid var(--warning-border)' },
  info:   { background: 'var(--info-soft)', color: 'var(--info)', border: '1px solid var(--info-border)' },
  perigo: { background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid var(--danger-border)' },
}

function Selo({ c }: { c: ComandaDoPdv }) {
  const s = selo(c)
  return (
    <span style={{
      ...TOM[s.tom], justifySelf: 'end', display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 9px',
      borderRadius: 'var(--radius-chip)', fontSize: 'var(--text-2xs)', fontWeight: 700, whiteSpace: 'nowrap',
    }}>{s.texto}</span>
  )
}

/**
 * A tela do PDV (PDV1, o desenho aprovado pelo Heitor em 2026-11-13): as
 * comandas da unidade à esquerda; a escolhida à direita, com o que está nela
 * e o "Receber". Não existe pagamento sem forma (PDV8): o "Receber" espera a
 * forma escolhida.
 */
export function PdvTela({ basePath, unidades, unidadeId, situacao, comandas, abertas, recebidoHoje, escolhida, slugDaUnidade, novaVenda }: {
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 800, letterSpacing: 'var(--tracking-tight)', color: 'var(--text)' }}>PDV</h1>
        <span data-resumo-do-pdv style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', fontWeight: 600 }}>
          Hoje: <b style={{ color: 'var(--text)' }}>{brl(recebidoHoje)}</b> recebidos · <b style={{ color: 'var(--text)' }}>{abertas}</b> {abertas === 1 ? 'comanda aberta' : 'comandas abertas'}
        </span>
        <span style={{ flex: 1 }} />
        {naRede && (
          <SegSelect options={unidades.map(u => ({ key: u.id, label: u.name }))} value={unidadeId}
            onSelect={k => router.push(hrefNaUnidade(k))} ariaLabel="Unidade" />
        )}
        <Link href={href({ nova: '1' })} className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Plus size={15} aria-hidden /> Nova venda
        </Link>
        <Link href={basePath.replace(/\/pdv$/, '/fechamento') + (naRede ? `?unidade=${unidadeId}` : '')} className="btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Lock size={14} /> Fechar o dia
        </Link>
      </div>

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
                : situacao === 'ABERTAS' ? 'Nenhuma comanda aberta. Ela nasce quando um atendimento é iniciado.'
                : situacao === 'PAGAS' ? 'Nenhuma comanda paga hoje.' : 'Nenhuma comanda hoje.'}
            </p>
          ) : (
            <div style={{ paddingBottom: 8 }}>
              {visiveis.map(c => (
                <Link key={c.id} href={href({ comanda: c.id })} data-comanda={c.id}
                  className={escolhida?.comanda.id === c.id ? 'pdv-linha is-escolhida' : 'pdv-linha'}>
                  <span style={{ fontWeight: 800, fontSize: 'var(--text-base-sz)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.cliente}</span>
                  <span style={{ fontWeight: 800, textAlign: 'right' }}>{brl(c.valor)}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[c.procedimento, c.agendadoPara ? hora(c.agendadoPara) : null, c.paga ? rotuloDaForma(c.forma) : c.profissional]
                      .filter(Boolean).join(' · ')}
                  </span>
                  <Selo c={c} />
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card" data-comanda-aberta={!novaVenda && escolhida ? escolhida.comanda.id : undefined}>
          {novaVenda ? (
            <NovaVenda unidadeId={unidadeId} venda={novaVenda.dados} aviso={novaVenda.aviso}
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
            Comanda nº {String(c.numero).padStart(4, '0')} · {c.origem === 'VENDA' ? `venda das ${hora(c.abertaEm)}` : `aberta às ${hora(c.abertaEm)} ao iniciar o atendimento`}
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
                  : [c.agendadoPara ? `Atendimento das ${hora(c.agendadoPara)}` : 'Atendimento', c.profissional].filter(Boolean).join(' · ')}
              </p>
            </div>
            <span style={{ color: 'var(--text-muted)', textAlign: 'center', fontWeight: 600 }}>1</span>
            <span style={{ textAlign: 'right', fontWeight: 800, color: 'var(--text)' }}>{brl(c.valor)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 12, marginTop: 8 }}>
            <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>Total</span>
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
            <p data-comanda-paga style={{ color: 'var(--text)', fontSize: 'var(--text-sm-sz)' }}>
              {c.origem === 'VENDA' ? 'Vendida' : 'Paga'} às {hora(c.pagaEm)} · {rotuloDaForma(c.forma)} · <b>{brl(c.recebido ?? 0)}</b> recebidos
            </p>
          ) : aReceber && c.agendamentoId ? (
            <FormularioDeReceberAtendimento key={c.id} appointmentId={c.agendamentoId} slug={slugDaUnidade} price={c.valor}
              clienteId={c.clienteId} pagamentoCombinado={e.pagamentoCombinado} pacotesParaAbater={e.pacotesParaAbater}
              emBlocos onFeito={aoReceber} />
          ) : null}
        </div>
      </div>
    </>
  )
}
