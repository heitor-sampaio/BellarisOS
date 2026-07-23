import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'

export interface DashboardShortcut {
  label: string
  href:  string
}

/**
 * Estado do dashboard quando o cargo não tem nenhum widget para exibir.
 * Mostra boas-vindas + atalhos para os módulos que o usuário pode acessar.
 */
export function DashboardEmptyState({
  userName,
  shortcuts,
}: {
  userName:  string
  shortcuts: DashboardShortcut[]
}) {
  const first = userName.split(' ')[0] || userName

  return (
    <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div style={{ fontSize: 28, color: 'var(--brand)', marginBottom: 8 }}>✦</div>
      <h1 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
        Bem-vindo(a){first ? `, ${first}` : ''}
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 6, marginBottom: 24 }}>
        {shortcuts.length > 0
          ? 'Aqui estão os seus atalhos:'
          : 'Seu cargo ainda não tem acesso a nenhuma área. Fale com o administrador da rede.'}
      </p>

      {shortcuts.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
          {shortcuts.map(s => (
            <Link
              key={s.href}
              href={s.href}
              className="btn-secondary"
              style={{ gap: 6 }}
            >
              {s.label}
              <ArrowUpRight size={14} />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
