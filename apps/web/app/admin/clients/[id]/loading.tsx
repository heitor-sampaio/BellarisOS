const S = { borderRadius: 'var(--radius-row)' }

export default function Loading() {
  return (
    <div style={{ padding: 'var(--content-pad-y) var(--content-pad-x)', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header do cliente */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div className="skeleton" style={{ width: 72, height: 72, borderRadius: 'var(--radius-squircle)', flexShrink: 0 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="skeleton" style={{ height: 24, width: 200, ...S }} />
          <div className="skeleton" style={{ height: 16, width: 160, ...S }} />
          <div style={{ display: 'flex', gap: 6 }}>
            {[...Array(2)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 22, width: 80, borderRadius: 'var(--radius-chip-token)' }} />
            ))}
          </div>
        </div>
        <div className="skeleton" style={{ height: 36, width: 130, ...S }} />
      </div>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 80 }} />
        ))}
      </div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4 }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 32, width: 100, ...S }} />
        ))}
      </div>
      <div className="skeleton" style={{ height: 360 }} />
    </div>
  )
}
