const S = { borderRadius: 'var(--radius-row)' }

export default function Loading() {
  return (
    <div style={{ padding: 'var(--content-pad-y) var(--content-pad-x)', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Breadcrumb */}
      <div className="skeleton" style={{ height: 20, width: 240, ...S }} />
      {/* Duas colunas: conteúdo principal + painel lateral */}
      <div className="grid-stack-md" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'flex-start' }}>
        {/* Coluna esquerda */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Card principal do agendamento */}
          <div className="skeleton" style={{ height: 200 }} />
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 8 }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 32, width: 100, ...S }} />
            ))}
          </div>
          {/* Conteúdo da tab */}
          <div className="skeleton" style={{ height: 280 }} />
        </div>
        {/* Coluna direita */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="skeleton" style={{ height: 160 }} />
          <div className="skeleton" style={{ height: 120 }} />
          <div className="skeleton" style={{ height: 100 }} />
        </div>
      </div>
    </div>
  )
}
