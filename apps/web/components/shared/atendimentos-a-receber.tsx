'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HandCoins } from 'lucide-react'
import { formatBRL } from '@estetica-os/utils'
import { rotaAtendimento } from '@/lib/rotas'
import type { ListaAReceber } from '@/lib/metrics/a-receber'

/** A tela que recebe o atendimento, já com a janela do pagamento aberta. */
export function rotaDoRecebimento(pathname: string, slug: string, appointmentId: string): string {
  return `${rotaAtendimento(pathname, slug, appointmentId)}?receber=1`
}

const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })

/**
 * "Concluídos a receber" (D5 da simulação de 2026-10-27): o atendimento
 * concluído e ainda não pago, com o caminho para recebê-lo. A lista e o total
 * vêm do banco (`getAtendimentosAReceber`); aqui só se desenha.
 *
 * No Fechamento do dia mostra a cliente; na ficha, que já é dela, não.
 */
export function AtendimentosAReceber({ lista, titulo = 'Concluídos a receber', mostrarCliente = true, podeReceber }: {
  lista:           ListaAReceber
  titulo?:         string
  mostrarCliente?: boolean
  /** Quem recebe (cashier) vê o botão; os outros, só a lista. */
  podeReceber:     boolean
}) {
  const pathname = usePathname()
  if (lista.itens.length === 0) return null
  return (
    <section data-a-receber className="card" style={{ padding: 0, overflow: 'hidden' }} aria-label={titulo}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 30, height: 30, borderRadius: 'var(--radius-field-token)', background: 'var(--warning-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <HandCoins size={15} style={{ color: 'var(--warning)' }} aria-hidden />
        </div>
        <h3 style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)', flex: 1 }}>{titulo}</h3>
        <span data-total-a-receber style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 800, color: 'var(--warning)' }}>
          {lista.total.n} · {formatBRL(lista.total.valor)}
        </span>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {lista.itens.map((a, i) => (
          <li key={a.appointmentId} data-agendamento={a.appointmentId} style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 20px',
            borderTop: i === 0 ? 'none' : '1px solid var(--hairline)',
          }}>
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {mostrarCliente ? (a.clientName ?? 'Cliente') : (a.procedureName ?? 'Atendimento')}
              </p>
              <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 2 }}>
                {mostrarCliente && <>{a.procedureName ?? 'Atendimento'} · </>}
                {dia(a.scheduledAt)}{a.professionalName ? ` · ${a.professionalName}` : ''}
              </p>
            </div>
            <span style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap' }}>{formatBRL(a.price)}</span>
            {podeReceber && (
              <Link href={rotaDoRecebimento(pathname, a.branchSlug, a.appointmentId)} className="btn-primary"
                style={{ textDecoration: 'none' }}>
                Receber
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
