export default function Loading() {
  return (
    <div style={{ padding: 'var(--content-pad-y) var(--content-pad-x)', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="skeleton" style={{ height: 28, width: 200, borderRadius: 'var(--radius-row)' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="skeleton" style={{ height: 160 }} />
          <div className="skeleton" style={{ height: 100 }} />
          <div className="skeleton" style={{ height: 60, borderRadius: 'var(--radius-row)' }} />
        </div>
        <div className="skeleton" style={{ height: 320 }} />
      </div>
    </div>
  )
}
