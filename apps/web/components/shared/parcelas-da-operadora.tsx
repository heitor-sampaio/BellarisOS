'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CreditCard } from 'lucide-react'
import { formatBRL } from '@estetica-os/utils'
import { JanelaModal } from '@/components/shared/janela-modal'
import { anteciparParcelaDaOperadora } from '@/actions/financial'
import type { ParcelaDaOperadora, SituacaoDaParcela } from '@/lib/metrics/operadora'

/**
 * As parcelas do cartão em N vezes que a OPERADORA deposita, mês a mês (F2c da
 * 5ª simulação; decisões do Heitor, 2026-11-01: "no financeiro mês a mês, como
 * a receber" e "conta no mês do dia da venda"). Nos dois financeiros.
 *
 * A cliente já pagou tudo na maquininha: isto é o que a operadora ainda
 * deposita, não dívida dela, e a receita já entrou no dia da venda. A parcela
 * vira recebida sozinha na data; "Marcar recebida" é a antecipação.
 * Os números vêm de `lib/metrics/operadora` — aqui só se escreve.
 */

/** "05/11/2026" — o dia vem do banco já no fuso da clínica ("2026-11-05"). */
const dia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
const dataSP = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

const SITUACAO: Record<SituacaoDaParcela, { rotulo: string; fundo: string; cor: string; borda: string }> = {
  A_RECEBER:  { rotulo: 'A receber',  fundo: 'var(--warning-soft)', cor: 'var(--warning)',    borda: 'var(--warning-border)' },
  RECEBIDA:   { rotulo: 'Recebida',   fundo: 'var(--success-bg)',   cor: 'var(--success)',    borda: 'var(--success-border)' },
  ANTECIPADA: { rotulo: 'Antecipada', fundo: 'var(--info-soft)',    cor: 'var(--info)',       borda: 'var(--info-border)' },
  CANCELADA:  { rotulo: 'Cancelada',  fundo: 'var(--bg-app)',       cor: 'var(--text-faint)', borda: 'var(--border)' },
  ESTORNADA:  { rotulo: 'Estornada',  fundo: 'var(--bg-app)',       cor: 'var(--text-faint)', borda: 'var(--border)' },
}

