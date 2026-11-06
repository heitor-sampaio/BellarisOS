import Link from 'next/link'
import { ChevronRight, MapPin } from 'lucide-react'
import { partsInTZ, startOfDayTZ } from '@/lib/datetime'

interface EventoDeFora {
  id: string; start: string; clientName: string; procedureName: string; unidade?: string | null
}

const dd = (n: number) => String(n).padStart(2, '0')

/**
 * Os agendamentos DELA nas outras unidades em que atende (decisão 2 do Heitor
 * sobre a 8ª simulação: o "atende" vira um checklist das unidades). Na agenda
 * inteira da unidade dela eles não cabem na grade (é a grade desta unidade);
 * aqui ficam à vista, de hoje em diante, e cada um abre a tela do atendimento
 * por este portal. Na "Minha agenda" eles entram na grade, com a unidade.
 */
export function MeusAtendimentosEmOutrasUnidades({ slug, eventos }: { slug: string; eventos: EventoDeFora[] }) {
  const hoje = startOfDayTZ(new Date()).getTime()
  const proximos = eventos.filter(e => new Date(e.start).getTime() >= hoje).slice(0, 8)
  if (!proximos.length) return null
  return (
    <section data-meus-de-outras-unidades className="card" style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)' }}>
        Seus atendimentos em outras unidades
      </p>
      <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
        Você atende também nestas unidades: aqui ficam só os seus atendimentos de lá.
      </p>
      <ul style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {proximos.map(e => {
          const p = partsInTZ(new Date(e.start))
          return (
            <li key={e.id}>
              <Link href={`/${slug}/agenda/${e.id}`} data-outra-unidade style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                fontSize: 'var(--text-xs-sz)', color: 'var(--text)', textDecoration: 'none',
              }}>
                <b>{dd(p.day)}/{dd(p.month)} {dd(p.hour)}:{dd(p.minute)}</b>
                <span>{e.clientName} · {e.procedureName}</span>
                <span className="chip chip-info" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <MapPin size={12} /> {e.unidade}
                </span>
                <ChevronRight size={14} style={{ marginLeft: 'auto', color: 'var(--text-faint)' }} />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
