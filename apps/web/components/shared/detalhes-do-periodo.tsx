'use client'

import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { montarBarras, type BarDatum, type PontoDaSerie } from '@/lib/financeiro/barras'
import { useFuso } from '@/components/shared/fuso'
import type { ComposicaoFinanceira } from '@/lib/metrics'

/**
 * Os detalhes do período no Resumo do Financeiro — a evolução, as formas de
 * pagamento e as categorias de receita e de despesa. OS MESMOS cartões na
 * unidade e na rede (D11 da 39ª, FN-02: o Resumo da rede parava no "Por
 * unidade"). Os números vêm de lib/metrics (`metrics_series`,
 * `metrics_financeiro_composicao`) pelo servidor; aqui só se posiciona e se
 * desenha. O "Comissões" da unidade entra no meio da primeira linha (`comissoes`).
 */

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const PM_LABELS: Record<string, string> = {
  CASH:            'Dinheiro',
  PIX:             'PIX',
  DEBIT_CARD:      'Débito',
  CREDIT_CARD:     'Crédito',
  INTERNAL_CREDIT: 'Crédito interno',
}
const PM_COLORS: Record<string, string> = {
  CASH:            'var(--success)',
  PIX:             'var(--info)',
  DEBIT_CARD:      'var(--cat-4)',
  CREDIT_CARD:     'var(--cat-5)',
  INTERNAL_CREDIT: 'var(--brand)',
}

const tituloDeSecao: CSSProperties = { fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }

// --- Evolution Chart (SVG bar chart) -----------------------------

