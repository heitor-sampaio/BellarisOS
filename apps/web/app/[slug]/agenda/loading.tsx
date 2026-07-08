const S = { borderRadius: 'var(--radius-row)' }
const C = { borderRadius: 'var(--radius-card-token)' }

export default function Loading() {
  return (
    <div style={{ padding: 'var(--content-pad-y) var(--content-pad-x)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header: título + botões */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="skeleton" style={{ height: 32, width: 180, ...S }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="skeleton" style={{ height: 36, width: 100, ...S }} />
          <div className="skeleton" style={{ height: 36, width: 130, ...S }} />
        </div>
      </div>
      {/* Navegação de meses */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="skeleton" style={{ height: 28, width: 36, ...S }} />
        <div className="skeleton" style={{ height: 24, width: 160, ...S }} />
        <div className="skeleton" style={{ height: 28, width: 36, ...S }} />
      </div>
      {/* Cabeçalho de dias */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {[...Array(7)].map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 24, ...S }} />
        ))}
      </div>
      {/* Grade do calendário */}
      {[...Array(5)].map((_, w) => (
        <div key={w} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {[...Array(7)].map((_, d) => (
            <div key={d} className="skeleton" style={{ height: 84, ...C }} />
          ))}
        </div>
      ))}
    </div>
  )
}
