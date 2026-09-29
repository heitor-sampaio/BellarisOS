const S = { borderRadius: 'var(--radius-row)' }

export default function Loading() {
  return (
    <div style={{ padding: 'var(--content-pad-y) var(--content-pad-x)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="skeleton" style={{ height: 28, width: 160, ...S }} />
        <div className="skeleton" style={{ height: 36, width: 160, ...S }} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div className="skeleton" style={{ height: 38, flex: 1, ...S }} />
        <div className="skeleton" style={{ height: 38, width: 120, ...S }} />
      </div>
      <div className="skeleton" style={{ height: 40, ...S }} />
      {[...Array(9)].map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 60, ...S }} />
      ))}
    </div>
  )
}
