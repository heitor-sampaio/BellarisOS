// Server component — SVG puro, sem JS no cliente

interface RevenueBarChartProps {
  data: { label: string; value: number }[]
}

function formatVal(v: number) {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `R$ ${(v / 1_000).toFixed(1)}k`
  return `R$ ${v.toFixed(0)}`
}

export function RevenueBarChart({ data }: RevenueBarChartProps) {
  const max   = Math.max(...data.map(d => d.value), 1)
  const W     = 600
  const H     = 170
  const PAD   = { top: 30, right: 12, bottom: 38, left: 12 }
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const colW  = plotW / data.length
  const barW  = colW * 0.52

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', display: 'block' }}
      role="img"
      aria-label="Faturamento dos últimos 6 meses"
    >
      {/* Gridlines */}
      {[0.25, 0.5, 0.75, 1].map((frac, i) => {
        const y = PAD.top + plotH * (1 - frac)
        return <line key={i} x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="#f4ebe8" strokeWidth={1} />
      })}

      {data.map((d, i) => {
        const isCurrent = i === data.length - 1
        const barH = d.value > 0 ? Math.max((d.value / max) * plotH, 4) : 0
        const x    = PAD.left + colW * i + (colW - barW) / 2
        const y    = PAD.top + plotH - barH

        return (
          <g key={i}>
            {/* Barra */}
            <rect x={x} y={y} width={barW} height={barH}
              fill={isCurrent ? '#c34d6b' : '#f3c7d3'} rx={5} />

            {/* Label de valor */}
            {d.value > 0 && (
              <text x={x + barW / 2} y={y - 7} textAnchor="middle"
                fill={isCurrent ? '#c34d6b' : '#b7a8ac'}
                fontSize={9} fontWeight={700}
                fontFamily="'Hanken Grotesk', ui-sans-serif, system-ui, sans-serif">
                {formatVal(d.value)}
              </text>
            )}

            {/* Mês */}
            <text x={x + barW / 2} y={H - 8} textAnchor="middle"
              fill={isCurrent ? '#c34d6b' : '#8a7a7e'}
              fontSize={10} fontWeight={700}
              fontFamily="'Hanken Grotesk', ui-sans-serif, system-ui, sans-serif">
              {d.label.toUpperCase()}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
