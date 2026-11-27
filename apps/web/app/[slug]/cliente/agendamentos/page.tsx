import { getTenantContext, assertClient } from '@/lib/auth'
import { unidadesParaLer } from '@/lib/unidades/da-tela'
import { AvisoUnidadeDesativada } from '@/components/client-portal/unidade-desativada'
import { falaDaRedeDoPortal } from '@/lib/clientes/nome-da-rede'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { CalendarDays, CalendarClock, ChevronRight, Clock3, User, Plus, MapPin } from 'lucide-react'
import { ler } from '@/lib/db'
import { separarAgendaDoPortal, limiteParaAlterar, aindaDaParaAlterar, horarioPassouSemAtender, prazoDoAppEncerrado } from '@/lib/clientes/agenda-do-portal'
import { textoDoConcluido } from '@/lib/agenda/hora-real'
import { textoDoHorarioNoHistorico, TEXTO_DO_EM_ANDAMENTO_NO_APP } from '@/lib/clientes/textos-do-app'
import { fusoValido } from '@/lib/unidades/fuso'
import { NotaDoFuso } from '@/components/shared/fuso'
import { rotuloDoPagoAntes } from '@/lib/appointments/pago-antes-textos'
import { pagosAntes } from '@/lib/appointments/pago-antes'
import { valoresCobrados, type ValorCobrado } from '@/lib/appointments/valor-cobrado'
import { nomesDasSessoesDoPlano } from '@/lib/plano-de-tratamento/nome-da-sessao-no-servidor'
import { textoDaSessaoInterrompida } from '@/lib/plano-de-tratamento/sessao-no-app'

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED:   'Agendado',
  CONFIRMED:   'Confirmado',
  ARRIVED:     'Check-in',
  IN_PROGRESS: 'Em atendimento',
  COMPLETED:   'Concluído',
  CANCELLED:   'Cancelado',
  NO_SHOW:     'Não compareceu',
}

const STATUS_COLOR: Record<string, string> = {
  SCHEDULED:   'var(--brand)',
  CONFIRMED:   'var(--success)',
  ARRIVED:     'var(--success)',
  IN_PROGRESS: 'var(--warning)',
  COMPLETED:   'var(--text-muted)',
  CANCELLED:   'var(--danger)',
  NO_SHOW:     'var(--danger)',
}

type Appt = {
  id:            string
  scheduled_at:  string
  status:        string
  price:         number
  duration_min:  number
  completed_at:  string | null
  /** Iniciado (AT-21): o cancelado depois de iniciar gastou o que já estava pago. */
  started_at?:   string | null
  procedures:    { name: string } | null
  professionals: { name: string } | null
  branches:      { name: string; fuso?: string | null; is_active?: boolean } | null
  /** Já pago antes (D12): "Pré-pago · 1 de 2", "Pacote X · sessão 1 de 2"… */
  pagoAntes?:    string | null
  /** D8 da 7ª: o pago com desconto mostra o valor cobrado, não o de tabela. */
  cobrado?:      ValorCobrado | null
}

