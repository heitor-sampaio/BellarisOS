const S = { borderRadius: 'var(--radius-row)' }

export default function Loading() {
  return (
    <div style={{ padding: 'var(--content-pad-y) var(--content-pad-x)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="skeleton" style={{ height: 28, width: 140, ...S }} />
        <div className="skeleton" style={{ height: 36, width: 150, ...S }} />
      </div>
      {/* Cabeçalho da tabela */}
      <div className="skeleton" style={{ height: 40, ...S }} />
      {/* Linhas de membro */}
      {[...Array(7)].map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 'var(--radius-full)', flexShrink: 0 }} />
          <div className="skeleton" style={{ height: 48, flex: 1, ...S }} />
        </div>
      ))}
    </div>
  )
}
