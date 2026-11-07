import { Clock, AlertTriangle } from 'lucide-react'

const curto = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })

/**
 * A situação do lançamento em aberto nas listas do Financeiro (D13 da 9ª
 * simulação; princípio 3): "Vencida em 05/11" quando o vencimento ficou antes
 * de hoje — `vencida` vem do servidor (`situacaoDoVencimento`), para o
 * navegador não decidir o dia por conta própria —, senão "Pendente".
 */
export function SituacaoDoEmAberto({ vencida, vencimento }: { vencida?: boolean; vencimento: string | null }) {
  const chip = {
    display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
    fontSize: 'var(--text-2xs)', fontWeight: 700, padding: '3px 9px', borderRadius: 99,
  } as const
  if (vencida && vencimento) {
    return (
      <span data-vencida style={{ ...chip, background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid var(--danger-border)' }}>
        <AlertTriangle size={10} aria-hidden /> Vencida em {curto(vencimento)}
      </span>
    )
  }
  return (
    <span style={{ ...chip, background: 'var(--warning-soft)', color: 'var(--warning)', border: '1px solid var(--warning-border)' }}>
      <Clock size={10} aria-hidden /> Pendente
    </span>
  )
}
