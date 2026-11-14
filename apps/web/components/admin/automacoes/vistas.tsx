import Link from 'next/link'

/**
 * As duas vistas das Automações, lado a lado (CF2, 2026-11-14): a lista dos
 * fluxos e "O que já aconteceu" — a corrente de fatos que os dispara, que
 * morava em Configurações → Eventos. Escolha exclusiva, como um segmentado; a
 * vista mora no endereço, e cada chip é um link.
 */
export function VistasDasAutomacoes({ ativa }: { ativa: 'automacoes' | 'eventos' }) {
  const vistas = [
    { key: 'automacoes', label: 'Automações',         href: '/admin/automacoes' },
    { key: 'eventos',    label: 'O que já aconteceu', href: '/admin/automacoes/eventos' },
  ] as const
  return (
    <nav aria-label="Vistas das automações" data-vistas-das-automacoes className="grupo-de-abas-chips" style={{ marginBottom: 16 }}>
      {vistas.map(v => (
        <Link
          key={v.key}
          href={v.href}
          aria-current={v.key === ativa ? 'page' : undefined}
          className={`seg-chip${v.key === ativa ? ' is-ativo' : ''}`}
        >
          {v.label}
        </Link>
      ))}
    </nav>
  )
}
