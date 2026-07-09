export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-app)' }}>
      <div style={{ width: '100%', maxWidth: 420, padding: '0 16px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <span style={{
            fontSize: 24,
            fontWeight: 'var(--weight-extrabold)',
            color: 'var(--brand)',
            letterSpacing: 'var(--tracking-tight)',
          }}>
            BellarisOS ✦
          </span>
        </div>
        {children}
      </div>
    </div>
  )
}
