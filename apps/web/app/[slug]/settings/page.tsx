export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return (
    <div>
      <h1 style={{
        fontSize: 'var(--text-title)', fontWeight: 'var(--weight-extrabold)',
        letterSpacing: 'var(--tracking-tight)', color: 'var(--text)',
      }}>
        Configurações
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
        Configurações da filial <strong>{slug}</strong>.
      </p>
    </div>
  )
}