function EvolutionChart({ data }: { data: BarDatum[] }) {
  const H        = 130
  const barW     = 8
  const gap      = 4
  const groupW   = barW * 2 + gap + 6
  const totalW   = Math.max(data.length * groupW, 400)
  const maxVal   = Math.max(...data.flatMap(d => [d.income, d.expense]), 1)
  const gridLines = 4

  return (
    <div style={{ overflowX: 'auto', overflowY: 'hidden' }}>
      <svg
        viewBox={`0 0 ${totalW} ${H + 36}`}
        width={totalW}
        height={H + 36}
        style={{ display: 'block', minWidth: '100%' }}
      >
        {/* Grid lines */}
        {Array.from({ length: gridLines + 1 }, (_, i) => {
          const y = H - (i / gridLines) * H
          return (
            <line
              key={i}
              x1={0} y1={y} x2={totalW} y2={y}
              stroke="var(--border)" strokeWidth={0.5}
              strokeDasharray={i === 0 ? 'none' : '3,3'}
            />
          )
        })}

        {data.map((d, i) => {
          const x = i * groupW + 2
          const incH = maxVal > 0 ? (d.income  / maxVal) * H : 0
          const expH = maxVal > 0 ? (d.expense / maxVal) * H : 0
          const showLabel = data.length <= 31 || i % Math.ceil(data.length / 15) === 0

          return (
            <g key={i}>
              {/* Income bar */}
              {d.income > 0 && (
                <rect
                  x={x} y={H - incH} width={barW} height={incH}
                  fill="var(--success)" opacity={0.85} rx={2}
                >
                  <title>{`Receitas: ${fmtBRL(d.income)}`}</title>
                </rect>
              )}
              {/* Expense bar */}
              {d.expense > 0 && (
                <rect
                  x={x + barW + gap} y={H - expH} width={barW} height={expH}
                  fill="var(--danger)" opacity={0.75} rx={2}
                >
                  <title>{`Despesas: ${fmtBRL(d.expense)}`}</title>
                </rect>
              )}
              {/* X label */}
              {showLabel && (
                <text
                  x={x + barW}
                  y={H + 18}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={600}
                  fill="var(--text-faint)"
                >
                  {d.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// --- Payment Method Donut -----------------------------------------

interface DonutSegment { label: string; value: number; color: string }

function DonutChart({ segments, total }: { segments: DonutSegment[]; total: number }) {
  const R    = 52
  const CX   = 75
  const CY   = 75
  const circ = 2 * Math.PI * R

  if (total === 0) {
    return (
      <svg viewBox="0 0 150 150" width={150} height={150}>
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--border)" strokeWidth={16} />
        <text x={CX} y={CY + 5} textAnchor="middle" fontSize={11} fill="var(--text-faint)" fontWeight={700}>
          Sem dados
        </text>
      </svg>
    )
  }

  // Rotate each segment by accumulating angles; start at -90° (12 o'clock).
  // Calculado ANTES do JSX: acumular dentro do `map` reatribuía a variável
  // depois de o render ter terminado.
  const rotacoes: number[] = []
  let acumulado = -90
  for (const seg of segments) {
    rotacoes.push(acumulado)
    acumulado += (seg.value / total) * 360
  }
  return (
    <svg viewBox="0 0 150 150" width={150} height={150}>
      {/* Track ring */}
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--bg-app)" strokeWidth={16} />

      {segments.map((seg, i) => {
        const pct       = seg.value / total
        const dashLen   = pct * circ
        const rotate    = rotacoes[i]
        return (
          <circle
            key={i}
            cx={CX} cy={CY} r={R}
            fill="none"
            stroke={seg.color}
            strokeWidth={14}
            strokeLinecap="butt"
            strokeDasharray={`${dashLen} ${circ - dashLen}`}
            transform={`rotate(${rotate} ${CX} ${CY})`}
          >
            <title>{`${seg.label}: ${fmtBRL(seg.value)}`}</title>
          </circle>
        )
      })}

      {/* Center text */}
      <text x={CX} y={CY - 5} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="var(--text-muted)" letterSpacing="0.04em">
        RECEITAS
      </text>
      <text x={CX} y={CY + 11} textAnchor="middle" fontSize={12} fontWeight={800} fill="var(--text)">
        {fmtBRL(total)}
      </text>
    </svg>
  )
}

// --- Category Horizontal Bars -------------------------------------

function CategoryBars({
  items, color,
}: { items: { label: string; value: number; pct: number }[]; color: string }) {
  if (items.length === 0) {
    return (
      <p style={{ color: 'var(--text-faint)', fontSize: 'var(--text-sm-sz)', textAlign: 'center', padding: '16px 0' }}>
        Nenhum lançamento
      </p>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.slice(0, 6).map(item => (
        <div key={item.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)' }}>{item.label}</span>
            <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 800, color }}>
              {fmtBRL(item.value)}
            </span>
          </div>
          <div style={{
            height: 5, background: 'var(--bg-app)', borderRadius: 99,
            overflow: 'hidden', border: '1px solid var(--hairline)',
          }}>
            <div style={{
              height: '100%', borderRadius: 99,
              width: `${Math.max(item.pct, 2)}%`,
              background: color, opacity: 0.8,
              transition: 'width 600ms ease',
            }} />
          </div>
          <span style={{ fontSize: 'var(--text-overline)', color: 'var(--text-faint)', marginTop: 2, display: 'block' }}>
            {item.pct.toFixed(0)}% do total
          </span>
        </div>
      ))}
    </div>
  )
}


// --- Os cartões ----------------------------------------------------

export function DetalhesDoPeriodo({
  serie, period, periodStart, composicao, receita, despesa, comissoes,
}: {
  /** A série de receita × despesa do período (metrics_series). */
  serie:       PontoDaSerie[]
  period:      string
  periodStart: string
  /** Formas de pagamento e categorias do período (metrics_financeiro_composicao). */
  composicao:  ComposicaoFinanceira
  /** A receita e a despesa do período (os cartões do topo): a base dos percentuais. */
  receita:     number
  despesa:     number
  /** O cartão das comissões da unidade, entre a evolução e as formas. */
  comissoes?:  ReactNode
}) {
  // Os valores vêm de metrics_series; aqui só se posiciona (lib/financeiro/barras).
  const fuso = useFuso()
  const barData = useMemo(() => montarBarras(serie, period, periodStart, new Date(), fuso), [serie, period, periodStart, fuso])

  // A composição vem do banco (metrics_financeiro_composicao): a tela somava a
  // lista e contava a contra-transação do estorno como despesa — as categorias
  // davam R$ 6.950 contra o KPI de R$ 6.900 (simulação de 2026-10-20).
  const paymentSegments = composicao.formas
    .map(f => ({ label: PM_LABELS[f.chave] ?? f.chave, value: f.valor, color: PM_COLORS[f.chave] ?? 'var(--text-faint)' }))
  const paymentTotal = receita
  const comoItens = (lista: { chave: string; valor: number }[], total: number) =>
    lista.map(x => ({ label: x.chave, value: x.valor, pct: total > 0 ? (x.valor / total) * 100 : 0 }))
  const incomeCategories  = comoItens(composicao.receitas, receita)
  const expenseCategories = comoItens(composicao.despesas, despesa)

  return <>
    {/* Os detalhes do período — evolução | comissões | formas de pagamento */}
    <div className={comissoes ? 'rg-3' : 'rg-2'}>
      <div className="card" style={{ padding: '20px 20px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <p style={tituloDeSecao}>Evolução financeira</p>
            <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginTop: 2 }}>
              Receitas vs despesas realizadas
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--success)' }} />
              <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)' }}>Receitas</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--danger)' }} />
              <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)' }}>Despesas</span>
            </div>
          </div>
        </div>
        <EvolutionChart data={barData} />
      </div>

      {comissoes}

      <div className="card" style={{ padding: '20px' }}>
        <p style={{ ...tituloDeSecao, marginBottom: 4 }}>Formas de pagamento</p>
        <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginBottom: 16 }}>Receitas por método</p>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <DonutChart segments={paymentSegments} total={paymentTotal} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {paymentSegments.map(seg => (
            <div key={seg.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: seg.color, flexShrink: 0 }} />
                <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)' }}>{seg.label}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 800, color: 'var(--text)' }}>
                  {paymentTotal > 0 ? ((seg.value / paymentTotal) * 100).toFixed(0) : 0}%
                </span>
                <span style={{ fontSize: 'var(--text-overline)', color: 'var(--text-faint)', marginLeft: 4 }}>
                  {fmtBRL(seg.value)}
                </span>
              </div>
            </div>
          ))}
          {paymentSegments.length === 0 && (
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)', textAlign: 'center' }}>Sem receitas pagas</p>
          )}
        </div>
      </div>
    </div>

    {/* Category breakdown */}
    <div className="rg-2">
      <div className="card" style={{ padding: '20px' }}>
        <p style={{ ...tituloDeSecao, marginBottom: 4 }}>Categorias de receita</p>
        <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginBottom: 16 }}>Top 6 categorias</p>
        <CategoryBars items={incomeCategories} color="var(--success)" />
      </div>
      <div className="card" style={{ padding: '20px' }}>
        <p style={{ ...tituloDeSecao, marginBottom: 4 }}>Categorias de despesa</p>
        <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginBottom: 16 }}>Top 6 categorias</p>
        <CategoryBars items={expenseCategories} color="var(--danger)" />
      </div>
    </div>
  </>
}
