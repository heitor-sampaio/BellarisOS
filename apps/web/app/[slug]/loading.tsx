export default function Loading() {
  return (
    <div style={{ padding: 'var(--content-pad-y) var(--content-pad-x)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="skeleton" style={{ height: 40, width: 200 }} />
      <div className="skeleton" style={{ height: 320 }} />
    </div>
  )
}
