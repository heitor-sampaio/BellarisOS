'use client'

import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp } from 'lucide-react'
import { formatBRL } from '@estetica-os/utils'
import { numericAxisWidth, rotuloDoEixo } from '@/lib/chart-utils'
import type { MesDoFluxo } from '@/lib/metrics/fluxo-de-caixa'
import { SegSelect } from '@/components/shared/seg-select'

/**
 * O fluxo de caixa dos PRÓXIMOS meses (r2-fin-04; o Heitor, 2026-11-03: "crie
 * o gráfico"), nos dois financeiros: o que entra (o a receber da cliente e o
 * que a operadora do cartão ainda deposita, empilhados) e o que sai (as
 * despesas a pagar), mês a mês, com o saldo de cada mês na tabela ao lado do
 * gráfico. Todo número vem de `lib/metrics/fluxo-de-caixa` — aqui só se
 * desenha.
 */

const SERIES = [
  { chave: 'daCliente',   rotulo: 'A receber da cliente',  cor: 'var(--brand)',   pilha: 'entra' },
  { chave: 'daOperadora', rotulo: 'A receber da operadora', cor: 'var(--brand-3)', pilha: 'entra' },
  { chave: 'aPagar',      rotulo: 'A pagar',               cor: 'var(--danger)',  pilha: 'sai' },
] as const

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
/** "2026-11" → "nov/26". */
const rotuloDoMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1] ?? m}/${m.slice(2, 4)}`

/** O eixo em reais (A52 da 9ª: "1,5k", não "2k" ao lado do 2.000). */
const fmtEixo = (v: number) => rotuloDoEixo(v)

interface EntradaDoTooltip { dataKey?: string | number; value?: unknown }

function Dica({ active, payload, label }: { active?: boolean; payload?: EntradaDoTooltip[]; label?: string | number }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-field-token)',
      padding: '10px 14px', boxShadow: 'var(--shadow-popover)', minWidth: 200,
    }}>
      <p className="overline" style={{ marginBottom: 8 }}>{rotuloDoMes(String(label))}</p>
      {SERIES.map(s => {
        const v = Number(payload.find(p => p.dataKey === s.chave)?.value ?? 0)
        return (
          <div key={s.chave} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 4 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: s.cor }} />{s.rotulo}
            </span>
            <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 800, color: 'var(--text)' }}>{formatBRL(v)}</span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Quantos meses (r3-f13-11, o Heitor: "quem vende pacote em 10x quer ver o
 * ano"): 3, 6 ou 12, 6 por padrão. O servidor manda os 12 (`getFluxoDeCaixa`
 * com `meses: 12`); a tela mostra os primeiros N, sem refazer conta.
 */
const PERIODOS = [3, 6, 12] as const

export function FluxoDeCaixa({ meses: todos }: { meses: MesDoFluxo[] }) {
  const [quantos, setQuantos] = useState<number>(6)
  const meses = todos.slice(0, quantos)
  if (!meses.length) return null
  const vazio = meses.every(m => m.daCliente === 0 && m.daOperadora === 0 && m.aPagar === 0)
  const eixo = numericAxisWidth(meses.flatMap(m => [m.daCliente + m.daOperadora, m.aPagar]), fmtEixo)
  const th: React.CSSProperties = {
    fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em',
    padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
  }
  const td: React.CSSProperties = { padding: '9px 12px', fontSize: 'var(--text-sm-sz)', textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--text)' }

  return (
    <div className="card" data-fluxo-de-caixa style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <TrendingUp size={15} style={{ color: 'var(--brand)' }} aria-hidden />
          <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)', flex: 1 }}>Fluxo de caixa — próximos {meses.length} meses</h2>
          <SegSelect
            options={PERIODOS.map(n => ({ key: String(n), label: `${n} meses` }))}
            value={String(quantos)}
            onSelect={k => setQuantos(Number(k))}
            ariaLabel="Quantos meses do fluxo de caixa"
          />
        </div>
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 2 }}>
          O que entra (o a receber da cliente e o que a operadora do cartão deposita) e o que sai (as despesas a pagar),
          pelo vencimento. O que já venceu e está em aberto conta no mês atual.
        </p>
      </div>

      {vazio ? (
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>Nada a receber nem a pagar nos próximos meses.</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '8px 18px', flexWrap: 'wrap' }} aria-hidden>
            {SERIES.map(s => (
              <span key={s.chave} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)' }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: s.cor }} />{s.rotulo}
              </span>
            ))}
          </div>
          <div role="img" aria-label="Gráfico do fluxo de caixa dos próximos meses: a tabela abaixo tem os mesmos números">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={meses} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 0" vertical={false} stroke="var(--hairline)" />
                <XAxis dataKey="mes" tickFormatter={rotuloDoMes} tickLine={false} axisLine={false}
                  tick={{ fontSize: 'var(--text-overline)', fill: 'var(--text-muted)' }} />
                <YAxis width={eixo} tickFormatter={fmtEixo} tickLine={false} axisLine={false}
                  tick={{ fontSize: 'var(--text-overline)', fill: 'var(--text-faint)' }} />
                <Tooltip content={<Dica />} cursor={{ fill: 'var(--brand-soft)' }} />
                {SERIES.map(s => (
                  <Bar key={s.chave} dataKey={s.chave} stackId={s.pilha} fill={s.cor} maxBarSize={28}
                    stroke="var(--surface)" strokeWidth={2}
                    radius={s.chave === 'daCliente' ? [0, 0, 0, 0] : [4, 4, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      <div className="table-wrap">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>MÊS</th>
              <th style={th}>DA CLIENTE</th>
              <th style={th}>DA OPERADORA</th>
              <th style={th}>A PAGAR</th>
              <th style={th}>SALDO</th>
            </tr>
          </thead>
          <tbody>
            {meses.map(m => (
              <tr key={m.mes} data-mes={m.mes} style={{ borderBottom: '1px solid var(--hairline)' }}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{rotuloDoMes(m.mes)}</td>
                <td style={td}>{formatBRL(m.daCliente)}</td>
                <td style={td}>{formatBRL(m.daOperadora)}</td>
                <td style={td}>{formatBRL(m.aPagar)}</td>
                <td style={{ ...td, fontWeight: 800, color: m.saldo < 0 ? 'var(--danger)' : 'var(--text)' }}>{formatBRL(m.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
