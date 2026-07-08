const S = { borderRadius: 'var(--radius-row)' }

export default function Loading() {
  return (
    <div style={{ padding: 'var(--content-pad-y) var(--content-pad-x)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="skeleton" style={{ height: 28, width: 120, ...S }} />
        <div className="skeleton" style={{ height: 36, width: 160, ...S }} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div className="skeleton" style={{ height: 38, flex: 1, ...S }} />
        <div className="skeleton" style={{ height: 38, width: 120, ...S }} />
      </div>
      <div className="skeleton" style={{ height: 40, ...S }} />
      {[...Array(8)].map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="skeleton" style={{ width: 38, height: 38, borderRadius: 'var(--radius-full)', flexShrink: 0 }} />
          <div className="skeleton" style={{ height: 48, flex: 1, ...S }} />
        </div>
      ))}
    </div>
  )
}
