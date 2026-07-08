export default function Loading() {
  return (
    <div style={{ padding: 'var(--content-pad-y) var(--content-pad-x)', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="skeleton" style={{ height: 28, width: 180, borderRadius: 'var(--radius-row)' }} />
      <div className="split-aside">
        {/* Formulário */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="skeleton" style={{ height: 120 }} />
          <div className="skeleton" style={{ height: 80 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 52, borderRadius: 'var(--radius-row)' }} />
            ))}
          </div>
          <div className="skeleton" style={{ height: 48, borderRadius: 'var(--radius-row)' }} />
        </div>
        {/* Resumo */}
        <div className="skeleton" style={{ height: 300 }} />
      </div>
    </div>
  )
}
