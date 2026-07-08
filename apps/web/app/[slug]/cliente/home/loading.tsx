const S = { borderRadius: 'var(--radius-row)' }

export default function Loading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Saudação */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="skeleton" style={{ height: 18, width: 100, ...S }} />
        <div className="skeleton" style={{ height: 28, width: 200, ...S }} />
      </div>
      {/* Card próximo agendamento */}
      <div className="skeleton" style={{ height: 120 }} />
      {/* Linha: saldo de pontos + pacote ativo */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="skeleton" style={{ height: 100 }} />
        <div className="skeleton" style={{ height: 100 }} />
      </div>
      {/* Procedimentos disponíveis */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="skeleton" style={{ height: 16, width: 160, ...S }} />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 68 }} />
        ))}
      </div>
    </div>
  )
}
