'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { mesclarParams } from '@/lib/query-params'
import type { CRMFunnel } from '@/lib/crm'

/**
 * Seletor de funil do quadro.
 *
 * O funil ativo vive na URL para sobreviver a refresh, deep-link e ao botão
 * voltar. A query é montada com `mesclarParams` porque em `/admin/crm` ela
 * também carrega `view=` e `c=` — montar do zero apagaria a aba e a conversa
 * aberta, que é o defeito que os seletores de período já tinham.
 */
export function CRMFunnelTabs({
  funnels, activeId,
}: {
  funnels:  Pick<CRMFunnel, 'id' | 'name'>[]
  activeId: string
}) {
  const pathname = usePathname()
  const params   = useSearchParams()

  // Com um funil só, o seletor é só ruído: o nome já está no título da tela.
  if (funnels.length <= 1) return null

  return (
    <div
      role="tablist"
      aria-label="Funis"
      style={{
        display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center',
      }}
    >
      {funnels.map(f => {
        const ativo = f.id === activeId
        return (
          <Link
            key={f.id}
            href={`${pathname}${mesclarParams(params, { funil: f.id })}`}
            role="tab"
            aria-selected={ativo}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-chip-token)',
              fontSize: 12.5,
              fontWeight: 800,
              letterSpacing: '-0.01em',
              textDecoration: 'none',
              transition: 'background 140ms, color 140ms, border-color 140ms',
              // Hierarquia por preenchimento: o funil aberto é o único cheio.
              background:  ativo ? 'var(--brand)'   : 'var(--surface)',
              color:       ativo ? '#fff'           : 'var(--text-muted)',
              border:      `1px solid ${ativo ? 'var(--brand)' : 'var(--border)'}`,
              boxShadow:   ativo ? 'var(--shadow-brand-btn)' : 'none',
            }}
          >
            {f.name}
          </Link>
        )
      })}
    </div>
  )
}
