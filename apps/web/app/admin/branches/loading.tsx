const S = { borderRadius: 'var(--radius-row)' }

export default function Loading() {
  return (
    <div style={{ padding: 'var(--content-pad-y) var(--content-pad-x)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="skeleton" style={{ height: 28, width: 140, ...S }} />
        <div className="skeleton" style={{ height: 36, width: 150, ...S }} />
      </div>
      <div className="kpi-grid-auto" style={{ gap: 16 }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 140 }} />
        ))}
      </div>
    </div>
  )
}
