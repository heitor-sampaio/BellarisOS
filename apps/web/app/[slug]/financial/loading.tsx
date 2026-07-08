const S = { borderRadius: 'var(--radius-row)' }

export default function Loading() {
  return (
    <div style={{ padding: 'var(--content-pad-y) var(--content-pad-x)', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 96 }} />
        ))}
      </div>
      {/* Filtros + ações */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 32, width: 70, ...S }} />
          ))}
        </div>
        <div className="skeleton" style={{ height: 36, width: 130, ...S }} />
      </div>
      {/* Tabela */}
      <div className="skeleton" style={{ height: 40, ...S }} />
      {[...Array(8)].map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 52, ...S }} />
      ))}
    </div>
  )
}
