'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
import { fecharODia, informarFundoDeTroco } from '@/actions/fechamento'
import { SegSelect } from '@/components/shared/seg-select'
import { useFuso } from '@/components/shared/fuso'
import type { FechamentoDoDia, AvisosDoFechamento } from '@/lib/metrics'
import type { EstornoDoDia, MovimentoDaUnidade, RecebidoPorPessoa, CartaoPorBandeira } from '@/lib/metrics/fechamento-extra'
import type { LinhaDaConferencia } from '@/lib/financeiro/conferencia-do-fechamento'
import { rotuloDaForma, rotuloDaFormaDoFechamento, nomeDaBandeira } from '@/lib/financeiro/formas'
import { parseDinheiro } from '@estetica-os/utils'

export interface FechamentoFeito {
  id: string; esperado: number; contado: number; diferenca: number
  observacao: string | null; quem: string | null; quando: string
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
// No relógio da unidade (F62): o fuso vem do `useFuso` de quem chama.
const horaNo = (fuso: string) => (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: fuso })
const diaCurtoNo = (fuso: string) => (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: fuso })
/** O dia do calendário (é a data, não um instante). */
const diaLongo = (dia: string) => new Date(`${dia}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
/** O texto do valor no campo ("100,00"). */
const noCampo = (v: number) => v.toFixed(2).replace('.', ',')

/** "Faltou R$ 5,00" / "Sobrou…" / "Bateu" — a diferença vem do servidor (conferido − registrado). */
function Diferenca({ valor }: { valor: number }) {
  const cor = valor === 0 ? 'var(--success)' : valor < 0 ? 'var(--danger)' : 'var(--warning)'
  const texto = valor === 0 ? 'Bateu' : `${valor < 0 ? 'Faltou' : 'Sobrou'} ${brl(Math.abs(valor))}`
  return <span data-diferenca style={{ color: cor, fontWeight: 800 }}>{texto}</span>
}

const TH: React.CSSProperties = {
  padding: '10px 16px', fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-muted)',
  letterSpacing: '0.06em', textTransform: 'uppercase',
}
const DETALHE: React.CSSProperties = { display: 'block', fontSize: 'var(--text-xs-sz)', fontWeight: 500, color: 'var(--text-muted)' }

/**
 * A tela do Fechamento do dia, dentro do PDV (CX4, CX5 — a revisão do Heitor,
 * 2026-11-13). Uma linha por forma de pagamento: o que o sistema REGISTROU ×
 * o que foi CONFERIDO × a diferença. O dinheiro é obrigatório; as outras
 * formas, opcionais — em branco é "não conferido" (princípio 4). Todo número
 * vem do servidor (lib/metrics e as linhas de `linhasDaConferencia`); aqui só
 * se desenha e se manda o conferido.
 */
export function FechamentoDoDiaTela({ basePath, dia, unidades, unidadeId, resumo, linhas, feitos, podeFechar, comandasAbertas = 0, avisos, atendeAte = null, fundoInformado = null, estornos = null, porQuemRecebeu = [], daRede = null, bandeiras = [] }: {
  /** O PDV do portal (`/<slug>/pdv` ou `/admin/pdv`). */
  basePath:  string
  dia:       string
  unidades:  { id: string; name: string }[]
  unidadeId: string
  resumo:    FechamentoDoDia
  /** CX4: uma linha por forma — o registrado, o conferido e a diferença do último fechamento. */
  linhas:    LinhaDaConferencia[]
  feitos:    FechamentoFeito[]
  podeFechar: boolean
  /** CX5: as comandas abertas da unidade (o mesmo número do PDV). */
  comandasAbertas?: number
  /** Os números dos avisos (J-49), do banco: aqui, o movimento depois do fechamento. */
  avisos?: AvisosDoFechamento
  /** Hoje, antes do fim do expediente: até quando a unidade atende (A50). */
  atendeAte?: string | null
  /** Quem informou o fundo de troco do dia, e quando (ven-03). */
  fundoInformado?: { quem: string | null; quando: string } | null
  /** A42 da 8ª: o que foi estornado no dia (do banco; o total, de lib/metrics). */
  estornos?: { itens: EstornoDoDia[]; total: number; deOutrosDias?: number } | null
  /** A40 da 11ª: as entradas do dia de cada pessoa que recebeu, por forma (do banco). */
  porQuemRecebeu?: RecebidoPorPessoa[]
  /** A45 da 8ª: o dia de cada unidade e o da rede (o portal da rede). */
  daRede?: { unidades: MovimentoDaUnidade[]; total: { entradas: number; saidas: number; lancamentos: number } } | null
  /** A44 da 12ª: as linhas de cartão por bandeira (do banco). */
  bandeiras?: CartaoPorBandeira[]
}) {
  const router = useRouter()
  const ultimo = feitos[0] ?? null
  const [reabrindo, setReabrindo] = useState(false)
  const [valores, setValores] = useState<Record<string, string>>({})
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, start] = useTransition()
  // Conferindo: o dia que ninguém fechou, ou o "Fechar de novo".
  const conferindo = podeFechar && (!ultimo || reabrindo)
  // C75: com mais de uma maquininha no dia, o cartão se separa por ela (cada uma é uma operadora).
  const variasMaquininhas = new Set(bandeiras.map(b => b.maquininha).filter(Boolean)).size > 1

  const fuso = useFuso()
  const hora = horaNo(fuso)
  const diaCurto = diaCurtoNo(fuso)
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(new Date())
  const naRede = unidades.length > 1

  function ir(novoDia: string, unidade = unidadeId) {
    const q = new URLSearchParams({ fechar: '1', dia: novoDia })
    if (naRede) q.set('unidade', unidade)
    router.push(`${basePath}?${q}`)
  }

  // Sem dinheiro em espécie no dia (nada esperado, nenhum movimento em
  // dinheiro), o contado em branco é zero (A50: exigia digitar 0).
  const semDinheiro = resumo.esperadoDinheiro === 0 && !resumo.formas.some(f => f.forma === 'CASH')

  function fecharDeNovo() {
    // Os campos já vêm com o que foi conferido no último fechamento.
    const antes: Record<string, string> = {}
    for (const l of linhas) if (l.conferivel && l.conferido != null) antes[l.forma] = noCampo(l.conferido)
    setValores(antes); setObs(ultimo?.observacao ?? ''); setErro(null); setReabrindo(true)
  }

  function fechar(e: React.FormEvent) {
    e.preventDefault()
    // A regra de todo campo de dinheiro (D3): "180.50" lia R$ 18.050,00.
    const textoDinheiro = (valores.CASH ?? '').trim()
    const contado = textoDinheiro === '' && semDinheiro ? 0 : parseDinheiro(textoDinheiro)
    if ((textoDinheiro === '' && !semDinheiro) || !Number.isFinite(contado) || contado < 0) { setErro('Informe o dinheiro contado.'); return }
    // As outras formas: em branco é "não conferido" (nulo), nunca zero.
    const conferidos: Record<string, number | null> = {}
    for (const l of linhas) {
      if (!l.conferivel || l.forma === 'CASH') continue
      const t = (valores[l.forma] ?? '').trim()
      if (t === '') { conferidos[l.forma] = null; continue }
      const v = parseDinheiro(t)
      if (!Number.isFinite(v) || v < 0) { setErro(`Confira o valor de ${rotuloDaFormaDoFechamento(l.forma)} (ou deixe em branco).`); return }
      conferidos[l.forma] = v
    }
    setErro(null)
    start(async () => {
      const r = await fecharODia(unidadeId, dia, contado, obs, conferidos)
      if ('error' in r) { setErro(r.error); return }
      toast.success('Dia fechado.')
      setValores({}); setObs(''); setReabrindo(false)
      router.refresh()
    })
  }

  const detalheDasBandeiras = (forma: string) => {
    if (!bandeiras.some(b => b.forma === forma)) return null
    const texto = (b: CartaoPorBandeira) => `${nomeDaBandeira(b.bandeira)} ${brl(b.entradas)}${b.saidas > 0 ? ` (saídas ${brl(b.saidas)})` : ''}`
    return (
      // A44 da 12ª: o cartão por bandeira — a conciliação com a operadora.
      <span data-bandeiras-da-forma style={DETALHE}>
        {variasMaquininhas
          ? [...new Set(bandeiras.filter(b => b.forma === forma).map(b => b.maquininha))].map(m =>
              `${m ?? 'Cartão da clínica'}: ${bandeiras.filter(b => b.forma === forma && b.maquininha === m).map(texto).join(', ')}`).join(' · ')
          : bandeiras.filter(b => b.forma === forma).map(texto).join(' · ')}
      </span>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 940 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, letterSpacing: 'var(--tracking-tight)', color: 'var(--text)' }}>
            Fechamento do dia
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>{diaLongo(dia)}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {naRede && (
            <SegSelect options={unidades.map(u => ({ key: u.id, label: u.name }))} value={unidadeId}
              onSelect={k => ir(dia, k)} ariaLabel="Unidade" />
          )}
          <input type="date" className="field" aria-label="Dia" value={dia} max={hoje}
            onChange={e => e.target.value && ir(e.target.value)} style={{ width: 160 }} />
        </div>
      </div>

      {/* A45 da 8ª: a rede no dia, e cada unidade (a aberta, marcada). */}
      {daRede && (
        <div data-fechamento-da-rede className="card" style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="overline">O dia na rede</span>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {daRede.unidades.map(u => (
              <li key={u.id}>
                <button type="button" onClick={() => ir(dia, u.id)} aria-current={u.id === unidadeId ? 'true' : undefined}
                  style={{
                    width: '100%', display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 10px',
                    borderRadius: 'var(--radius-field-token)', cursor: 'pointer', fontSize: 'var(--text-sm-sz)',
                    border: `1px solid ${u.id === unidadeId ? 'var(--brand-soft-border)' : 'transparent'}`,
                    background: u.id === unidadeId ? 'var(--brand-soft)' : 'transparent', color: 'var(--text)',
                  }}>
                  <span style={{ fontWeight: 700 }}>{u.nome}</span>
                  <span style={{ color: u.lancamentos > 0 ? 'var(--text)' : 'var(--text-muted)' }}>
                    {u.lancamentos > 0 ? `Entradas ${brl(u.entradas)} · saídas ${brl(u.saidas)}` : 'Sem movimento'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 'var(--text-sm-sz)', fontWeight: 800, color: 'var(--text)', borderTop: '1px solid var(--hairline)', paddingTop: 8 }}>
            <span>Total da rede</span>
            <span>Entradas {brl(daRede.total.entradas)} · saídas {brl(daRede.total.saidas)}</span>
          </p>
        </div>
      )}

      <AvisosDoDia comandasAbertas={comandasAbertas}
        linkDasComandas={podeFechar ? `${basePath}?ver=ABERTAS${naRede ? `&unidade=${unidadeId}` : ''}` : null}
        avisos={avisos} fechadoAs={ultimo ? hora(ultimo.quando) : null} />

      {/* CX4: a conferência — uma linha por forma de pagamento. */}
      <form onSubmit={fechar} className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table className="cards-mobile" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ ...TH, textAlign: 'left' }}>Forma</th>
                <th style={{ ...TH, textAlign: 'right' }}>Registrado</th>
                <th style={{ ...TH, textAlign: 'right' }}>Conferido</th>
                <th style={{ ...TH, textAlign: 'right' }}>Diferença</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(l => {
                const rotulo = rotuloDaFormaDoFechamento(l.forma)
                const dinheiro = l.forma === 'CASH'
                return (
                  <tr key={l.forma} data-forma={l.forma} style={{ borderTop: '1px solid var(--hairline)', verticalAlign: 'top' }}>
                    <td data-label="" style={{ padding: '11px 16px', fontWeight: 700, color: 'var(--text)' }}>
                      {rotulo}
                      <span style={DETALHE}>Entradas {brl(l.entradas)} · saídas {brl(l.saidas)}</span>
                      {detalheDasBandeiras(l.forma)}
                      {dinheiro && resumo.fundoDeTroco != null && resumo.fundoDeTroco > 0 && (
                        <span data-esperado-conta style={DETALHE}>
                          {brl(resumo.fundoDeTroco)} de fundo de troco {resumo.saldoDinheiro < 0 ? '−' : '+'} {brl(Math.abs(resumo.saldoDinheiro))} do dia em espécie
                        </span>
                      )}
                      {dinheiro && <FundoDeTroco unidadeId={unidadeId} dia={dia} valor={resumo.fundoDeTroco} informado={fundoInformado} podeInformar={podeFechar} />}
                    </td>
                    <td data-label="Registrado" data-par style={{ padding: '11px 16px', textAlign: 'right', fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                      <span data-registrado {...(dinheiro ? { 'data-esperado': '' } : {})}>{brl(l.registrado)}</span>
                      {dinheiro && <span style={DETALHE}>na gaveta</span>}
                    </td>
                    <td data-label="Conferido" data-par style={{ padding: '11px 16px', textAlign: 'right' }}>
                      {!l.conferivel ? (
                        <span style={{ color: 'var(--text-faint)' }}>—</span>
                      ) : conferindo ? (
                        <>
                          <input className="field" inputMode="decimal" value={valores[l.forma] ?? ''}
                            onChange={e => setValores(v => ({ ...v, [l.forma]: e.target.value }))}
                            aria-label={dinheiro ? (semDinheiro ? 'Dinheiro contado (R$, opcional)' : 'Dinheiro contado (R$)') : `Conferido em ${rotulo}`}
                            placeholder={dinheiro ? '0,00' : 'Não conferido'} style={{ width: 130, textAlign: 'right' }} />
                          {dinheiro && semDinheiro && <span style={{ ...DETALHE, color: 'var(--text-faint)' }}>Sem espécie hoje: em branco é R$ 0,00.</span>}
                        </>
                      ) : ultimo ? (
                        <span data-conferido style={{ fontWeight: 700, color: l.conferido == null ? 'var(--text-muted)' : 'var(--text)' }}>
                          {l.conferido == null ? 'não conferido' : brl(l.conferido)}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-faint)' }}>—</span>
                      )}
                    </td>
                    <td data-label="Diferença" data-par style={{ padding: '11px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {!l.conferivel || !ultimo ? <span style={{ color: 'var(--text-faint)' }}>—</span>
                        : l.diferenca == null ? <span data-diferenca style={{ color: 'var(--text-muted)', fontWeight: 600 }}>não conferido</span>
                        : <Diferenca valor={l.diferenca} />}
                    </td>
                  </tr>
                )
              })}
              <tr data-forma="TOTAL" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-app)' }}>
                <td data-label="" style={{ padding: '11px 16px', fontWeight: 800, color: 'var(--text)' }}>
                  Total do dia
                  <span style={DETALHE}>Entradas {brl(resumo.total.entradas)} · saídas {brl(resumo.total.saidas)}</span>
                </td>
                <td data-label="Saldo do dia" data-par style={{ padding: '11px 16px', textAlign: 'right', fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                  {brl(resumo.total.saldo)}
                  <span style={DETALHE}>saldo do dia</span>
                </td>
                <td data-label="" />
                <td data-label="" />
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* A47 da 12ª: o dia que ninguém fechou diz isso. */}
          {!ultimo && (
            <p data-ainda-nao-fechado style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', fontWeight: 600 }}>
              <Clock size={14} aria-hidden="true" />
              Ainda não fechado: ninguém fechou este dia.
            </p>
          )}
          {ultimo && (
            <p style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
              <CheckCircle2 size={14} aria-hidden style={{ color: 'var(--success)' }} />
              Fechado por {ultimo.quem ?? '—'} às {hora(ultimo.quando)}
              {ultimo.observacao && <span>· “{ultimo.observacao}”</span>}
            </p>
          )}
          {/* A50: fechar antes do fim do expediente vale, mas avisa. */}
          {podeFechar && atendeAte && (
            <p data-dia-aberto role="note" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 'var(--text-sm-sz)', color: 'var(--warning)', fontWeight: 600 }}>
              <Clock size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
              <span>A unidade atende até {atendeAte}: o dia ainda está aberto. O que entrar depois deste fechamento pede fechar de novo.</span>
            </p>
          )}
          {conferindo && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <label className="field-label" style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 220px' }}>
                Observação
                <input className="field" value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional" maxLength={500} />
              </label>
              {reabrindo && (
                <button type="button" className="btn-ghost" disabled={pendente} onClick={() => { setReabrindo(false); setErro(null) }}>Cancelar</button>
              )}
              <button type="submit" className="btn-primary" disabled={pendente}>{pendente ? 'Fechando…' : 'Fechar o dia'}</button>
            </div>
          )}
          {conferindo && (
            <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
              O dinheiro é obrigatório. As outras formas são opcionais: em branco, a linha fica “não conferido”.
            </p>
          )}
          {podeFechar && !conferindo && (
            <div>
              <button type="button" className="btn-secondary" onClick={fecharDeNovo}>Fechar de novo</button>
            </div>
          )}
          {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600 }}>{erro}</p>}
        </div>
      </form>

      {feitos.length > 1 && (
        <div className="card" style={{ padding: 'var(--card-pad)' }}>
          <p className="overline" style={{ marginBottom: 8 }}>Fechamentos anteriores deste dia</p>
          {feitos.slice(1).map(f => (
            <p key={f.id} style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', padding: '4px 0' }}>
              {hora(f.quando)} · {f.quem ?? '—'} · dinheiro esperado {brl(f.esperado)}, contado {brl(f.contado)} · <Diferenca valor={f.diferenca} />
            </p>
          ))}
        </div>
      )}

      {/* CX5: "Por quem recebeu" e os estornos do dia, recolhidos (o mesmo conteúdo de antes). */}
      {(porQuemRecebeu.length > 0 || (estornos && estornos.itens.length > 0)) && (
        <details data-detalhes-do-dia className="card" style={{ padding: '12px 18px' }}>
          <summary style={{ cursor: 'pointer', fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)' }}>
            Detalhes do dia
            <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>
              {' '}· por quem recebeu{estornos && estornos.itens.length > 0 ? ` e estornos (${brl(estornos.total)})` : ''}
            </span>
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
            {/* A40 da 11ª: com duas pessoas no balcão, cada uma precisa saber o que entrega. */}
            {porQuemRecebeu.length > 0 && (
              <div data-por-quem-recebeu style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)' }}>Por quem recebeu</p>
                <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                  As entradas do dia de cada pessoa, por forma — quem registrou o recebimento (na venda, quem vendeu; na baixa de uma parcela, quem deu a baixa).
                  As saídas e os estornos ficam no total da unidade, acima.
                </p>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
                  {porQuemRecebeu.map(p => (
                    <li key={p.pessoa ?? 'sem'} data-quem-recebeu={p.pessoa ?? 'nao-registrado'}
                      style={{ borderTop: '1px solid var(--hairline)', padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: p.pessoa ? 'var(--text)' : 'var(--text-muted)' }}>
                          {p.pessoa ? (p.nome ?? 'Sem nome') : 'Quem recebeu não registrado'}
                        </span>
                        <span data-total-de-quem-recebeu style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                          {brl(p.total.entradas)}
                        </span>
                      </div>
                      <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                        {p.formas.map(f => `${rotuloDaFormaDoFechamento(f.forma)} ${brl(f.entradas)}`).join(' · ')}
                        {!p.pessoa && ' — recebimentos de antes de 10/11/2026 com a baixa feita depois da venda.'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* A42 da 8ª: o estorno do dia. D2 da 12ª (princípio 5): o pagamento fica
                no dia dele, e o estorno de um pagamento de OUTRO dia é saída deste. D3:
                só o que voltou às clientes — o estorno de despesa voltou ao caixa. */}
            {estornos && estornos.itens.length > 0 && (
              <div data-estornos-do-dia style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)' }}>
                  Estornos do dia · {brl(estornos.total)}
                </p>
                <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                  O que voltou às clientes neste dia. O estorno de um pagamento de outro dia é saída deste dia, na forma dele — o pagamento continua no dia em que entrou.
                  O de um pagamento deste mesmo dia já está fora das entradas: um anula o outro.
                  {(estornos.deOutrosDias ?? 0) > 0 && <> Nas saídas acima: {brl(estornos.deOutrosDias ?? 0)} de pagamentos de outros dias.</>}
                </p>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {estornos.itens.map(e => (
                    <li key={e.id} data-estorno-do-dia data-de-outro-dia={e.mesmoDia ? undefined : 'true'} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 'var(--text-sm-sz)' }}>
                      <span style={{ color: 'var(--text)', minWidth: 0, overflowWrap: 'anywhere' }}>
                        {e.descricao}{e.forma ? ` · ${rotuloDaForma(e.forma, e.vezes)}` : ''}
                        <span style={DETALHE}>
                          {e.mesmoDia ? 'Pagamento deste dia: já fora das entradas.' : e.pagoEm ? `Pagamento de ${diaCurto(e.pagoEm)}: sai nas saídas deste dia.` : null}
                        </span>
                        {e.motivo && <span style={DETALHE}>Motivo: {e.motivo}</span>}
                      </span>
                      <span style={{ color: 'var(--danger)', fontWeight: 700, whiteSpace: 'nowrap' }}>− {brl(e.valor)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  )
}

/**
 * O fundo de troco do dia (ven-03, 2026-11-02): OPCIONAL, na linha do
 * dinheiro. Sem ele, o fechamento segue como sempre; informado, o esperado na
 * gaveta soma o fundo (a conta é de lib/metrics). Informar de novo troca o
 * valor; zero é sem fundo. Sem `<form>` próprio: mora dentro do da conferência.
 */
function FundoDeTroco({ unidadeId, dia, valor, informado, podeInformar }: {
  unidadeId: string; dia: string; valor: number | null
  informado: { quem: string | null; quando: string } | null; podeInformar: boolean
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(valor ? String(valor).replace('.', ',') : '')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, start] = useTransition()
  const hora = horaNo(useFuso())
  const tem = valor != null && valor > 0

  function salvar() {
    const v = texto.trim() === '' ? 0 : parseDinheiro(texto)
    if (!Number.isFinite(v) || v < 0) { setErro('Informe o fundo de troco (R$ 0,00 ou mais).'); return }
    setErro(null)
    start(async () => {
      const r = await informarFundoDeTroco(unidadeId, dia, v)
      if ('error' in r) { setErro(r.error); return }
      setEditando(false)
      router.refresh()
    })
  }

  return (
    <div data-fundo-de-troco style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6, fontWeight: 500 }}>
      {!editando && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'var(--text-xs-sz)', color: tem ? 'var(--text)' : 'var(--text-muted)', fontWeight: tem ? 700 : 500 }}>
            {tem ? `Fundo de troco: ${brl(valor!)}` : 'Sem fundo de troco (opcional).'}
            {tem && informado && (
              <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}> · informado por {informado.quem ?? '—'} às {hora(informado.quando)}</span>
            )}
          </span>
          {podeInformar && (
            <button type="button" className="btn-ghost" style={{ fontSize: 'var(--text-xs-sz)' }} onClick={() => setEditando(true)}>
              {tem ? 'Mudar o fundo' : 'Informar fundo de troco'}
            </button>
          )}
        </div>
      )}
      {editando && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label className="field-label" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            Fundo de troco (R$)
            <input className="field" inputMode="decimal" value={texto} onChange={e => setTexto(e.target.value)} placeholder="0,00" style={{ width: 130 }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); salvar() } }} />
            <span style={{ fontWeight: 500, color: 'var(--text-faint)' }}>O dinheiro que já estava na gaveta no começo do dia.</span>
          </label>
          <button type="button" className="btn-secondary" disabled={pendente} onClick={salvar}>{pendente ? 'Salvando…' : 'Salvar fundo'}</button>
          <button type="button" className="btn-ghost" disabled={pendente} onClick={() => { setEditando(false); setErro(null) }}>Cancelar</button>
        </div>
      )}
      {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600 }}>{erro}</p>}
    </div>
  )
}

/**
 * Os avisos do fechamento (CX5, 2026-11-14 — eram seis, ficam dois), com os
 * números do servidor:
 * - há comanda aberta na unidade (o mesmo número do PDV), com o caminho até elas;
 * - entrou dinheiro depois do último fechamento (feche de novo).
 */
function AvisosDoDia({ comandasAbertas, linkDasComandas, avisos, fechadoAs }: {
  comandasAbertas: number; linkDasComandas: string | null
  avisos?: AvisosDoFechamento; fechadoAs: string | null
}) {
  const lista: { chave: string; texto: string; link?: { href: string; rotulo: string } }[] = []
  if (comandasAbertas > 0) {
    const n = comandasAbertas
    lista.push({
      chave: 'comandas-abertas',
      texto: `Há ${n} ${n === 1 ? 'comanda aberta' : 'comandas abertas'}.`,
      ...(linkDasComandas ? { link: { href: linkDasComandas, rotulo: n === 1 ? 'Ver a comanda' : 'Ver as comandas' } } : {}),
    })
  }
  if (avisos && avisos.movimentosDepois > 0 && fechadoAs) {
    lista.push({ chave: 'movimento-depois', texto: `Entrou dinheiro depois do fechamento das ${fechadoAs}: confira e feche de novo.` })
  }
  if (!lista.length) return null
  return (
    <div data-avisos-do-fechamento style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {lista.map(a => (
        <p key={a.chave} data-aviso={a.chave} role="status" style={{
          display: 'flex', gap: 8, alignItems: 'flex-start', margin: 0, padding: '10px 14px',
          borderRadius: 'var(--radius-field-token)', border: '1px solid var(--border)', background: 'var(--surface)',
          fontSize: 'var(--text-sm-sz)', color: 'var(--text)',
        }}>
          <AlertTriangle size={15} aria-hidden style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} />
          <span>{a.texto}{a.link && <> <a href={a.link.href} style={{ color: 'var(--brand)', fontWeight: 700 }}>{a.link.rotulo}</a></>}</span>
        </p>
      ))}
    </div>
  )
}
