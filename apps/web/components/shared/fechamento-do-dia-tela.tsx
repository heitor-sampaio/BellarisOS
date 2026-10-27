'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CheckCircle2, Wallet } from 'lucide-react'
import { fecharODia } from '@/actions/fechamento'
import { SegSelect } from '@/components/shared/seg-select'
import type { FechamentoDoDia } from '@/lib/metrics'
import type { ListaAReceber } from '@/lib/metrics/a-receber'
import { AtendimentosAReceber } from '@/components/shared/atendimentos-a-receber'
import { rotuloDaFormaDoFechamento } from '@/lib/financeiro/formas'

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
export function FechamentoDoDiaTela({ basePath, dia, unidades, unidadeId, resumo, feitos, podeFechar, aReceber, podeReceberAtendimento = false }: {
  basePath:  string
  dia:       string
  unidades:  { id: string; name: string }[]
  unidadeId: string
  resumo:    FechamentoDoDia
  feitos:    FechamentoFeito[]
  podeFechar: boolean
  /** Os atendimentos concluídos e não pagos da unidade (D5, 2026-10-27). */
  aReceber?: ListaAReceber
  podeReceberAtendimento?: boolean
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

  function fechar(e: React.FormEvent) {
    e.preventDefault()
    const valor = Number(contado.replace(/\./g, '').replace(',', '.'))
    if (contado.trim() === '' || !Number.isFinite(valor) || valor < 0) { setErro('Informe o dinheiro contado.'); return }
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

        {ultimo && (
          <p style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
            <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />
            Fechado por {ultimo.quem ?? '—'} às {hora(ultimo.quando)} · contado {brl(ultimo.contado)} · <Diferenca valor={ultimo.diferenca} />
            {ultimo.observacao && <span>· “{ultimo.observacao}”</span>}
          </p>
        )}

        {podeFechar && (
          <form onSubmit={fechar} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)' }}>
              Dinheiro contado (R$)
              <input className="field" inputMode="decimal" value={contado} onChange={e => setContado(e.target.value)} placeholder="0,00" style={{ width: 160 }} />
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
