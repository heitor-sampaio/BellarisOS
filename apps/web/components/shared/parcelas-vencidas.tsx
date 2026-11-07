import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { formatBRL } from '@estetica-os/utils'
import { parcelasVencidas, type AReceberVencido } from '@/lib/metrics/vencidas'

/**
 * O aviso do dashboard (D13 da 9ª simulação; princípio 3): "1 parcela vencida
 * da cliente: R$ 1.294,00 (desde 05/11) — Ver no Financeiro". A conta é a do
 * cartão "A receber da cliente" (`getAReceberVencido`). Sem vencida, nada.
 */
export function ParcelasVencidas({ vencidas, href }: { vencidas: AReceberVencido; href: string }) {
  if (vencidas.quantidade <= 0) return null
  const desde = vencidas.maisAntiga
    ? new Date(vencidas.maisAntiga).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })
    : null
  return (
    <div data-parcelas-vencidas role="note" style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '12px 16px',
      borderRadius: 'var(--radius-card-token)', background: 'var(--danger-soft)', border: '1px solid var(--danger-border)',
    }}>
      <AlertTriangle size={16} style={{ color: 'var(--danger)', flexShrink: 0 }} aria-hidden />
      <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', flex: 1, minWidth: 200 }}>
        <strong>{parcelasVencidas(vencidas.quantidade)} da cliente: {formatBRL(vencidas.valor)}</strong>
        {desde ? ` (a mais antiga venceu em ${desde})` : ''}. O vencimento já passou e ainda não foi recebido.
      </p>
      <Link href={href} style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--brand)' }}>Ver no Financeiro</Link>
    </div>
  )
}
