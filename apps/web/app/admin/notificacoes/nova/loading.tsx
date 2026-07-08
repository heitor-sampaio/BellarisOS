const S = { borderRadius: 'var(--radius-row)' }

export default function Loading() {
  return (
    <div style={{ padding: 'var(--content-pad-y) var(--content-pad-x)', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="skeleton" style={{ height: 28, width: 220, ...S }} />
      <div className="split-aside">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="skeleton" style={{ height: 14, width: 100, ...S }} />
              <div className="skeleton" style={{ height: 42, ...S }} />
            </div>
          ))}
          <div className="skeleton" style={{ height: 80, ...S }} />
        </div>
        <div className="skeleton" style={{ height: 360 }} />
      </div>
    </div>
  )
}