export default async function ClientAgendaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug }   = await params
  const ctx        = await getTenantContext()
  assertClient(ctx)

  const admin = createAdminClient()
  const data = await ler(admin
    .from('appointments')
    .select('id, scheduled_at, status, price, duration_min, completed_at, started_at, procedures(name), professionals:users!professional_id(name), branches(name, fuso, is_active)')
    .eq('client_id', ctx.clientId!)
    .order('scheduled_at', { ascending: false }), 'carregar os agendamentos')

  const ficha = await ler(admin.from('clients').select('tenant_id').eq('id', ctx.clientId!).single(),
    'ler a ficha') as { tenant_id: string } | null
  const rede = ficha
    ? await ler(admin.from('tenants').select('portal_prazo_alteracao_horas').eq('id', ficha.tenant_id).single(),
        'ler o prazo do portal') as { portal_prazo_alteracao_horas: number } | null
    : null
  const prazoHoras = rede?.portal_prazo_alteracao_horas ?? 24
  // CA1: o NOME da rede no lugar de "clínica".
  const { faleCom } = await falaDaRedeDoPortal(slug)
  // A clínica de mais de uma unidade: cada cartão diz ONDE (A65). O agendamento
  // da Zona Sul aparecia sob o cabeçalho da Moinhos, sem dizer a unidade.
  // A desativada que ainda tem agendamento conta (F72, lib/unidades/da-tela).
  const variasUnidades = ficha ? (await unidadesParaLer(ficha.tenant_id)).length > 1 : false

  // O que já foi pago antes (D12): pré-pago, pacote, plano — sem o "R$" a pagar.
  const [jaPagos, cobrados, nomesDasSessoes] = await Promise.all([
    // D4 da 21ª: a sessão do pacote no crediário diz o que ela ainda tem em aberto (é dela).
    pagosAntes(admin, (data ?? []).map(a => a.id as string), ficha ? { tenantId: ficha.tenant_id, mostraOValor: true, daCliente: true } : undefined),
    valoresCobrados(admin, (data ?? []).filter(a => a.status === 'COMPLETED').map(a => a.id as string)),
    // A sessão de plano com mais de um procedimento diz todos (A36).
    nomesDasSessoesDoPlano(admin, (data ?? []).map(a => a.id as string)),
  ])
  const appointments = ((data ?? []) as unknown as Appt[]).map(a => ({
    ...a, pagoAntes: jaPagos.get(a.id) ?? null, cobrado: cobrados.get(a.id) ?? null,
    procedures: nomesDasSessoes.has(a.id) ? { ...a.procedures, name: nomesDasSessoes.get(a.id)! } : a.procedures,
  }))
  // A mesma regra da home (D14): o que ainda vai acontecer, em aberto. Acima,
  // o que já começou e não acabou (o Heitor, 25/11: "Um "Em andamento" não
  // seria melhor?").
  const { emAndamento: andamento, proximos: upcoming, historico: past } =
    separarAgendaDoPortal(appointments, new Date(), a => fusoValido(a.branches?.fuso))

  return (
    <div>
      {/* -- Header ----------------------------------------------- */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 'var(--text-name)', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          Agenda
        </h1>
        <Link
          href={`/${slug}/cliente/agendamentos/novo`}
          style={{
            display:        'flex',
            alignItems:     'center',
            gap:            6,
            padding:        '9px 16px',
            background:     'var(--brand)',
            color:          'var(--on-brand)',
            borderRadius:   10,
            fontWeight:     700,
            fontSize: 'var(--text-base-sz)',
            textDecoration: 'none',
            boxShadow: 'var(--shadow-brand-btn)',
          }}
        >
          <Plus size={14} />
          Agendar
        </Link>
      </div>

      {/* -- Em andamento (o Heitor, 25/11) ----------------------- */}
      {andamento.length > 0 && (
        <section data-em-andamento style={{ marginBottom: 28 }}>
          <GroupLabel>Em andamento</GroupLabel>
          {/* D20 da 31ª (AG-55): quem registra o fim, à vista. */}
          <p data-em-andamento-registra style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', margin: '-4px 0 10px' }}>{TEXTO_DO_EM_ANDAMENTO_NO_APP}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {andamento.map(a => <AppointmentCard key={a.id} appt={a} slug={slug} highlight prazoHoras={prazoHoras} comUnidade={variasUnidades} faleCom={faleCom} />)}
          </div>
        </section>
      )}

      {/* -- Próximos --------------------------------------------- */}
      {upcoming.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <GroupLabel>Próximos</GroupLabel>
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', margin: '-4px 0 10px' }}>
            Toque no agendamento para cancelar ou remarcar — pelo app, até {prazoHoras} horas antes. Depois disso, {faleCom}.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {upcoming.map(a => <AppointmentCard key={a.id} appt={a} slug={slug} highlight prazoHoras={prazoHoras} comUnidade={variasUnidades} faleCom={faleCom} />)}
          </div>
        </section>
      )}

      {/* -- Histórico ------------------------------------------- */}
      {past.length > 0 && (
        <section>
          <GroupLabel>Histórico</GroupLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {past.map(a => <AppointmentCard key={a.id} appt={a} slug={slug} comUnidade={variasUnidades} faleCom={faleCom} />)}
          </div>
        </section>
      )}

      {/* -- Vazio ----------------------------------------------- */}
      {appointments.length === 0 && (
        <div style={{ textAlign: 'center', padding: '56px 0' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 'var(--radius-squircle)', background: 'var(--brand-soft)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
          }}>
            <CalendarDays size={24} color="var(--brand)" />
          </div>
          <p style={{ fontSize: 'var(--text-card-title)', fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            Nenhum agendamento ainda
          </p>
          <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)', marginBottom: 24 }}>
            Escolha um procedimento e agende sua consulta.
          </p>
          <Link href={`/${slug}/cliente/agendamentos/novo`} className="btn-primary">
            Fazer primeiro agendamento
          </Link>
        </div>
      )}
    </div>
  )
}

