import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { iniciaisDoNome } from '@estetica-os/utils'

/**
 * Os dois quadros de clientes do dashboard — "Clientes no mês/período" e
 * "Reativar clientes". Moravam só no dashboard da UNIDADE; desde a F7b (H3,
 * "a dona vê tudo, sempre") o da rede mostra os mesmos, e o desenho é UM.
 * Os números chegam prontos de `lib/metrics` — aqui só se desenha.
 */

// --- Avatar colorido determinístico ------------------------------
const PALETTE = [
  { bg: 'var(--success-soft)', color: 'var(--success)' },
  { bg: 'var(--cat-4-soft)', color: 'var(--cat-4)' },
  { bg: 'var(--info-soft)', color: 'var(--info)' },
  { bg: 'var(--cat-5-soft)', color: 'var(--cat-5)' },
  { bg: 'var(--hairline)', color: 'var(--success)' },
  { bg: 'var(--hairline)', color: 'var(--danger)' },
]
function avatarColor(name: string) {
  const h = [...name].reduce((a, c) => a + c.charCodeAt(0), 0)
  return PALETTE[h % PALETTE.length]!
}

export function AvatarDaCliente({ name, size = 32 }: { name: string; size?: number }) {
  const c = avatarColor(name)
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: c.bg, color: c.color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.32, fontWeight: 800,
    }}>
      {iniciaisDoNome(name)}
    </div>
  )
}

export interface EtapaDoCiclo { label: string; count: number; color: string }

