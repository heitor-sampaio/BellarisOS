import { CashRegisterWidget } from '@/components/branch/cash-register-widget'
import type { CaixaDaUnidade } from '@/lib/cash-register'

/**
 * Os caixas das unidades, no portal da rede.
 *
 * Um card por unidade, lado a lado, logo abaixo dos indicadores — eram quatro
 * barras largas empilhadas acima de tudo, empurrando os números da rede para
 * fora da tela. A unidade da ação é a do próprio card, não um seletor à parte.
 *
 * Por que isto existe: todo recebimento carimba `cash_register_id` com o caixa
 * ABERTO da unidade (`lib/cash-register.ts`). Quem recebe pelo `/admin` recebe
 * em nome de uma unidade, e sem caixa aberto lá o valor entra e fica fora de
 * qualquer fechamento. Daí a rede precisar abrir e fechar sem entrar no portal
 * da filial — e ver de relance o que ficou aberto no fim do dia.
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
    <section style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <h2 className="overline">Caixa das unidades</h2>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {abertos === 0
            ? 'nenhum aberto'
            : `${abertos} de ${caixas.length} aberto${abertos > 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Mesma grade dos KPIs de cima: quatro cabem na linha, e no celular
          quebram sozinhos em vez de espremer o valor. */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: 14,
      }}>
        {caixas.map(c => {
          const branch = branches.find(b => b.id === c.branchId)
          return (
            <CashRegisterWidget
              key={c.branchId}
              variante="card"
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
