import type { TenantContext } from '@estetica-os/types'
import { podeReceber } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { getFechamentoDoDia, getAvisosDoFechamento } from '@/lib/metrics'
import { getAtendimentosAReceber } from '@/lib/metrics/a-receber'
import { diaDoFechamento, janelaDoDia } from '@/lib/financeiro/fechamento'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { FechamentoDoDiaTela, type FechamentoFeito } from '@/components/shared/fechamento-do-dia-tela'

/**
 * O fechamento do dia, o corpo dos dois portais (2026-10-21, decisão do
 * Heitor): sem abertura de caixa. O resumo do dia por forma de pagamento, o
 * dinheiro em espécie que deve estar na gaveta, a conferência e quem fechou.
 * A página da unidade passa a dela; a da rede, a escolhida (`?unidade=`).
 */
export async function FechamentoDoDia({ ctx, unidades, unidadeId, diaPedido, basePath }: {
  ctx:       TenantContext
  unidades:  { id: string; name: string }[]
  unidadeId: string
  diaPedido?: string
  basePath:  string
}) {
  const dia = diaDoFechamento(diaPedido)
  const janela = janelaDoDia(dia)!
  const [resumo, aReceber, feitos] = await Promise.all([
    getFechamentoDoDia({ tenantId: ctx.tenantId!, branchId: unidadeId, from: janela.from, to: janela.to }),
    // Os concluídos a receber da unidade, de qualquer dia (D5, 2026-10-27):
    // o que ficou sem pagamento ontem continua aqui até alguém receber.
    getAtendimentosAReceber({ tenantId: ctx.tenantId!, unidadeId }),
    ler(createAdminClient().from('fechamentos_do_dia')
      .select('id, esperado_dinheiro, contado_dinheiro, diferenca, observacao, fechado_por_nome, fechado_em')
      .eq('tenant_id', ctx.tenantId!).eq('branch_id', unidadeId).eq('dia', dia)
      .order('fechado_em', { ascending: false }).limit(20), 'carregar os fechamentos do dia'),
  ])

  // Os avisos (J-49): o movimento depois do ÚLTIMO fechamento e as taxas do dia.
  const ultimo = ((feitos ?? []) as Record<string, unknown>[])[0]
  const avisos = await getAvisosDoFechamento({
    tenantId: ctx.tenantId!, branchId: unidadeId, from: janela.from, to: janela.to,
    desde: ultimo ? String(ultimo.fechado_em) : null,
  })

  return (
    <>
      <RealtimeRefresher tables={['financial_transactions', 'appointments']} />
      <FechamentoDoDiaTela
        basePath={basePath}
        dia={dia}
        unidades={unidades}
        unidadeId={unidadeId}
        resumo={resumo}
        feitos={((feitos ?? []) as Record<string, unknown>[]).map(f => ({
          id:        String(f.id),
          esperado:  Number(f.esperado_dinheiro),
          contado:   Number(f.contado_dinheiro),
          diferenca: Number(f.diferenca),
          observacao: (f.observacao as string | null) ?? null,
          quem:      (f.fechado_por_nome as string | null) ?? null,
          quando:    String(f.fechado_em),
        }) satisfies FechamentoFeito)}
        podeFechar={podeReceber(ctx)}
        aReceber={aReceber}
        avisos={avisos}
        // Receber o atendimento é do módulo de recebimentos (confirmPayment).
        podeReceberAtendimento={ctx.permissions.cashier === 'MANAGE'}
      />
    </>
  )
}
