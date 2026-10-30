import Link from 'next/link'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import { partsInTZ } from '@/lib/datetime'
import type { AbertoDeAntes } from '@/lib/agenda/abertos-de-antes'

/**
 * O aviso dos atendimentos de dias anteriores ainda abertos (J-32), na agenda
 * e no dashboard da unidade. Cada linha leva à tela do atendimento, onde se
 * conclui, cobra ou marca o que houve. Só no portal da unidade (o link é dela).
 */
export function AbertosDeAntes({ slug, total, itens }: { slug: string; total: number; itens: AbertoDeAntes[] }) {
  if (!total) return null
  const quando = (iso: string) => {
    const p = partsInTZ(new Date(iso))
    const dd = (n: number) => String(n).padStart(2, '0')
    return `${dd(p.day)}/${dd(p.month)} ${dd(p.hour)}:${dd(p.minute)}`
  }
  return (
    <section data-abertos-de-antes role="status" style={{
      background: 'var(--warning-soft)', borderRadius: 'var(--radius-card-token)', padding: '14px 18px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-extrabold)', color: 'var(--warning)' }}>
        <AlertTriangle size={15} aria-hidden style={{ flexShrink: 0 }} />
        {total} {total === 1 ? 'atendimento de dias anteriores ainda aberto' : 'atendimentos de dias anteriores ainda abertos'}
      </p>
      <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--warning)' }}>
        A cliente chegou (ou o atendimento começou) e nada foi fechado. Abra para concluir ou registrar o que houve.
      </p>
      <ul style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {itens.map(a => (
          <li key={a.id}>
            <Link href={`/${slug}/agenda/${a.id}`} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 'var(--radius-field-token)',
              background: 'var(--surface)', textDecoration: 'none', color: 'var(--text)', fontSize: 'var(--text-sm-sz)',
            }}>
              <strong style={{ flexShrink: 0 }}>{quando(a.scheduledAt)}</strong>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.clientName}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', whiteSpace: 'nowrap' }}>
                · {a.status === 'ARRIVED' ? 'Chegou' : 'Em atendimento'} · {a.professionalName}
              </span>
              <ChevronRight size={14} aria-hidden style={{ marginLeft: 'auto', color: 'var(--text-faint)', flexShrink: 0 }} />
            </Link>
          </li>
        ))}
      </ul>
      {total > itens.length && (
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--warning)' }}>e mais {total - itens.length}.</p>
      )}
    </section>
  )
}
