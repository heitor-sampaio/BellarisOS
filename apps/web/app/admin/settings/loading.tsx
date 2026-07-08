const S = { borderRadius: 'var(--radius-row)' }

export default function Loading() {
  return (
    <div style={{ padding: 'var(--content-pad-y) var(--content-pad-x)', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="skeleton" style={{ height: 28, width: 200, ...S }} />
      {[...Array(4)].map((_, s) => (
        <div key={s} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="skeleton" style={{ height: 18, width: 140, ...S }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 42, ...S }} />
            ))}
          </div>
        </div>
      ))}
      <div className="skeleton" style={{ height: 40, width: 140, ...S }} />
    </div>
  )
}
