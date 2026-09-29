const S = { borderRadius: 'var(--radius-row)' }

export default function Loading() {
  return (
    <div style={{ padding: 'var(--content-pad-y) var(--content-pad-x)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Título + botão */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="skeleton" style={{ height: 28, width: 160, ...S }} />
        <div className="skeleton" style={{ height: 36, width: 150, ...S }} />
      </div>
      {/* Barra de pesquisa + filtros */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div className="skeleton" style={{ height: 38, flex: 1, ...S }} />
        <div className="skeleton" style={{ height: 38, width: 100, ...S }} />
      </div>
      {/* Linhas de procedimento */}
      {[...Array(10)].map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 64, ...S }} />
      ))}
    </div>
  )
}
