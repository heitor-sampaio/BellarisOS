import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { iniciaisDoNome } from '@estetica-os/utils'
import { Dica } from '@/components/shared/dica'
import { mesDeClienteDesde } from '@/lib/clientes/cliente-desde'
import { ListaDoReativar } from '@/components/shared/lista-do-reativar'

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

export interface EtapaDoCiclo {
  label: string; count: number; color: string
  /** A12 da 16ª: o que a conta "até agora" não diz — "2 ainda hoje". */
  nota?: string
}

/** O ciclo de clientes: novos, agendamentos, concluídos, cancelados/faltas. */
export function ClientesDoPeriodo({ titulo, subtitulo, etapas }: {
  titulo: string; subtitulo: string; etapas: EtapaDoCiclo[]
}) {
  const max = Math.max(1, ...etapas.map(f => f.count))
  return (
    <div className="card" data-clientes-do-periodo>
      {/* O recorte do quadro (quais clientes, até quando) mora na dica do título —
          era o subtítulo e a nota do rodapé (2026-11-16: a explicação mora na dica). */}
      <div style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 6 }}>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>
          {titulo}
        </h2>
        <Dica rotulo="O que o quadro conta">
          <span data-recorte-do-quadro style={{ display: 'block' }}>{subtitulo}.</span>
          {/* A49 da 8ª: o "Cancelados/faltas" daqui (2) e o dos Relatórios (6)
              diferiam sem dizer por quê — a regra de indicadores.md fica. */}
          <span data-recorte-dos-cancelados style={{ display: 'block', marginTop: 6 }}>
            Contados até agora, os cancelados e as faltas também. Relatórios → Agenda conta o período inteiro, com os que ainda vão acontecer.
          </span>
        </Dica>
      </div>

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
              {f.nota && (
                <span data-nota-da-etapa style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {f.nota}
                </span>
              )}
            </div>
          )
        })}
      </div>
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
  /** O "Cliente desde" da importação (AAAA-MM-DD), para a linha sem visita (A14 da 43ª). */
  clienteDesde?: string | null
}

/**
 * A linha sem visita nenhuma (A14 da 43ª; CC-05, IM-20; princípio 3): a ficha
 * de antes do sistema ("Cliente desde mar 2017") não "nunca veio" — a linha diz
 * o que a ficha tem. Sem "Cliente desde", "Nunca veio". Decisão do Claude, 28/11.
 */
export function semVisitaDoReativar(clienteDesde: string | null | undefined): string {
  const desde = clienteDesde ? mesDeClienteDesde({ clienteDesde }) : null
  return desde ? `Cliente desde ${desde}` : 'Nunca veio'
}

/**
 * O vazio do quadro diz o que é (D16 da 8ª simulação, 2026-11-06): "Todos os
 * clientes retornaram 🎉" aparecia com 30 clientes que nunca tiveram visita (a
 * base importada no dia — cadastrada há menos de 90 dias, fora do quadro).
 * Os números vêm de lib/metrics (`comVisita`, `recentesSemVisita`).
 */
export function vazioDoReativar(comVisita: number, recentesSemVisita: number, deQuem?: string): string {
  // A10 da 13ª: o texto diz DE QUAIS clientes fala ("com horário com você",
  // "da rede"), senão o "5 cadastradas" daqui brigava com o "4 novos" do lado.
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
    + (recentesSemVisita > 0 ? ` ${recentes} ainda ${recentesSemVisita === 1 ? 'não tem' : 'não têm'} visita concluída.` : '')
}

/**
 * De quais clientes os quadros falam (A10 da 13ª simulação): o "Clientes no
 * mês" e o "Reativar" dizem de quem falam. A cliente é da REDE (24ª
 * simulação — a "atendida na unidade" de T1/H16 era uma leitura do Claude, e
 * saiu): são sempre as da rede — também na vista pessoal.
 */
export function deQuemSaoAsClientes(): string {
  return 'da rede'
}

