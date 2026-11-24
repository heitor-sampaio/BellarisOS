import Link from 'next/link'
import { ChevronRight, MapPin } from 'lucide-react'
import { partsInTZ, startOfDayTZ } from '@/lib/datetime'
import { Dica } from '@/components/shared/dica'
import { horaNaUnidadeDele } from '@/lib/unidades/hora-da-unidade'
import { fusoValido } from '@/lib/unidades/fuso'

interface EventoDeFora {
  id: string; start: string; status?: string; clientName: string; procedureName: string; unidade?: string | null
  /** D3 da 26ª: o fuso da unidade dele — o dia e a hora saem no relógio de lá. */
  fusoDaUnidade?: string | null
  /** O endereço do atendimento (D10 da 9ª): o portal da unidade dele para quem é da rede. */
  href?: string
}

/** O que ainda está por fazer (D10 da 9ª: o concluído aparecia como pendente). */
const EM_ABERTO = ['SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS']

const dd = (n: number) => String(n).padStart(2, '0')

/**
 * Os agendamentos DELA nas outras unidades em que atende (decisão 2 do Heitor
 * sobre a 8ª simulação: o "atende" vira um checklist das unidades). Na agenda
 * inteira da unidade dela eles não cabem na grade (é a grade desta unidade);
 * aqui ficam à vista, de hoje em diante, e cada um abre a tela do atendimento
 * por este portal. Na "Minha agenda" eles entram na grade, com a unidade.
 */
export function MeusAtendimentosEmOutrasUnidades({ slug, eventos, fuso }: {
  slug: string; eventos: EventoDeFora[]
  /** O fuso deste portal (F62): o "de hoje em diante" e o relógio que não precisa ser dito. */
  fuso?: string
}) {
  const hoje = startOfDayTZ(new Date(), fuso).getTime()
  const proximos = eventos.filter(e => new Date(e.start).getTime() >= hoje && (!e.status || EM_ABERTO.includes(e.status))).slice(0, 8)
  if (!proximos.length) return null
  return (
    <section data-meus-de-outras-unidades className="card" style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span>Seus atendimentos em outras unidades</span>
        {/* O "o que esta lista mostra" mora na dica (2026-11-16). */}
        <Dica rotulo="Sobre os atendimentos em outras unidades">
          Você atende também nestas unidades: aqui ficam só os seus atendimentos de lá.
        </Dica>
      </p>
      <ul style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {proximos.map(e => {
          // D3 da 26ª (princípio 3): no relógio da unidade dele, e dito quando não é o deste portal.
          const p = partsInTZ(new Date(e.start), fusoValido(e.fusoDaUnidade ?? fuso))
          const { relogio } = horaNaUnidadeDele(e.start, e.fusoDaUnidade ?? fuso, fuso)
          return (
            <li key={e.id}>
              <Link href={e.href ?? `/${slug}/agenda/${e.id}`} data-outra-unidade style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                fontSize: 'var(--text-xs-sz)', color: 'var(--text)', textDecoration: 'none',
              }}>
                <b>{dd(p.day)}/{dd(p.month)} {dd(p.hour)}:{dd(p.minute)}</b>
                {relogio && <span data-relogio-do-cartao style={{ color: 'var(--text-muted)', fontWeight: 600 }}>({relogio})</span>}
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
