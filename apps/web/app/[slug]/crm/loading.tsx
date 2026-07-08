export default function Loading() {
  return (
    <div style={{ padding: 'var(--content-pad-y) var(--content-pad-x)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="skeleton" style={{ height: 28, width: 120, borderRadius: 'var(--radius-row)' }} />
        <div className="skeleton" style={{ height: 36, width: 140, borderRadius: 'var(--radius-row)' }} />
      </div>
      {/* Colunas do kanban */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, alignItems: 'flex-start' }}>
        {[6, 4, 5, 3].map((cards, col) => (
          <div key={col} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Cabeçalho da coluna */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="skeleton" style={{ height: 20, width: 100, borderRadius: 'var(--radius-row)' }} />
              <div className="skeleton" style={{ height: 20, width: 24, borderRadius: 'var(--radius-chip-token)' }} />
            </div>
            {/* Cards da coluna */}
            {[...Array(cards)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 88, borderRadius: 'var(--radius-card-sm)' }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
