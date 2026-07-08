const S = { borderRadius: 'var(--radius-row)' }

export default function Loading() {
  return (
    <div style={{ padding: 'var(--content-pad-y) var(--content-pad-x)', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Tabs de relatório */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[...Array(7)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 34, width: 90, ...S }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 32, width: 72, ...S }} />
          ))}
        </div>
      </div>
      {/* KPIs */}
      <div className="kpi-grid-auto" style={{ gap: 16 }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 96 }} />
        ))}
      </div>
      {/* Gráfico principal */}
      <div className="skeleton" style={{ height: 260 }} />
      {/* Segunda linha: 2 gráficos menores */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="skeleton" style={{ height: 200 }} />
        <div className="skeleton" style={{ height: 200 }} />
      </div>
      {/* Tabela de detalhes */}
      <div className="skeleton" style={{ height: 40, ...S }} />
      {[...Array(6)].map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 48, ...S }} />
      ))}
    </div>
  )
}
