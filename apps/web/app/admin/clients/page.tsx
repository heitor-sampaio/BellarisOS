import { Users } from 'lucide-react'

export default function AdminClientsIndexPage() {
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
      <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)', textAlign: 'center', maxWidth: 280 }}>
        Use a barra lateral para filtrar por unidade, buscar por nome ou segmentar por tag.
      </p>
    </div>
  )
}
