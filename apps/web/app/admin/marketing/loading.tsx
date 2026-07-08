const S = { borderRadius: 'var(--radius-row)' }

export default function Loading() {
  return (
    <div style={{ padding: 'var(--content-pad-y) var(--content-pad-x)', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header + tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 36, width: 100, ...S }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 32, width: 72, ...S }} />
          ))}
        </div>
      </div>
      {/* KPIs de marketing */}
      <div className="kpi-grid-auto" style={{ gap: 16 }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 96 }} />
        ))}
      </div>
      {/* Gráfico */}
      <div className="skeleton" style={{ height: 220 }} />
      {/* Tabela de campanhas */}
      <div className="skeleton" style={{ height: 40, ...S }} />
      {[...Array(6)].map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 56, ...S }} />
      ))}
    </div>
  )
}
