const S = { borderRadius: 'var(--radius-row)' }

export default function Loading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Steps */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="skeleton" style={{ width: 28, height: 28, borderRadius: 'var(--radius-full)' }} />
            {i < 3 && <div className="skeleton" style={{ height: 2, width: 40, borderRadius: 2 }} />}
          </div>
        ))}
      </div>
      {/* Conteúdo do step */}
      <div className="skeleton" style={{ height: 24, width: 200, ...S }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 64 }} />
        ))}
      </div>
      <div className="skeleton" style={{ height: 44, ...S }} />
    </div>
  )
}
