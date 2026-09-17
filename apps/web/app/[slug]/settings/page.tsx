import { getTenantContext, assertPermission } from '@/lib/auth'

/**
 * Configurações da unidade.
 *
 * Ainda é um lugar reservado — o que existe hoje mora em Configurações da rede.
 * A checagem está aqui porque o layout protege a navegação, não a URL: sem ela,
 * qualquer pessoa da unidade abria a tela digitando o endereço.
 */
export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

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
