'use client'

import { useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { JanelaModal } from '@/components/shared/janela-modal'
import { aplicacoesDoLote } from '@/actions/stock'
import type { AplicacaoDoLote } from '@/lib/estoque/aplicacoes-do-lote'

/**
 * "Aplicado em" (A40 da 7ª simulação, 2026-11-05 — o recall): em quem o lote
 * foi aplicado ou para quem foi vendido, com o dia, quem atendeu (ou vendeu) e
 * a quantidade. A lista é do servidor (`aplicacoesDoLote`).
 */
export function BotaoAplicadoEm({ loteId, rotulo }: { loteId: string; rotulo: string }) {
  const [aberto, setAberto] = useState(false)
  const [lista, setLista] = useState<AplicacaoDoLote[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, iniciar] = useTransition()

  function abrir(e: React.MouseEvent) {
    e.stopPropagation()
    setAberto(true); setErro(null); setLista(null)
    iniciar(async () => {
      const r = await aplicacoesDoLote(loteId)
      if (r.error) { setErro(r.error); return }
      setLista(r.aplicacoes ?? [])
    })
  }

  const dia = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  return (
    <>
      <button type="button" onClick={abrir} className="btn-ghost" style={{ fontSize: 'var(--text-2xs)', padding: '0 6px', color: 'var(--brand)', fontWeight: 700 }}>
        Aplicado em
      </button>
      {aberto && (
        <span style={{ display: 'contents' }} onClick={e => e.stopPropagation()}>
          <JanelaModal onFechar={() => setAberto(false)} rotulo={`Aplicado em · ${rotulo}`} largura={560}>
            <div style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                  <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>Aplicado em</h2>
                  <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>{rotulo}</p>
                </div>
                <button type="button" className="btn-ghost" onClick={() => setAberto(false)} aria-label="Fechar" style={{ padding: '4px 6px' }}><X size={16} /></button>
              </div>
              {carregando && <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>Carregando…</p>}
              {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
              {lista && lista.length === 0 && (
                <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>Nenhuma saída deste lote para uma cliente ainda.</p>
              )}
              {lista && lista.length > 0 && (
                <div className="table-wrap">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm-sz)' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 'var(--text-2xs)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        <th style={{ padding: '6px 8px' }}>Cliente</th>
                        <th style={{ padding: '6px 8px' }}>Quando</th>
                        <th style={{ padding: '6px 8px' }}>Quem</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Quantidade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lista.map(a => (
                        <tr key={a.movimentoId} data-aplicacao-do-lote style={{ borderTop: '1px solid var(--hairline)' }}>
                          <td style={{ padding: '8px', fontWeight: 700, color: 'var(--text)' }}>{a.cliente}</td>
                          <td style={{ padding: '8px', color: 'var(--text-soft)' }}>{dia(a.quando)}{a.tipo === 'VENDA' ? ' · venda' : ''}</td>
                          <td style={{ padding: '8px', color: 'var(--text-soft)' }}>{a.quem ?? '—'}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text)' }}>{a.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {a.unidade}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                A baixa segue o lote que vence primeiro (FEFO): é por ela que cada aplicação fica ligada ao lote.
              </p>
            </div>
          </JanelaModal>
        </span>
      )}
    </>
  )
}
