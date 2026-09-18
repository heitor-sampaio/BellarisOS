import { CashRegisterWidget } from '@/components/branch/cash-register-widget'
import type { CaixaDaUnidade } from '@/lib/cash-register'

/**
 * Os caixas das unidades, no portal da rede.
 *
 * Uma linha por unidade, com o mesmo widget que a filial usa — a unidade da
 * ação é a da própria linha, não um seletor à parte. O admin vê de relance
 * quais caixas ficaram abertos no fim do dia, que é a pergunta que ele faz.
 */
export function CaixasDaRede({
  caixas, branches, operaCaixa,
}: {
  caixas:     CaixaDaUnidade[]
  branches:   { id: string; name: string; slug: string }[]
  operaCaixa: boolean
}) {
  if (!operaCaixa || caixas.length === 0) return null

  const abertos = caixas.filter(c => c.register).length

  return (
    <section style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <h2 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>
          Caixa das unidades
        </h2>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {abertos === 0
            ? 'nenhum aberto'
            : `${abertos} de ${caixas.length} aberto${abertos > 1 ? 's' : ''}`}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {caixas.map(c => {
          const branch = branches.find(b => b.id === c.branchId)
          return (
            <CashRegisterWidget
              key={c.branchId}
              branchId={c.branchId}
              branchName={branch?.name ?? 'Unidade'}
              slug={branch?.slug ?? ''}
              register={c.register}
              totalIncome={c.income}
              totalExpense={c.expense}
            />
          )
        })}
      </div>
    </section>
  )
}
