'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HandCoins } from 'lucide-react'
import { formatBRL } from '@estetica-os/utils'
import { rotaDaComanda } from '@/lib/rotas'

/**
 * O que a cliente tem para pagar no PDV, na ficha (CX3, a revisão do Heitor
 * de 2026-11-13: "Os 'Concluídos a receber' viram as comandas abertas do PDV
 * (sai a lista à parte na agenda, no Fechamento e na ficha)"). Não é lista: é
 * o resumo — quantos atendimentos concluídos ainda a receber, e o total
 * (contados no banco, `atendimentos_a_receber`) — e o caminho para a comanda
 * no PDV, a quem recebe (`podeReceber`: o PDV ou o Financeiro em Gerenciar).
 * Quem não recebe lê com quem fica.
 */
export function ComandasAbertasDaFicha({ total, receber, podeReceber }: {
  total:       { n: number; valor: number }
  /** A comanda a abrir no PDV (a mais antiga, numa unidade ao alcance). */
  receber:     { comandaId: string | null; unidadeId: string; slug: string } | null
  podeReceber: boolean
}) {
  const pathname = usePathname()
  if (total.n === 0) return null
  return (
    <section data-comandas-abertas className="card" aria-label="Comandas abertas no PDV" style={{
      padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    }}>
      <div style={{ width: 30, height: 30, borderRadius: 'var(--radius-field-token)', background: 'var(--warning-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <HandCoins size={15} style={{ color: 'var(--warning)' }} aria-hidden />
      </div>
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)' }}>
          {total.n === 1 ? '1 comanda aberta no PDV' : `${total.n} comandas abertas no PDV`} · <span style={{ color: 'var(--warning)' }}>{formatBRL(total.valor)}</span>
        </p>
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 2 }}>
          {total.n === 1 ? 'Atendimento concluído e ainda a receber.' : 'Atendimentos concluídos e ainda a receber.'}
          {!podeReceber && ' Recebe-se no PDV, com quem tem o PDV ou o Financeiro em Gerenciar.'}
        </p>
      </div>
      {podeReceber && receber && (
        <Link href={rotaDaComanda(pathname, receber.slug, receber.unidadeId, receber.comandaId)} className="btn-primary"
          style={{ textDecoration: 'none' }}>
          Receber no PDV
        </Link>
      )}
    </section>
  )
}
