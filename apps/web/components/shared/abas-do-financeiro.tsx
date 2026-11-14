import Link from 'next/link'
import { ABAS_DO_FINANCEIRO, linkDaAba, type AbaDoFinanceiro } from '@/lib/financeiro/abas'

/**
 * A barra das abas do Financeiro (FI1): Resumo · A receber · A pagar ·
 * Movimentações · Comissões. Links (a aba mora na URL), marcados como abas
 * (tablist/tab) — o mesmo desenho das abas da ficha da cliente. O link leva o
 * período e a unidade da tela; Comissões é a página dela, e some quando o
 * plano da rede não tem comissões.
 */
export function AbasDoFinanceiro({ base, atual, manter = {}, comComissoes = true }: {
  /** `/admin/financeiro` ou `/<slug>/financeiro`. */
  base: string
  atual: AbaDoFinanceiro
  /** O período e a unidade da tela (`period`, `from`, `to`, `unidade`). */
  manter?: Record<string, string | undefined>
  /** O plano da rede tem comissões (`temRecurso(ctx, 'comissoes')`). */
  comComissoes?: boolean
}) {
  const abas = ABAS_DO_FINANCEIRO.filter(a => a.chave !== 'comissoes' || comComissoes)
  return (
    <div className="tabs-bar" role="tablist" aria-label="Abas do Financeiro" data-abas-do-financeiro style={{ gap: 0 }}>
      {abas.map(a => {
        const escolhida = a.chave === atual
        return (
          <Link
            key={a.chave}
            href={linkDaAba(base, a.chave, manter)}
            role="tab"
            aria-selected={escolhida}
            scroll={false}
            style={{
              padding: '10px 18px',
              fontSize: 'var(--text-base-sz)', fontWeight: 700, whiteSpace: 'nowrap',
              textDecoration: 'none',
              color: escolhida ? 'var(--brand)' : 'var(--text-muted)',
              borderBottom: escolhida ? '2px solid var(--brand)' : '2px solid transparent',
              marginBottom: -1, transition: 'color 0.1s',
            }}
          >
            {a.rotulo}
          </Link>
        )
      })}
    </div>
  )
}
