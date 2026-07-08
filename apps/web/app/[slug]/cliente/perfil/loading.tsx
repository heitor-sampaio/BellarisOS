const S = { borderRadius: 'var(--radius-row)' }

export default function Loading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Avatar + nome */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div className="skeleton" style={{ width: 80, height: 80, borderRadius: 'var(--radius-full)' }} />
        <div className="skeleton" style={{ height: 22, width: 160, ...S }} />
        <div className="skeleton" style={{ height: 16, width: 120, ...S }} />
      </div>
      {/* Campos do perfil */}
      {[...Array(5)].map((_, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="skeleton" style={{ height: 13, width: 80, ...S }} />
          <div className="skeleton" style={{ height: 42, ...S }} />
        </div>
      ))}
      <div className="skeleton" style={{ height: 44, ...S }} />
    </div>
  )
}
