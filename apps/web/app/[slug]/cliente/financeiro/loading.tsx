const S = { borderRadius: 'var(--radius-row)' }

export default function Loading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="skeleton" style={{ height: 28, width: 160, ...S }} />
      <div className="skeleton" style={{ height: 100 }} />
      <div className="skeleton" style={{ height: 18, width: 120, ...S }} />
      {[...Array(6)].map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 64, ...S }} />
      ))}
    </div>
  )
}
