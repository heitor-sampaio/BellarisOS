'use client'

import { Fragment, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CreditCard } from 'lucide-react'
import { formatBRL } from '@estetica-os/utils'
import { JanelaModal } from '@/components/shared/janela-modal'
import { anteciparParcelaDaOperadora, desfazerRecebimentoDaParcelaDaOperadora } from '@/actions/financial'
import type { ParcelaDaOperadora, SituacaoDaParcela } from '@/lib/metrics/operadora'
import { useFuso } from '@/components/shared/fuso'

/**
 * As parcelas do cartão em N vezes que a OPERADORA deposita, mês a mês (F2c da
 * 5ª simulação; decisões do Heitor, 2026-11-01: "no financeiro mês a mês, como
 * a receber" e "conta no mês do dia da venda"). Nos dois financeiros.
 *
 * A cliente já pagou tudo na maquininha: isto é o que a operadora ainda
 * deposita, não dívida dela, e a receita já entrou no dia da venda. A parcela
 * vira recebida sozinha na data; "Marcar recebida" é a antecipação, e a
 * antecipada tem "Desfazer", que pergunta antes (r2-fin-02).
 * Os números vêm de `lib/metrics/operadora` — aqui só se escreve.
 *
 * A lista é TODO o em aberto, de qualquer vencimento, mais o que vence no
 * período, agrupada pelo MÊS do depósito (D3 da 6ª simulação: o cartão dizia
 * R$ 2.360 em aberto, e a lista do mês vinha vazia — tudo vencia no mês
 * seguinte). O cartão "A receber da operadora" leva até ela (`LinkDasParcelas`).
 */

/** O âncora da lista, para o cartão do "A receber da operadora" levar até ela. */
export const ANCORA_DAS_PARCELAS = 'recebiveis-da-operadora'

