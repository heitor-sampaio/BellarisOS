const S = { borderRadius: 'var(--radius-row)' }

export default function Loading() {
  return (
    <div style={{ padding: 'var(--content-pad-y) var(--content-pad-x)', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPIs */}
      <div className="kpi-grid-auto" style={{ gap: 16 }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 96 }} />
        ))}
      </div>
      {/* Gráfico */}
      <div className="skeleton" style={{ height: 200 }} />
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 32, width: 80, ...S }} />
        ))}
      </div>
      {/* Tabela */}
      <div className="skeleton" style={{ height: 40, ...S }} />
      {[...Array(8)].map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 52, ...S }} />
      ))}
    </div>
  )
}
