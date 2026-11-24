import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { textoDoPainelSemAcesso } from '@/lib/cargos/sem-acesso'

export interface DashboardShortcut {
  label: string
  href:  string
}

/**
 * Estado do dashboard quando o cargo não tem nenhum widget para exibir.
 * Mostra boas-vindas + atalhos para os módulos que o usuário pode acessar.
 * Sem atalho nenhum, diz por quê (item 20 de 18/11): sem cargo, o cargo que
 * não abre nada, ou o que abre só o que não tem atalho aqui.
 */
export function DashboardEmptyState({
  userName,
  shortcuts,
  semCargo = false,
  semAcesso = true,
}: {
  userName:  string
  shortcuts: DashboardShortcut[]
  /** O cargo é o "Não definido". */
  semCargo?: boolean
  /** O cargo não abre módulo nenhum. */
  semAcesso?: boolean
}) {
  const first = userName.split(' ')[0] || userName

  return (
    <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div style={{ fontSize: 'var(--text-kpi)', color: 'var(--brand)', marginBottom: 8 }}>✦</div>
      <h1 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
        Bem-vindo(a){first ? `, ${first}` : ''}
      </h1>
      <p data-painel-sem-acesso={shortcuts.length > 0 ? undefined : ''} style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 6, marginBottom: 24 }}>
        {shortcuts.length > 0
          ? 'Aqui estão os seus atalhos:'
          : textoDoPainelSemAcesso({ semCargo, semAcesso: semCargo || semAcesso })}
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
