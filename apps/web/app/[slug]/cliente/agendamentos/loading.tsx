const S = { borderRadius: 'var(--radius-row)' }

export default function Loading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="skeleton" style={{ height: 28, width: 160, ...S }} />
        <div className="skeleton" style={{ height: 36, width: 120, ...S }} />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 30, width: 90, borderRadius: 'var(--radius-chip-token)' }} />
        ))}
      </div>
      {[...Array(5)].map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 88 }} />
      ))}
    </div>
  )
}
