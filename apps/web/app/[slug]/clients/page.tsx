import { Users } from 'lucide-react'

export default function ClientsPage() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: 400, gap: 12,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16,
        background: 'var(--brand-soft)', border: '1.5px solid var(--brand-soft-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Users size={24} style={{ color: 'var(--brand)' }} />
      </div>
      <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text-muted)' }}>
        Selecione um cliente para ver o perfil
      </p>
    </div>
  )
}