/** O ciclo de clientes: novos, agendamentos, concluídos, cancelados/faltas. */
export function ClientesDoPeriodo({ titulo, subtitulo, etapas }: {
  titulo: string; subtitulo: string; etapas: EtapaDoCiclo[]
}) {
  const max = Math.max(1, ...etapas.map(f => f.count))
  return (
    <div className="card" data-clientes-do-periodo>
      <div style={{ marginBottom: 4 }}>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>
          {titulo}
        </h2>
      </div>
      <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginBottom: 18 }}>{subtitulo}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {etapas.map(f => {
          const barPct = Math.round((f.count / max) * 100)
          return (
            <div key={f.label} data-etapa={f.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', minWidth: 110, flexShrink: 0 }}>{f.label}</span>
              <div style={{ flex: 1, height: 22, borderRadius: 6, background: 'var(--bg-app)', overflow: 'hidden', position: 'relative' }}>
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${Math.max(barPct, f.count > 0 ? 12 : 0)}%`,
                  background: f.color, borderRadius: 6,
                }} />
              </div>
              {/* O número fora da barra: dentro, em branco, sumia nas barras claras. */}
              <span style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 800, color: 'var(--text)', minWidth: 28, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {f.count}
              </span>
            </div>
          )
        })}
      </div>
      {/* A49 da 8ª: o "Cancelados/faltas" daqui (2) e o dos Relatórios (6)
          diferiam sem dizer por quê — a regra de indicadores.md fica. */}
      <p data-recorte-dos-cancelados style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginTop: 12, lineHeight: 1.45 }}>
        Contados até agora, os cancelados e as faltas também. Relatórios → Agenda conta o período inteiro, com os que ainda vão acontecer.
      </p>
    </div>
  )
}

export interface ClienteSumida {
  id: string; name: string
  /** Dias desde a última visita concluída; nulo = nunca veio. */
  diasSemVir: number | null
  /** A unidade da linha (só na rede, com mais de uma). */
  unidade?: string | null
  /** A última visita é a importada, do sistema de antes (sobra da F35). */
  antesDoSistema?: boolean
}

/**
 * O vazio do quadro diz o que é (D16 da 8ª simulação, 2026-11-06): "Todos os
 * clientes retornaram 🎉" aparecia com 30 clientes que nunca tiveram visita (a
 * base importada no dia — cadastrada há menos de 90 dias, fora do quadro).
 * Os números vêm de lib/metrics (`comVisita`, `recentesSemVisita`).
 */
export function vazioDoReativar(comVisita: number, recentesSemVisita: number, deQuem?: string): string {
  // A10 da 13ª: o texto diz DE QUAIS clientes fala ("que frequentam a unidade",
  // "da clínica"), senão o "5 cadastradas" daqui brigava com o "4 novos" do lado.
  const quem = deQuem ? ` ${deQuem},` : ''
  const recentes = recentesSemVisita === 1
    ? `1 cliente${quem} cadastrada nos últimos 90 dias`
    : `${recentesSemVisita} clientes${quem} cadastradas nos últimos 90 dias`
  if (comVisita === 0) {
    return recentesSemVisita > 0
      ? `Nenhuma cliente tem visita registrada ainda (${recentes}). O quadro conta a partir da primeira visita concluída.`
      : 'Nenhuma cliente tem visita registrada ainda.'
  }
  return 'Ninguém sumiu: quem já veio voltou nos últimos 90 dias 🎉'
    + (recentesSemVisita > 0 ? ` ${recentes} ainda ${recentesSemVisita === 1 ? 'não tem' : 'não têm'} visita.` : '')
}

/**
 * De quais clientes os quadros falam (A10 da 13ª simulação): o "Clientes no
 * mês" e o "Reativar" contam universos diferentes conforme o recorte, e cada
 * um diz o seu. A unidade é a TAG da cliente (a que ela frequenta — H5/C6).
 */
export function deQuemSaoAsClientes(r: { daUnidade: boolean; dela: boolean }): string {
  if (r.dela) return 'que você atendeu'
  return r.daUnidade ? 'que frequentam a unidade' : 'da clínica'
}

/** As clientes sem visita há mais de 90 dias (o total e as há mais tempo sem vir). */
export function ReativarClientes({ clientes, total, hrefAgendar, hrefVerTodas, comVisita = 1, recentesSemVisita = 0, deQuem }: {
  clientes: ClienteSumida[]; total: number; hrefAgendar: string; hrefVerTodas: string
  /** As do recorte com alguma visita concluída, e as novas sem nenhuma — o texto do vazio (D16). */
  comVisita?: number; recentesSemVisita?: number
  /** De quais clientes o quadro fala (`deQuemSaoAsClientes`, A10). */
  deQuem?: string
}) {
  return (
    <div className="card" data-reativar-clientes style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 4 }}>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
          Reativar clientes
          <span style={{ color: 'var(--brand)', fontWeight: 700 }}>✦</span>
        </h2>
      </div>
      {/* A35 da 10ª: o quadro não dizia que quem tem horário marcado sai da conta. */}
      <p data-recorte-do-reativar style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginBottom: 18 }}>
        {deQuem ? `Clientes ${deQuem} sem visita` : 'Sem visita'} há mais de 90 dias — quem tem horário marcado não entra
      </p>

      {clientes.length === 0 ? (
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)', textAlign: 'center', paddingTop: 8, flex: 1 }}>
          {vazioDoReativar(comVisita, recentesSemVisita, deQuem)}
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
            {clientes.map(c => (
              <div key={c.id} data-cliente style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <AvatarDaCliente name={c.name} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.name}
                  </p>
                  <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginTop: 1 }}>
                    {c.diasSemVir !== null ? `Última visita há ${c.diasSemVir} dias` : 'Nunca veio'}
                    {c.diasSemVir !== null && c.antesDoSistema && <> · <span data-antes-do-sistema>antes do sistema</span></>}
                    {c.unidade ? ` · ${c.unidade}` : ''}
                  </p>
                </div>
                <Link href={hrefAgendar} style={{
                  width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--bg-app)', border: '1px solid var(--border)', color: 'var(--text-muted)', textDecoration: 'none',
                }} title="Agendar">
                  <ArrowUpRight size={13} />
                </Link>
              </div>
            ))}
          </div>

          {total > clientes.length && (
            <Link href={hrefVerTodas} style={{
              display: 'block', textAlign: 'center', marginTop: 16,
              padding: '8px', borderRadius: 10, border: '1px solid var(--border)',
              fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', textDecoration: 'none',
            }}>
              {/* A35 da 10ª: "Ver 5 clientes inativos" parecia o total (são as além das que o quadro lista). */}
              Ver mais {total - clientes.length} ({total} no total)
            </Link>
          )}
        </>
      )}
    </div>
  )
}
