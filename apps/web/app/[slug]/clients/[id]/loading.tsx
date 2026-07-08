const S = { borderRadius: 'var(--radius-row)' }

export default function Loading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header do cliente */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div className="skeleton" style={{ width: 72, height: 72, borderRadius: 'var(--radius-squircle)', flexShrink: 0 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="skeleton" style={{ height: 24, width: 200, ...S }} />
          <div className="skeleton" style={{ height: 16, width: 140, ...S }} />
          <div style={{ display: 'flex', gap: 6 }}>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 22, width: 70, borderRadius: 'var(--radius-chip-token)' }} />
            ))}
          </div>
        </div>
        <div className="skeleton" style={{ height: 36, width: 120, ...S }} />
      </div>
      {/* Stats rápidas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 72 }} />
        ))}
      </div>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4 }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 32, width: 90, ...S }} />
        ))}
      </div>
      {/* Conteúdo da tab */}
      <div className="skeleton" style={{ height: 320 }} />
    </div>
  )
}
