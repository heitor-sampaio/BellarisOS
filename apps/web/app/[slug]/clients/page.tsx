import { Users } from 'lucide-react'
import { getTenantContext, assertPermission } from '@/lib/auth'

export default async function ClientsPage() {
  // Toda page.tsx confere por si (CLAUDE.md §6) — e é esta a trava que diz
  // "sem acesso" a quem não tem Clientes (D11 da 7ª: o layout só deixa passar).
  assertPermission(await getTenantContext(), 'clients', 'VIEW')
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: 400, gap: 12,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 'var(--radius-squircle)',
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