/**
 * O link do quadro diz quantas faltam e o total (A35 da 10ª; indicadores:CC-06):
 * "Ver mais 6 (9 no total)" — o que ele abre são essas, no próprio quadro (A18 da 43ª).
 */
export function rotuloDoVerMais(mostradas: number, total: number): string {
  return `Ver mais ${Math.max(0, total - mostradas)} (${total} no total)`
}

/** A página seguinte entra depois das que o quadro já mostra, sem repetir ninguém. */
export function juntarClientesDoReativar<T extends { id: string }>(atuais: T[], novas: T[]): T[] {
  const ja = new Set(atuais.map(c => c.id))
  return [...atuais, ...novas.filter(c => !ja.has(c.id))]
}

/** A página seguinte do quadro (`maisClientesParaReativar`, actions/reativar-clientes.ts). */
export type CarregarMaisDoReativar = (pedido: { deslocamento: number; unidade: string | null }) => Promise<
  { clientes: ClienteSumida[]; total: number; error?: undefined } | { error: string }
>

/** Uma linha do quadro — a mesma nas primeiras e nas que o "Ver mais" traz. */
export function LinhaDoReativar({ c, hrefAgendar }: { c: ClienteSumida; hrefAgendar: string }) {
  return (
    <div data-cliente style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <AvatarDaCliente name={c.name} size={34} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c.name}
        </p>
        <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginTop: 1 }}>
          {c.diasSemVir !== null ? `Última visita há ${c.diasSemVir} dias` : semVisitaDoReativar(c.clienteDesde)}
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
  )
}

/** As clientes sem visita há mais de 90 dias (o total e as há mais tempo sem vir). */
export function ReativarClientes({ clientes, total, hrefAgendar, carregarMais, unidade = null, mostrarUnidade = true, comVisita = 1, recentesSemVisita = 0, deQuem }: {
  clientes: ClienteSumida[]; total: number; hrefAgendar: string
  /**
   * O resto do MESMO recorte, no próprio quadro (A18 da 43ª: o "Ver mais" levava
   * à lista de Clientes inteira). A página passa `maisClientesParaReativar`.
   */
  carregarMais: CarregarMaisDoReativar
  /** A unidade da tela (a do portal, a do `?unidade=`): o relógio dos dias da página seguinte. */
  unidade?: string | null
  /** As linhas dizem a unidade da última visita (o portal da rede); no da unidade, não. */
  mostrarUnidade?: boolean
  /** As do recorte com alguma visita concluída, e as novas sem nenhuma — o texto do vazio (D16). */
  comVisita?: number; recentesSemVisita?: number
  /** De quais clientes o quadro fala (`deQuemSaoAsClientes`, A10). */
  deQuem?: string
}) {
  return (
    <div className="card" id="reativar-clientes" data-reativar-clientes style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 6 }}>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
          Reativar clientes
          <span style={{ color: 'var(--brand)', fontWeight: 700 }}>✦</span>
        </h2>
        {/* A35 da 10ª: o quadro não dizia que quem tem horário marcado sai da conta —
            diz na dica do título (2026-11-16: a explicação mora na dica). */}
        <Dica rotulo="Quem entra no Reativar clientes">
          <span data-recorte-do-reativar>
            {deQuem ? `Clientes ${deQuem} sem visita` : 'Sem visita'} há mais de 90 dias — quem tem horário marcado não entra.
          </span>
        </Dica>
      </div>

      {clientes.length === 0 ? (
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)', textAlign: 'center', paddingTop: 8, flex: 1 }}>
          {vazioDoReativar(comVisita, recentesSemVisita, deQuem)}
        </p>
      ) : (
        <ListaDoReativar clientes={clientes} total={total} hrefAgendar={hrefAgendar}
          carregarMais={carregarMais} unidade={unidade} mostrarUnidade={mostrarUnidade} />
      )}
    </div>
  )
}