// -- Sub-components ------------------------------------------------

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 'var(--text-2xs)',
      fontWeight:    700,
      color:         'var(--text-muted)',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      marginBottom:  10,
    }}>
      {children}
    </p>
  )
}

// O cartão abre o agendamento (2026-10-21: não abria — nem detalhe, nem cancelar).
function AppointmentCard({ appt, slug, highlight = false, prazoHoras, comUnidade = false, faleCom }: { appt: Appt; slug: string; highlight?: boolean; prazoHoras?: number; comUnidade?: boolean; faleCom: string }) {
  const dt    = new Date(appt.scheduled_at)
  // O dia e a hora no relógio da unidade do agendamento (F62).
  const fuso  = fusoValido(appt.branches?.fuso)
  const concluidoEm = appt.status === 'COMPLETED' ? textoDoConcluido(appt.scheduled_at, appt.completed_at, fuso) : null
  // A46 da 24ª: o de hoje cujo horário acabou sem a equipe registrar.
  const passou = horarioPassouSemAtender(appt)
  // AT-21 (D4 da 37ª): o atendimento iniciado e cancelado gastou a sessão já paga (do pacote, do pré-pago, do plano).
  const interrompido = appt.status === 'CANCELLED' && !!appt.started_at && !!appt.pagoAntes
  const color = passou ? 'var(--warning)' : interrompido ? 'var(--text-muted)' : STATUS_COLOR[appt.status] ?? 'var(--text-muted)'
  // A47 da 24ª: remarcar num toque — o cartão leva ao formulário já aberto.
  const remarca = prazoHoras != null && !passou && ['SCHEDULED', 'CONFIRMED'].includes(appt.status)
    && appt.branches?.is_active !== false && aindaDaParaAlterar(appt.scheduled_at, prazoHoras)
  // D8 da 7ª: cobrado, vale o cobrado (o preço menos o desconto da recepção); no crediário, a entrada e as parcelas (D4 da 34ª).
  const valor = appt.cobrado ? appt.cobrado.cobrado : Number(appt.price)
  const price = valor
    ? `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    : '—'

  return (
    <div
      className="card"
      style={{
        padding: highlight ? '16px 18px' : '13px 18px',
        border:  highlight ? '1.5px solid var(--brand)' : undefined,
      }}
    >
    <Link
      href={`/${slug}/cliente/agendamentos/${appt.id}`}
      style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
    >
      {/* Procedure name + status badge */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <p style={{
          fontWeight:    800,
          color:         'var(--text)',
          fontSize:      highlight ? 15 : 14,
          letterSpacing: '-0.01em',
          lineHeight:    1.2,
        }}>
          {appt.procedures?.name ?? 'Procedimento'}
        </p>
        <span style={{
          padding:      '3px 10px',
          borderRadius: 'var(--radius-chip-token)',
          fontSize: 'var(--text-overline)',
          fontWeight:   700,
          background:   `${color}18`,
          color,
          whiteSpace:   interrompido ? 'normal' : 'nowrap',
          flexShrink:   interrompido ? 1 : 0,
        }}>
          {passou ? 'Horário passou' : interrompido ? textoDaSessaoInterrompida(appt.scheduled_at, fuso) : STATUS_LABEL[appt.status] ?? appt.status}
        </span>
        {/* A seta diz que o cartão abre (J-61). */}
        <ChevronRight data-abre-detalhe size={16} color="var(--text-faint)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
      </div>

      {/* Details row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
        {(comUnidade || appt.branches?.is_active === false) && appt.branches?.name && (
          <span data-unidade-do-agendamento style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
            <MapPin size={11} aria-hidden="true" />
            {appt.branches.name}
          </span>
        )}
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          <User size={11} />
          {appt.professionals?.name ?? 'Profissional'}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          <CalendarDays size={11} />
          {dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: fuso })}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          <Clock3 size={11} />
          {/* A hora real ao lado da agendada (J-34), dizendo qual é a marcada (A31 da 14ª). */}
          <span data-hora-real={concluidoEm ? '' : undefined}>
            {textoDoHorarioNoHistorico(dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: fuso }), concluidoEm)}
          </span>
          {/* A9 da 26ª: o relógio da unidade, fora do de Brasília (princípio 3). */}
          <NotaDoFuso fuso={fuso} />
        </span>
        {appt.pagoAntes ? (
          <span data-pago-antes style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: rotuloDoPagoAntes(appt.pagoAntes) === 'A receber' ? 'var(--warning)' : 'var(--success)', marginLeft: 'auto' }}>
            {appt.pagoAntes}
          </span>
        ) : appt.price > 0 && (
          <span data-valor-do-atendimento style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)', marginLeft: 'auto', textAlign: 'right' }}>
            {price}
            {appt.cobrado && appt.cobrado.desconto > 0 && (
              <span style={{ display: 'block', fontSize: 'var(--text-xs-sz)', fontWeight: 600, color: 'var(--text-muted)' }}>
                {`desconto de R$ ${appt.cobrado.desconto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
              </span>
            )}
          </span>
        )}
      </div>
      {/* F72: o agendamento numa unidade que a rede desativou diz isso no cartão. */}
      {appt.branches?.is_active === false && (
        <AvisoUnidadeDesativada nome={appt.branches.name} aberto={['SCHEDULED', 'CONFIRMED'].includes(appt.status)} faleCom={faleCom} />
      )}
      {prazoHoras != null && !passou && ['SCHEDULED', 'CONFIRMED'].includes(appt.status) && aindaDaParaAlterar(appt.scheduled_at, prazoHoras) && (
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 8 }}>
          Alterar até {limiteParaAlterar(appt.scheduled_at, prazoHoras, fuso)}
        </p>
      )}
      {/* A46 da 24ª: passou o horário — o cartão diz isso, não "Prazo do app encerrado". */}
      {prazoHoras != null && passou && (
        <p data-horario-passou style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 8 }}>
          O horário já passou; a equipe ainda vai registrar o atendimento.
        </p>
      )}
      {/* A53 da 7ª simulação: passado o prazo, o cartão já diz o caminho (a regra do prazo fica).
          Também em todo em andamento, mesmo o que começou ontem (decisão do Claude, 25/11). */}
      {prazoHoras != null && prazoDoAppEncerrado(appt, prazoHoras, new Date(), fuso) && (
        <p data-prazo-encerrado style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 8 }}>
          Prazo do app encerrado: {faleCom} para alterar
        </p>
      )}
    </Link>
      {remarca && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <Link data-remarcar-do-cartao href={`/${slug}/cliente/agendamentos/${appt.id}?remarcar=1`} className="btn-ghost"
            style={{ fontSize: 'var(--text-sm-sz)', textDecoration: 'none' }}>
            <CalendarClock size={14} aria-hidden="true" /> Remarcar
          </Link>
        </div>
      )}
    </div>
  )
}
