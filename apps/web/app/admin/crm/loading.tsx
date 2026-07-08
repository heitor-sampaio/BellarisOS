const S = { borderRadius: 'var(--radius-row)' }

export default function Loading() {
  return (
    <div style={{ padding: 'var(--content-pad-y) var(--content-pad-x)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="skeleton" style={{ height: 28, width: 160, ...S }} />
        <div className="skeleton" style={{ height: 36, width: 140, ...S }} />
      </div>
      {/* Split: lista de conversas + detalhe */}
      <div className="grid-stack-md" style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'flex-start' }}>
        {/* Lista de conversas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="skeleton" style={{ height: 38, ...S }} />
          {[...Array(8)].map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 'var(--radius-full)', flexShrink: 0 }} />
              <div className="skeleton" style={{ height: 52, flex: 1, ...S }} />
            </div>
          ))}
        </div>
        {/* Painel de conversa */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="skeleton" style={{ height: 60, ...S }} />
          <div className="skeleton" style={{ height: 400 }} />
          <div className="skeleton" style={{ height: 48, ...S }} />
        </div>
      </div>
    </div>
  )
}
