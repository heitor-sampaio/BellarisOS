'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { Search, X } from 'lucide-react'
import { iniciaisDoNome } from '@estetica-os/utils'
import { buscarClientesParaVender } from '@/actions/pdv'
import { VendaNaTela, type ProcedimentoAVenda, type ProdutoAVenda, type MembroDaVenda } from '@/components/shared/vender'
import type { PacoteAVenda } from '@/components/shared/vender-pacote'
import type { AtendimentoAReceber } from '@/lib/metrics/a-receber'
import type { ParcelaEmAberto } from '@/lib/pdv/parcelas-da-cliente'
import { ParcelasEmAberto } from '@/components/shared/pdv/parcelas-em-aberto'

/** O que a "Nova venda" precisa, com a cliente escolhida. */
export interface VendaDoPdv {
  cliente:       { id: string; name: string; phone: string | null }
  pacotes:       PacoteAVenda[]
  procedimentos: ProcedimentoAVenda[]
  produtos:      ProdutoAVenda[]
  equipe:        MembroDaVenda[]
  aReceber:      AtendimentoAReceber[]
  podeAgendar:   boolean
  /** CX1: as parcelas do crediário e os a receber dela no caixa desta unidade. */
  emAberto:      ParcelaEmAberto[]
}

/**
 * A "Nova venda" do PDV (PDV2, PDV5–PDV7; o desenho aprovado pelo Heitor em
 * 2026-11-13): primeiro a cliente, depois o que vender — procedimento, pacote,
 * produto ou crédito na rede — e como paga. A cliente escolhida vai para a URL
 * (`?cliente=`), que é o que a busca e o inbox usam para chegar aqui com ela.
 */
export function NovaVenda({ unidadeId, slugDaUnidade, venda, aviso, unidades, hrefDaCliente, hrefCancelar, aoVender }: {
  unidadeId:     string
  /** O endereço da unidade: receber a parcela revalida as telas dela. */
  slugDaUnidade: string
  venda:         VendaDoPdv | null
  /** Por que a cliente da URL não está na venda (a arquivada). */
  aviso?:        string
  /**
   * Na rede, sem a unidade na URL (o inbox e a busca chegam assim): a venda
   * pergunta "Em qual unidade?" antes de tudo — não vende calada na primeira.
   */
  unidades?:     { id: string; name: string; href: string }[] | null
  hrefDaCliente: (clienteId: string | null) => string
  hrefCancelar:  string
  aoVender:      () => void
}) {
  return (
    <section role="region" aria-label="Vender" data-nova-venda style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 22px', borderBottom: '1px solid var(--hairline)' }}>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>Nova venda</h2>
        <span style={{ flex: 1 }} />
        <Link href={hrefCancelar} className="btn-ghost" aria-label="Cancelar a venda" style={{ padding: 6, display: 'inline-flex' }}>
          <X size={16} aria-hidden />
        </Link>
      </div>
      <div style={{ padding: '18px 22px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {unidades ? (
          <div data-unidade-da-venda style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p className="field-label">Em qual unidade é a venda?</p>
            <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 'var(--radius-field)', overflow: 'hidden' }}>
              {unidades.map(u => (
                <Link key={u.id} href={u.href} role="button" className="pdv-linha"
                  style={{ gridTemplateColumns: 'minmax(0, 1fr)', borderBottom: '1px solid var(--hairline)', fontWeight: 700 }}>
                  {u.name}
                </Link>
              ))}
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)' }}>O catálogo, o estoque e o caixa são os da unidade escolhida.</p>
          </div>
        ) : venda ? (
          <>
            <div data-cliente-da-venda style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div aria-hidden style={{
                width: 38, height: 38, borderRadius: 'var(--radius-full)', background: 'var(--brand-soft)', color: 'var(--brand)',
                fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>{iniciaisDoNome(venda.cliente.name)}</div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontWeight: 800, color: 'var(--text)' }}>{venda.cliente.name}</p>
                {venda.cliente.phone && <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)' }}>{venda.cliente.phone}</p>}
              </div>
              <span style={{ flex: 1 }} />
              <Link href={hrefDaCliente(null)} style={{ color: 'var(--brand)', fontWeight: 700, fontSize: 'var(--text-xs-sz)', textDecoration: 'none' }}>
                Trocar a cliente
              </Link>
            </div>
            {/* CX1: a cliente que veio pagar a parcela recebe aqui, antes de vender. */}
            <ParcelasEmAberto parcelas={venda.emAberto} slug={slugDaUnidade} />
            <VendaNaTela key={venda.cliente.id} clienteId={venda.cliente.id} branchId={unidadeId}
              pacotes={venda.pacotes} procedimentos={venda.procedimentos} produtos={venda.produtos} equipe={venda.equipe}
              podeAgendar={venda.podeAgendar} aReceber={venda.aReceber} onFim={aoVender} />
          </>
        ) : (
          <>
            {aviso && (
              <p role="alert" data-aviso-da-cliente style={{ padding: '10px 12px', borderRadius: 'var(--radius-field)', background: 'var(--warning-soft)', border: '1px solid var(--warning-border)', color: 'var(--text)', fontSize: 'var(--text-sm-sz)', fontWeight: 600 }}>
                {aviso}
              </p>
            )}
            <EscolherACliente hrefDaCliente={hrefDaCliente} />
          </>
        )}
      </div>
    </section>
  )
}

function EscolherACliente({ hrefDaCliente }: { hrefDaCliente: (clienteId: string | null) => string }) {
  const [termo, setTermo] = useState('')
  const [achadas, setAchadas] = useState<{ id: string; name: string; phone: string }[]>([])
  const [buscando, iniciar] = useTransition()
  useEffect(() => {
    const t = termo.trim()
    if (t.length < 2) return
    const espera = setTimeout(() => iniciar(async () => setAchadas((await buscarClientesParaVender(t)).clientes)), 250)
    return () => clearTimeout(espera)
  }, [termo])
  // Com menos de duas letras não se busca, e o que se achou antes some.
  const lista = termo.trim().length >= 2 ? achadas : []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label htmlFor="cliente-da-venda" className="field-label">Cliente da venda</label>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <Search size={14} aria-hidden style={{ position: 'absolute', left: 10, color: 'var(--text-faint)' }} />
        <input id="cliente-da-venda" className="field" autoFocus placeholder="Nome ou telefone" value={termo}
          onChange={e => setTermo(e.target.value)} style={{ paddingLeft: 30, width: '100%' }} />
      </div>
      {termo.trim().length >= 2 && !buscando && lista.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>Nenhuma cliente com “{termo.trim()}”.</p>
      )}
      {lista.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 'var(--radius-field)', overflow: 'hidden' }}>
          {lista.map(c => (
            <Link key={c.id} href={hrefDaCliente(c.id)} role="button" className="pdv-linha"
              style={{ gridTemplateColumns: 'minmax(0, 1fr) auto', borderBottom: '1px solid var(--hairline)' }}>
              <span style={{ fontWeight: 700 }}>{c.name}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)' }}>{c.phone}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
