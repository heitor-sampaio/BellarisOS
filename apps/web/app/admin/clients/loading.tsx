const S = { borderRadius: 'var(--radius-row)' }

export default function Loading() {
  return (
    <div style={{ padding: 'var(--content-pad-y) var(--content-pad-x)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="skeleton" style={{ height: 28, width: 140, ...S }} />
        <div className="skeleton" style={{ height: 36, width: 130, ...S }} />
      </div>
      <div className="skeleton" style={{ height: 38, ...S }} />
      <div className="skeleton" style={{ height: 40, ...S }} />
      {[...Array(10)].map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="skeleton" style={{ width: 38, height: 38, borderRadius: 'var(--radius-full)', flexShrink: 0 }} />
          <div className="skeleton" style={{ height: 48, flex: 1, ...S }} />
        </div>
      ))}
    </div>
  )
}