/** "Ver as parcelas" no cartão do "A receber da operadora" (D3): leva à lista. */
export function LinkDasParcelas({ temParcelas }: { temParcelas: boolean }) {
  if (!temParcelas) return null
  return (
    <a href={`#${ANCORA_DAS_PARCELAS}`} data-link-das-parcelas
      style={{ display: 'inline-block', marginTop: 4, fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--brand)' }}>
      Ver as parcelas
    </a>
  )
}

/** "dezembro de 2026" → "Dezembro de 2026", do "AAAA-MM" do vencimento. */
function nomeDoMes(mes: string): string {
  const nome = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${mes}-15T12:00:00Z`))
  return nome.charAt(0).toUpperCase() + nome.slice(1)
}

/** "05/11/2026" — o dia vem do banco já no fuso da clínica ("2026-11-05"). */
const dia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
// O dia de cada parcela no relógio da unidade (F62b): a venda das 23:30 de
// Manaus cai, N dias depois, no dia de lá.
const dataSP = (iso: string, fuso = 'America/Sao_Paulo') => new Date(iso).toLocaleDateString('pt-BR', { timeZone: fuso })

const SITUACAO: Record<SituacaoDaParcela, { rotulo: string; fundo: string; cor: string; borda: string }> = {
  A_RECEBER:  { rotulo: 'A receber',  fundo: 'var(--warning-soft)', cor: 'var(--warning)',    borda: 'var(--warning-border)' },
  RECEBIDA:   { rotulo: 'Recebida',   fundo: 'var(--success-bg)',   cor: 'var(--success)',    borda: 'var(--success-border)' },
  ANTECIPADA: { rotulo: 'Antecipada', fundo: 'var(--info-soft)',    cor: 'var(--info)',       borda: 'var(--info-border)' },
  CANCELADA:  { rotulo: 'Cancelada',  fundo: 'var(--bg-app)',       cor: 'var(--text-faint)', borda: 'var(--border)' },
  ESTORNADA:  { rotulo: 'Estornada',  fundo: 'var(--bg-app)',       cor: 'var(--text-faint)', borda: 'var(--border)' },
}

export function ParcelasDaOperadora({ parcelas, podeMarcar, slug, unidades }: {
  /** Todo o em aberto e o que vence no período (getParcelasDaOperadora), por vencimento. */
  parcelas:   ParcelaDaOperadora[]
  /** Lança no financeiro (`financial: MANAGE`): marca a parcela antecipada. */
  podeMarcar: boolean
  /** O slug da unidade, para a action atualizar a tela dela. */
  slug?:      string
  /** O nome de cada unidade (a rede com mais de uma mostra a coluna). */
  unidades?:  Record<string, string>
}) {
  const fuso = useFuso()
  const router = useRouter()
  const [aMarcar, setAMarcar] = useState<ParcelaDaOperadora | null>(null)
  const [aDesfazer, setADesfazer] = useState<ParcelaDaOperadora | null>(null)
  const [marcando, iniciar] = useTransition()

  if (parcelas.length === 0) return null
  const colunas = 7 + (unidades ? 1 : 0) + (podeMarcar ? 1 : 0)

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

  function desfazer(p: ParcelaDaOperadora) {
    iniciar(async () => {
      const r = await desfazerRecebimentoDaParcelaDaOperadora(p.id, slug)
      if (r && 'error' in r && r.error) { toast.error(r.error); return }
      toast.success(`Parcela ${p.numero}/${p.total} voltou para a receber.`)
      setADesfazer(null)
      router.refresh()
    })
  }

  return (
    <div data-recebiveis-da-operadora id={ANCORA_DAS_PARCELAS} style={{ scrollMarginTop: 'calc(var(--topbar-h) + 16px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <CreditCard size={15} style={{ color: 'var(--brand)' }} />
        <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>
          Cartão de crédito: a receber da operadora
        </p>
      </div>
      <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', marginBottom: 12 }}>
        A cliente já pagou tudo na maquininha e a receita entrou no dia da venda. Aqui está todo o em aberto que a
        operadora ainda deposita, por mês de depósito, e o que venceu no período: cada parcela a cada N dias da venda
        (o prazo da operadora, em Configurações → Comissões e taxas). Cada parcela vira recebida sozinha na data.
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
                const mes = p.vencimentoDia.slice(0, 7)
                const abreMes = i === 0 || parcelas[i - 1]!.vencimentoDia.slice(0, 7) !== mes
                return (
                  <Fragment key={p.id}>
                  {abreMes && (
                    <tr data-mes-da-operadora={mes}>
                      <td colSpan={colunas} data-label="" style={{
                        padding: '8px 16px', background: 'var(--bg-app)', borderBottom: '1px solid var(--hairline)',
                        fontSize: 'var(--text-2xs)', fontWeight: 800, color: 'var(--text-soft)', letterSpacing: '0.04em',
                      }}>
                        {nomeDoMes(mes)}
                      </td>
                    </tr>
                  )}
                  <tr data-parcela-da-operadora data-numero={p.numero} data-situacao={p.situacao}
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
                        <p style={{ fontSize: 'var(--text-overline)', color: 'var(--text-muted)', marginTop: 3 }}>em {dataSP(p.recebidaNa, fuso)}</p>
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
                        {p.situacao === 'ANTECIPADA' && (
                          <button type="button" className="btn-secondary" style={{ fontSize: 'var(--text-xs-sz)' }}
                            onClick={() => setADesfazer(p)}>
                            Desfazer
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                  </Fragment>
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

      {aDesfazer && (
        <JanelaModal rotulo="Desfazer o recebimento da parcela" largura={440} travado={marcando} onFechar={() => setADesfazer(null)}>
          <div style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>Desfazer o recebimento?</h2>
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
              <strong style={{ color: 'var(--text)' }}>{aDesfazer.descricao}</strong> · parcela {aDesfazer.numero}/{aDesfazer.total} ·{' '}
              {formatBRL(aDesfazer.valor)}{aDesfazer.recebidaNa ? ` · marcada recebida em ${dataSP(aDesfazer.recebidaNa, fuso)}` : ''}
            </p>
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
              A parcela volta para a receber, com o vencimento em {dia(aDesfazer.vencimentoDia)}, e volta a contar no
              “A receber da operadora”. A receita não muda.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" disabled={marcando} onClick={() => setADesfazer(null)}>Voltar</button>
              <button type="button" className="btn-primary" disabled={marcando} onClick={() => desfazer(aDesfazer)}>
                {marcando ? 'Desfazendo…' : 'Desfazer'}
              </button>
            </div>
          </div>
        </JanelaModal>
      )}
    </div>
  )
}
