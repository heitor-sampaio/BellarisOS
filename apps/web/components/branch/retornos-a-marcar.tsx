import Link from 'next/link'
import { CalendarClock, ChevronRight } from 'lucide-react'
import type { RetornoAMarcar } from '@/lib/agenda/retornos'

/**
 * Os retornos a marcar (D-12), no dashboard da unidade: a profissional disse
 * "retorno em N dias" ao finalizar, e a recepção vê os que vencem na semana e
 * os que já venceram sem ninguém marcar. Cada linha leva à ficha da cliente,
 * onde se agenda. Some quando a cliente tem um agendamento depois do
 * atendimento. Só no portal da unidade (o link é dela).
 */
export function RetornosAMarcar({ slug, total, itens, hoje }: {
  slug: string; total: number; itens: RetornoAMarcar[]
  /** AAAA-MM-DD de hoje em Brasília: o que diz "vencido", "hoje" ou o dia. */
  hoje: string
}) {
  if (!total) return null
  const quando = (dia: string) => {
    if (dia === hoje) return 'hoje'
    const [, m, d] = dia.split('-')
    return dia < hoje ? `venceu ${d}/${m}` : `${d}/${m}`
  }
  return (
    <section data-retornos role="status" style={{
      background: 'var(--info-soft)', borderRadius: 'var(--radius-card-token)', padding: '14px 18px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-extrabold)', color: 'var(--info)' }}>
        <CalendarClock size={15} aria-hidden style={{ flexShrink: 0 }} />
        {total} {total === 1 ? 'Retorno a marcar' : 'Retornos a marcar'}
      </p>
      <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
        A profissional pediu o retorno ao finalizar o atendimento. Vence nesta semana, ou já venceu, e a cliente ainda não tem horário marcado.
      </p>
      <ul style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {itens.map(r => (
          <li key={r.id}>
            <Link href={`/${slug}/clients/${r.clientId}`} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 'var(--radius-field-token)',
              background: 'var(--surface)', textDecoration: 'none', color: 'var(--text)', fontSize: 'var(--text-sm-sz)',
            }}>
              <strong style={{ flexShrink: 0, color: r.retornoPara < hoje ? 'var(--warning)' : 'var(--text)' }}>{quando(r.retornoPara)}</strong>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.cliente}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                · {r.procedimento} · {r.profissional}
              </span>
              <ChevronRight size={14} aria-hidden style={{ marginLeft: 'auto', color: 'var(--text-faint)', flexShrink: 0 }} />
            </Link>
          </li>
        ))}
      </ul>
      {total > itens.length && (
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>e mais {total - itens.length}.</p>
      )}
    </section>
  )
}
