const S = { borderRadius: 'var(--radius-row)' }

export default function Loading() {
  return (
    <div style={{ padding: 'var(--content-pad-y) var(--content-pad-x)', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPI cards */}
      <div className="kpi-grid-auto" style={{ gap: 16 }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 88 }} />
        ))}
      </div>
      {/* Busca + botão */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div className="skeleton" style={{ height: 38, flex: 1, ...S }} />
        <div className="skeleton" style={{ height: 38, width: 120, ...S }} />
        <div className="skeleton" style={{ height: 38, width: 130, ...S }} />
      </div>
      {/* Cabeçalho da tabela */}
      <div className="skeleton" style={{ height: 40, ...S }} />
      {/* Linhas */}
      {[...Array(8)].map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 56, ...S }} />
      ))}
    </div>
  )
}