export function ParcelasDaOperadora({ parcelas, podeMarcar, slug, unidades }: {
  /** As parcelas com vencimento no período (getParcelasDaOperadora). */
  parcelas:   ParcelaDaOperadora[]
  /** Lança no financeiro (`financial: MANAGE`): marca a parcela antecipada. */
  podeMarcar: boolean
  /** O slug da unidade, para a action atualizar a tela dela. */
  slug?:      string
  /** O nome de cada unidade (a rede com mais de uma mostra a coluna). */
  unidades?:  Record<string, string>
}) {
  const router = useRouter()
  const [aMarcar, setAMarcar] = useState<ParcelaDaOperadora | null>(null)
  const [marcando, iniciar] = useTransition()

  if (parcelas.length === 0) return null

  const th: React.CSSProperties = {
    fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)',
    letterSpacing: '0.05em', padding: '10px 16px', textAlign: 'left',
    background: 'var(--bg-app)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
  }
  const td: React.CSSProperties = { padding: '12px 16px', fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }

  function marcar(p: ParcelaDaOperadora) {
    iniciar(async () => {
      const r = await anteciparParcelaDaOperadora(p.id, slug)
      if (r && 'error' in r && r.error) { toast.error(r.error); return }
      toast.success(`Parcela ${p.numero}/${p.total} marcada como recebida.`)
      setAMarcar(null)
      router.refresh()
    })
  }

  return (
    <div data-recebiveis-da-operadora>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <CreditCard size={15} style={{ color: 'var(--brand)' }} />
        <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>
          Cartão em várias vezes: a receber da operadora
        </p>
      </div>
      <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', marginBottom: 12 }}>
        A cliente já pagou tudo na maquininha e a receita entrou no dia da venda. Aqui está o que a operadora
        deposita, mês a mês, pelo vencimento. Cada parcela vira recebida sozinha na data.
      </p>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table className="cards-mobile" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>VENCIMENTO</th>
                <th style={th}>VENDA</th>
                {unidades && <th style={th}>UNIDADE</th>}
                <th style={th}>PARCELA</th>
                <th style={{ ...th, textAlign: 'right' }}>VALOR</th>
                <th style={{ ...th, textAlign: 'right' }}>TAXA</th>
                <th style={{ ...th, textAlign: 'right' }}>LÍQUIDO</th>
                <th style={th}>SITUAÇÃO</th>
                {podeMarcar && <th style={{ ...th, textAlign: 'right' }}>AÇÕES</th>}
              </tr>
            </thead>
            <tbody>
              {parcelas.map((p, i) => {
                const s = SITUACAO[p.situacao]
                const morta = p.situacao === 'CANCELADA' || p.situacao === 'ESTORNADA'
                return (
                  <tr key={p.id} data-parcela-da-operadora data-numero={p.numero} data-situacao={p.situacao}
                    style={{ borderBottom: i < parcelas.length - 1 ? '1px solid var(--hairline)' : 'none', opacity: morta ? 0.6 : 1 }}>
                    <td data-label="Vencimento" data-par style={{ ...td, whiteSpace: 'nowrap', color: 'var(--text-muted)', fontWeight: 600 }}>
                      {dia(p.vencimentoDia)}
                    </td>
                    <td data-label="" style={{ ...td, maxWidth: 280 }}>
                      <p style={{ fontWeight: 700, lineHeight: 1.3 }}>{p.descricao}</p>
                      {p.clienteNome && (
                        <p style={{ fontSize: 'var(--text-overline)', color: 'var(--text-muted)', marginTop: 1 }}>{p.clienteNome}</p>
                      )}
                    </td>
                    {unidades && (
                      <td data-label="Unidade" data-par style={{ ...td, color: 'var(--text-muted)' }}>{unidades[p.branchId] ?? '—'}</td>
                    )}
                    <td data-label="Parcela" data-par style={{ ...td, whiteSpace: 'nowrap' }}>{p.numero}/{p.total}</td>
                    <td data-label="Valor" data-par style={{ ...td, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {formatBRL(morta ? p.valorOriginal : p.valor)}
                    </td>
                    <td data-label="Taxa" data-par style={{ ...td, textAlign: 'right', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {p.taxaPct > 0 ? `${formatBRL(p.taxa)} (${p.taxaPct.toLocaleString('pt-BR')}%)` : '—'}
                    </td>
                    <td data-label="Líquido" data-par style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatBRL(p.liquido)}</td>
                    <td data-label="Situação" data-par style={td}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 'var(--text-2xs)', fontWeight: 700, padding: '3px 9px', borderRadius: 99,
                        background: s.fundo, color: s.cor, border: `1px solid ${s.borda}`,
                      }}>
                        {s.rotulo}
                      </span>
                      {(p.situacao === 'RECEBIDA' || p.situacao === 'ANTECIPADA') && p.recebidaNa && (
                        <p style={{ fontSize: 'var(--text-overline)', color: 'var(--text-muted)', marginTop: 3 }}>em {dataSP(p.recebidaNa)}</p>
                      )}
                      {p.estornado > 0 && (
                        <p style={{ fontSize: 'var(--text-overline)', color: 'var(--text-muted)', marginTop: 3 }}>
                          {formatBRL(p.estornado)} devolvidos à operadora
                        </p>
                      )}
                    </td>
                    {podeMarcar && (
                      <td data-label="" style={{ ...td, textAlign: 'right' }}>
                        {p.situacao === 'A_RECEBER' && (
                          <button type="button" className="btn-secondary" style={{ fontSize: 'var(--text-xs-sz)' }}
                            onClick={() => setAMarcar(p)}>
                            Marcar recebida
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {aMarcar && (
        <JanelaModal rotulo="Marcar a parcela como recebida" largura={440} travado={marcando} onFechar={() => setAMarcar(null)}>
          <div style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>Marcar a parcela como recebida?</h2>
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
              <strong style={{ color: 'var(--text)' }}>{aMarcar.descricao}</strong> · parcela {aMarcar.numero}/{aMarcar.total} ·{' '}
              {formatBRL(aMarcar.valor)} · vence em {dia(aMarcar.vencimentoDia)}
            </p>
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
              Use quando a operadora antecipou o depósito. Na data, a parcela vira recebida sozinha. Não muda a
              receita: a venda já entrou inteira no dia dela.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" disabled={marcando} onClick={() => setAMarcar(null)}>Voltar</button>
              <button type="button" className="btn-primary" disabled={marcando} onClick={() => marcar(aMarcar)}>
                {marcando ? 'Marcando…' : 'Marcar recebida'}
              </button>
            </div>
          </div>
        </JanelaModal>
      )}
    </div>
  )
}
