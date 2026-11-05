'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Clock, Info, Wallet } from 'lucide-react'
import { fecharODia, informarFundoDeTroco } from '@/actions/fechamento'
import { SegSelect } from '@/components/shared/seg-select'
import type { FechamentoDoDia, AvisosDoFechamento } from '@/lib/metrics'
import type { ListaAReceber } from '@/lib/metrics/a-receber'
import { AtendimentosAReceber } from '@/components/shared/atendimentos-a-receber'
import { rotuloDaForma, rotuloDaFormaDoFechamento } from '@/lib/financeiro/formas'
import { rotuloDaBandeira } from '@/lib/financeiro/bandeiras'
import { parseDinheiro } from '@estetica-os/utils'

export interface FechamentoFeito {
  id: string; esperado: number; contado: number; diferenca: number
  observacao: string | null; quem: string | null; quando: string
}


const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
const diaLongo = (dia: string) => new Date(`${dia}T12:00:00-03:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo' })

/** "Faltou R$ 5,00" / "Sobrou…" / "Bateu" — a diferença vem do banco. */
function Diferenca({ valor }: { valor: number }) {
  const cor = valor === 0 ? 'var(--success)' : valor < 0 ? 'var(--danger)' : 'var(--warning)'
  const texto = valor === 0 ? 'Bateu' : `${valor < 0 ? 'Faltou' : 'Sobrou'} ${brl(Math.abs(valor))}`
  return <span data-diferenca style={{ color: cor, fontWeight: 800 }}>{texto}</span>
}

/**
 * A tela do fechamento do dia (2026-10-21). Todo número vem do servidor
 * (metrics_fechamento_do_dia); aqui só se desenha e se manda o contado.
 */
/** O a receber da operadora no fechamento (A44). */
export interface OperadoraNoFechamento {
  emAberto: number
  proximo:  { dia: string; valor: number } | null
  link:     string | null
}

export function FechamentoDoDiaTela({ basePath, dia, unidades, unidadeId, resumo, feitos, podeFechar, aReceber, emAberto = 0, operadora = null, podeReceberAtendimento = false, avisos, atendeAte = null, fundoInformado = null }: {
  basePath:  string
  dia:       string
  unidades:  { id: string; name: string }[]
  unidadeId: string
  resumo:    FechamentoDoDia
  feitos:    FechamentoFeito[]
  podeFechar: boolean
  /** Os atendimentos concluídos e não pagos da unidade (D5, 2026-10-27). */
  aReceber?: ListaAReceber
  /** "Reforça", item 4: as parcelas e lançamentos a receber da unidade, de qualquer vencimento. */
  emAberto?: number
  /**
   * A44 da 7ª simulação: o que a operadora do cartão ainda vai depositar (do
   * banco, o "A receber da operadora" do Financeiro) e o caminho até a lista,
   * para quem abre o Financeiro.
   */
  operadora?: OperadoraNoFechamento | null
  podeReceberAtendimento?: boolean
  /** Os números dos avisos (J-49), do banco. */
  avisos?: AvisosDoFechamento
  /** Hoje, antes do fim do expediente: até quando a unidade atende (A50). */
  atendeAte?: string | null
  /** Quem informou o fundo de troco do dia, e quando (ven-03). */
  fundoInformado?: { quem: string | null; quando: string } | null
}) {
  const router = useRouter()
  const [contado, setContado] = useState('')
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, start] = useTransition()
  const ultimo = feitos[0] ?? null

  function ir(novoDia: string, unidade = unidadeId) {
    const q = new URLSearchParams({ dia: novoDia })
    if (unidades.length > 1) q.set('unidade', unidade)
    router.push(`${basePath}?${q}`)
  }

  // Sem dinheiro em espécie no dia (nada esperado, nenhum movimento em
  // dinheiro), o contado em branco é zero (A50: exigia digitar 0).
  const semDinheiro = resumo.esperadoDinheiro === 0 && !resumo.formas.some(f => f.forma === 'CASH')

  function fechar(e: React.FormEvent) {
    e.preventDefault()
    // A regra de todo campo de dinheiro (D3): "180.50" lia R$ 18.050,00.
    const vazio = contado.trim() === ''
    const valor = vazio && semDinheiro ? 0 : parseDinheiro(contado)
    if ((vazio && !semDinheiro) || !Number.isFinite(valor) || valor < 0) { setErro('Informe o dinheiro contado.'); return }
    setErro(null)
    start(async () => {
      const r = await fecharODia(unidadeId, dia, valor, obs)
      if ('error' in r) { setErro(r.error); return }
      toast.success('Dia fechado.')
      setContado(''); setObs('')
      router.refresh()
    })
  }

  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 860 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 800, letterSpacing: 'var(--tracking-tight)', color: 'var(--text)' }}>
            Fechamento do dia
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>{diaLongo(dia)}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {unidades.length > 1 && (
            <SegSelect options={unidades.map(u => ({ key: u.id, label: u.name }))} value={unidadeId}
              onSelect={k => ir(dia, k)} ariaLabel="Unidade" />
          )}
          <input type="date" className="field" aria-label="Dia" value={dia} max={hoje}
            onChange={e => e.target.value && ir(e.target.value)} style={{ width: 160 }} />
        </div>
      </div>

      <AvisosDoDia resumo={resumo} aReceber={aReceber} emAberto={emAberto} operadora={operadora} avisos={avisos} fechadoAs={ultimo ? hora(ultimo.quando) : null} />

      {/* O dia por forma de pagamento */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table className="cards-mobile" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Forma', 'Entradas', 'Saídas', 'Saldo'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Forma' ? 'left' : 'right', fontSize: 'var(--text-overline)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resumo.formas.length === 0 && (
                <tr><td colSpan={4} style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>Nenhum recebimento nem pagamento neste dia.</td></tr>
              )}
              {[...resumo.formas, resumo.total].map(l => {
                const total = l.forma === 'TOTAL'
                return (
                  <tr key={l.forma} data-forma={l.forma} style={{ borderTop: total ? '1px solid var(--border)' : '1px solid var(--hairline)', background: total ? 'var(--bg-app)' : undefined }}>
                    <td data-label="" style={{ padding: '11px 16px', fontWeight: total ? 800 : 700, color: 'var(--text)' }}>{total ? 'Total do dia' : rotuloDaFormaDoFechamento(l.forma)}</td>
                    <td data-label="Entradas" data-par style={{ padding: '11px 16px', textAlign: 'right', color: 'var(--success)', fontWeight: 700 }}>{brl(l.entradas)}</td>
                    <td data-label="Saídas" data-par style={{ padding: '11px 16px', textAlign: 'right', color: 'var(--text-muted)' }}>{brl(l.saidas)}</td>
                    <td data-label="Saldo" data-par style={{ padding: '11px 16px', textAlign: 'right', fontWeight: 800, color: 'var(--text)' }}>{brl(l.saldo)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* O que foi atendido e ainda não foi pago — de qualquer dia. */}
      {aReceber && <AtendimentosAReceber lista={aReceber} podeReceber={podeReceberAtendimento} />}

      {/* A conferência do dinheiro */}
      <div className="card" style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--brand-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Wallet size={16} style={{ color: 'var(--brand)' }} />
          </div>
          <div>
            <p className="overline">Dinheiro em espécie esperado</p>
            <p data-esperado style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>{brl(resumo.esperadoDinheiro)}</p>
          </div>
        </div>

        {resumo.fundoDeTroco != null && resumo.fundoDeTroco > 0 && (
          <p data-esperado-conta style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: -6 }}>
            {brl(resumo.fundoDeTroco)} de fundo de troco {resumo.saldoDinheiro < 0 ? '−' : '+'} {brl(Math.abs(resumo.saldoDinheiro))} do dia em espécie
          </p>
        )}

        <FundoDeTroco unidadeId={unidadeId} dia={dia} valor={resumo.fundoDeTroco} informado={fundoInformado} podeInformar={podeFechar} />

        {ultimo && (
          <p style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
            <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />
            Fechado por {ultimo.quem ?? '—'} às {hora(ultimo.quando)} · contado {brl(ultimo.contado)} · <Diferenca valor={ultimo.diferenca} />
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
        {podeFechar && (
          <form onSubmit={fechar} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)' }}>
              {semDinheiro ? 'Dinheiro contado (R$, opcional)' : 'Dinheiro contado (R$)'}
              <input className="field" inputMode="decimal" value={contado} onChange={e => setContado(e.target.value)} placeholder="0,00" style={{ width: 160 }} />
              {semDinheiro && <span style={{ fontWeight: 500, color: 'var(--text-faint)' }}>Sem dinheiro em espécie hoje: em branco é R$ 0,00.</span>}
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', flex: '1 1 220px' }}>
              Observação
              <input className="field" value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional" maxLength={500} />
            </label>
            <button type="submit" className="btn-primary" disabled={pendente}>
              {pendente ? 'Fechando…' : ultimo ? 'Fechar de novo' : 'Fechar o dia'}
            </button>
          </form>
        )}
        {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600 }}>{erro}</p>}
      </div>

      {feitos.length > 1 && (
        <div className="card" style={{ padding: 'var(--card-pad)' }}>
          <p className="overline" style={{ marginBottom: 8 }}>Fechamentos anteriores deste dia</p>
          {feitos.slice(1).map(f => (
            <p key={f.id} style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', padding: '4px 0' }}>
              {hora(f.quando)} · {f.quem ?? '—'} · esperado {brl(f.esperado)}, contado {brl(f.contado)} · <Diferenca valor={f.diferenca} />
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * O fundo de troco do dia (ven-03, 2026-11-02): OPCIONAL. Sem ele, o
 * fechamento segue como sempre; informado, o esperado na gaveta soma o fundo
 * (a conta é de lib/metrics). Informar de novo troca o valor; zero é sem fundo.
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
  const tem = valor != null && valor > 0

  function salvar(e: React.FormEvent) {
    e.preventDefault()
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
    <div data-fundo-de-troco style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 10, borderTop: '1px solid var(--hairline)' }}>
      {!editando && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <p style={{ fontSize: 'var(--text-sm-sz)', color: tem ? 'var(--text)' : 'var(--text-muted)', fontWeight: tem ? 700 : 500 }}>
            {tem ? `Fundo de troco: ${brl(valor!)}` : 'Sem fundo de troco hoje (opcional).'}
            {tem && informado && (
              <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}> · informado por {informado.quem ?? '—'} às {hora(informado.quando)}</span>
            )}
          </p>
          {podeInformar && (
            <button type="button" className="btn-ghost" style={{ fontSize: 'var(--text-sm-sz)' }} onClick={() => setEditando(true)}>
              {tem ? 'Mudar o fundo' : 'Informar fundo de troco'}
            </button>
          )}
        </div>
      )}
      {editando && (
        <form onSubmit={salvar} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)' }}>
            Fundo de troco (R$)
            <input className="field" inputMode="decimal" value={texto} onChange={e => setTexto(e.target.value)} placeholder="0,00" style={{ width: 160 }} />
            <span style={{ fontWeight: 500, color: 'var(--text-faint)' }}>O dinheiro que já estava na gaveta no começo do dia.</span>
          </label>
          <button type="submit" className="btn-secondary" disabled={pendente}>{pendente ? 'Salvando…' : 'Salvar fundo'}</button>
          <button type="button" className="btn-ghost" disabled={pendente} onClick={() => { setEditando(false); setErro(null) }}>Cancelar</button>
        </form>
      )}
      {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600 }}>{erro}</p>}
    </div>
  )
}

/**
 * Os avisos do fechamento (J-49, 2026-10-30) — todo número vem do banco:
 * - há dinheiro a receber (os atendimentos concluídos sem pagamento, de
 *   qualquer dia — o total da lista abaixo);
 * - houve movimento depois do último fechamento (feche de novo);
 * - saiu em espécie mais do que entrou (o esperado na gaveta é negativo);
 * - e, só informativo, as taxas da maquininha estimadas do dia.
 */
function AvisosDoDia({ resumo, aReceber, emAberto = 0, operadora = null, avisos, fechadoAs }: {
  resumo: FechamentoDoDia; aReceber?: ListaAReceber; emAberto?: number; operadora?: OperadoraNoFechamento | null
  avisos?: AvisosDoFechamento; fechadoAs: string | null
}) {
  const lista: { chave: string; texto: string; link?: { href: string; rotulo: string } }[] = []
  if (aReceber && aReceber.total.n > 0) {
    const n = aReceber.total.n
    lista.push({ chave: 'a-receber', texto: `Há ${brl(aReceber.total.valor)} a receber de ${n} atendimento${n > 1 ? 's' : ''} concluído${n > 1 ? 's' : ''} sem pagamento (lista abaixo).` })
  }
  if (emAberto > 0) {
    lista.push({ chave: 'parcelas-em-aberto', texto: `Há ${brl(emAberto)} em parcelas e lançamentos a receber, de qualquer vencimento (no Financeiro).` })
  }
  if (operadora && operadora.emAberto > 0) {
    const proximo = operadora.proximo ? ' (o próximo, ' + brl(operadora.proximo.valor) + ' em ' + operadora.proximo.dia.split('-').reverse().join('/') + ')' : ''
    lista.push({
      chave: 'a-receber-da-operadora',
      texto: 'A operadora do cartão ainda vai depositar ' + brl(operadora.emAberto) + proximo + ': são as vendas no crédito, a receber dela — não da cliente.',
      ...(operadora.link ? { link: { href: operadora.link, rotulo: 'Ver no Financeiro' } } : {}),
    })
  }
  if (avisos && avisos.movimentosDepois > 0 && fechadoAs) {
    const n = avisos.movimentosDepois
    lista.push({ chave: 'movimento-depois', texto: `Houve ${n} lançamento${n > 1 ? 's' : ''} depois do fechamento das ${fechadoAs}: confira e feche de novo.` })
  }
  if (resumo.esperadoDinheiro < 0) {
    lista.push({ chave: 'dinheiro-negativo', texto: `Saiu mais dinheiro em espécie do que entrou hoje (${brl(Math.abs(resumo.esperadoDinheiro))} a mais): confira as saídas pagas em dinheiro.` })
  }
  // F16-2 (o Heitor, opção A): a venda no cartão sem a taxa exata cadastrada
  // saiu com 0% — sem desconto da operadora. A clínica fica sabendo aqui.
  const semTaxa = avisos?.vendasSemTaxa ?? []
  if (semTaxa.length) {
    const formas = semTaxa.map(x => {
      const b = rotuloDaBandeira(x.bandeira)
      return `${rotuloDaForma(x.metodo, x.vezes)}${b ? ` (${b})` : ''}: ${x.vendas} ${x.vendas === 1 ? 'venda' : 'vendas'}, ${brl(x.valor)}`
    }).join('; ')
    lista.push({
      chave: 'sem-taxa',
      texto: `Sem taxa da maquininha cadastrada — saiu sem desconto da operadora: ${formas}. Cadastre a taxa em Configurações → Comissões.`,
    })
  }
  const taxas = avisos?.taxas ?? 0
  if (!lista.length && taxas <= 0) return null
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
      {taxas > 0 && (
        <p data-taxas-do-dia style={{ display: 'flex', gap: 8, alignItems: 'center', margin: 0, fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
          <Info size={13} aria-hidden style={{ flexShrink: 0 }} />
          Taxas da maquininha no dia (estimadas): {brl(taxas)} — só para conferência; não saem do saldo.
        </p>
      )}
    </div>
  )
}
