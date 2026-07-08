const S = { borderRadius: 'var(--radius-row)' }

export default function Loading() {
  return (
    <div style={{ padding: 'var(--content-pad-y) var(--content-pad-x)', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="skeleton" style={{ height: 20, width: 180, ...S }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="skeleton" style={{ height: 32, width: 320, ...S }} />
        <div className="skeleton" style={{ height: 18, width: 240, ...S }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 80 }} />
        ))}
      </div>
      <div className="skeleton" style={{ height: 200 }} />
      <div className="skeleton" style={{ height: 40, ...S }} />
      {[...Array(5)].map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 52, ...S }} />
      ))}
    </div>
  )
}
