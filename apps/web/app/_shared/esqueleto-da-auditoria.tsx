const S = { borderRadius: 'var(--radius-row)' }

/** O esqueleto da Auditoria, enquanto a lista chega (os dois portais). */
export function EsqueletoDaAuditoria() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="skeleton" style={{ height: 34, width: 180, ...S }} />
      <div className="skeleton" style={{ height: 34, width: 420, ...S }} />
      {[...Array(8)].map((_, i) => <div key={i} className="skeleton" style={{ height: 44, ...S }} />)}
    </div>
  )
}
