const S = { borderRadius: 'var(--radius-row)' }

export default function Loading() {
  return (
    <div style={{ padding: 'var(--content-pad-y) var(--content-pad-x)', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="skeleton" style={{ height: 20, width: 200, ...S }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="skeleton" style={{ height: 36, width: 300, ...S }} />
          <div className="skeleton" style={{ height: 18, width: 200, ...S }} />
        </div>
        <div className="skeleton" style={{ height: 22, width: 80, borderRadius: 'var(--radius-chip-token)' }} />
      </div>
      {/* Métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 88 }} />
        ))}
      </div>
      {/* Gráfico */}
      <div className="skeleton" style={{ height: 240 }} />
      {/* Detalhes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="skeleton" style={{ height: 200 }} />
        <div className="skeleton" style={{ height: 200 }} />
      </div>
    </div>
  )
}
