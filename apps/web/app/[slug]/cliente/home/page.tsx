import { getTenantContext, assertClient } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { avulsosDoPlano, textoDoAvulso } from '@/lib/checkout/plano-e-avulso'
import { ler, contar } from '@/lib/db'
import Link from 'next/link'
import { CalendarDays, ChevronRight, ClipboardList, FileSignature, MessageCircle, Sparkles } from 'lucide-react'
import { formatBRL, formatDia } from '@estetica-os/utils'
import { aClinicaDoEndereco, comMensagem } from '@/lib/clientes/a-clinica'
import { CartaoDaClinica } from '@/components/client-portal/cartao-da-clinica'
import { preAtendimentoPendente } from '@/lib/pre-atendimento/ficha'
import { configDaRede, saldoDoCliente } from '@/lib/fidelidade/leitura'
import { STATUS_DO_PROXIMO, inicioDosProximos, jaPassouDaHora } from '@/lib/clientes/agenda-do-portal'
import { boasVindas, nomeParaSaudar } from '@/lib/saudacao'
import { nomesDasSessoesDoPlano } from '@/lib/plano-de-tratamento/nome-da-sessao-no-servidor'
import { contagemDoPago, textoDoParaAgendar } from '@/lib/pre-pago/contagem'
import { getFinanceiroDoPlano, type FinanceiroDoPlano } from '@/lib/metrics/plano'

// -- Helpers --------------------------------------------------------
function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo' }),
    time: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }),
  }
}

// -- Types ----------------------------------------------------------
type NextAppt = {
  id:           string
  scheduled_at: string
  procedures:   { name: string } | null
  professionals: { name: string } | null
}

type ActivePackage = {
  id:             string
  total_sessions: number
  used_sessions:  number
  expires_at:     string | null
  service_packages: { name: string } | null
  /** As sessões livres (A63): a próxima diz o procedimento a agendar. */
  package_sessions: {
    session_number: number; status: string; appointment_id: string | null
    procedures: { id: string; name: string; visible_on_client_app: boolean; is_active: boolean; branch_id: string | null } | null
  }[] | null
}

type ActivePlan = {
  id:         string
  status:     string
  created_at: string
  // Os procedimentos vêm das SESSÕES. `treatment_plan_items` é legado: nenhum
  // código escreve nela desde que o plano passou a ser por sessão, e a lista
  // aqui aparecia sem nenhum procedimento.
  // Só o que a cliente pode ver: procedimento e preço. A anotação do
  // profissional (`professional_notes`) e a da sessão são clínicas (D-18).
  treatment_plan_sessions: Array<{
    sort_order: number | null
    /** O agendamento da sessão (A45: feita, agendada ou a agendar). */
    appointments?: { status: string; scheduled_at: string; completed_at: string | null } | null
    treatment_plan_session_procedures: Array<{ price: number | string | null; procedures: { name: string } | null }>
  }>
}

// -- Page -----------------------------------------------------------
export default async function ClientHomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ctx = await getTenantContext()
  assertClient(ctx)

  const admin = createAdminClient()
  // A unidade do endereço (o slug é único no sistema, §5): o procedimento do
  // pacote se agenda por aqui se é da rede ou desta unidade (A63).
  const unidadeDoEndereco = await ler(admin.from('branches').select('id').eq('slug', slug).maybeSingle(), 'buscar a unidade do endereço') as { id: string } | null

  const [clientRes, nextApptRes, pendingConfirmRes, packagesRes, plansRes, saldoDePontos, prePagosRes] = await Promise.all([
    ler(admin.from('clients').select('name, tenant_id, gender').eq('id', ctx.clientId!).single(), 'buscar o cliente'),
    ler(admin.from('appointments')
      .select('id, scheduled_at, procedures(name), professionals:users!professional_id(name)')
      .eq('client_id', ctx.clientId!)
      // A mesma regra dos "Próximos" da Agenda (D14).
      .in('status', [...STATUS_DO_PROXIMO])
      // Desde o início de hoje (A51): o de hoje que passou da hora fica até a conclusão.
      .gte('scheduled_at', inicioDosProximos())
      .order('scheduled_at')
      .limit(1)
      .maybeSingle(), 'buscar o próximo agendamento'),
    ler(admin.from('appointments')
      .select('id, scheduled_at, procedures(name), professionals:users!professional_id(name)')
      .eq('client_id', ctx.clientId!)
      .eq('status', 'COMPLETED')
      .is('client_confirmed_at', null)
      .order('scheduled_at', { ascending: false })
      .limit(5), 'buscar os atendimentos a confirmar'),
    ler(admin.from('client_packages')
      .select('id, total_sessions, used_sessions, expires_at, service_packages(name), package_sessions(session_number, status, appointment_id, procedures(id, name, visible_on_client_app, is_active, branch_id))')
      .eq('client_id', ctx.clientId!)
      // O pacote cancelado (F2b) não é tratamento em curso.
      .is('cancelado_em', null)
      .order('purchased_at', { ascending: false })
      .limit(5), 'buscar os pacotes'),
    ler(admin.from('treatment_plans')
      .select('id, status, created_at, treatment_plan_sessions(sort_order, appointments!treatment_plan_sessions_appointment_id_fkey(status, scheduled_at, completed_at), treatment_plan_session_procedures(price, procedures(name)))')
      .eq('client_id', ctx.clientId!)
      .in('status', ['PROPOSED', 'ACCEPTED'])
      .order('created_at', { ascending: false })
      .limit(3), 'buscar os planos'),
    // O saldo é a soma do extrato — não mais loyalty_accounts.balance.
    saldoDoCliente(ctx.clientId!, null, admin),
    // Procedimentos pré-pagos (2026-09-30): o que ele ainda tem para agendar.
    ler(admin.from('procedure_sales')
      .select('id, quantity, expires_at, procedures(name), procedure_sale_units(status, appointment_id)')
      .eq('client_id', ctx.clientId!)
      .order('sold_at', { ascending: false })
      .limit(10), 'buscar os procedimentos pré-pagos'),
  ])

  const clientName   = (clientRes as { name: string } | null)?.name ?? 'você'
  // Sem o tratamento ("Dona Ivone" é Ivone) e com as boas-vindas pelo sexo (D17/D19).
  const firstName    = nomeParaSaudar(clientName) || 'você'
  const bemVinda     = boasVindas((clientRes as { gender: string | null } | null)?.gender)
  // A sessão de plano com mais de um procedimento diz todos (A36).
  const nomesDasSessoes = await nomesDasSessoesDoPlano(admin, [
    (nextApptRes as unknown as NextAppt | null)?.id ?? '', ...((pendingConfirmRes ?? []) as unknown as NextAppt[]).map(a => a.id),
  ])
  const comONomeDaSessao = (a: NextAppt): NextAppt =>
    nomesDasSessoes.has(a.id) ? { ...a, procedures: { ...a.procedures, name: nomesDasSessoes.get(a.id)! } } : a
  const nextAppt     = nextApptRes ? comONomeDaSessao(nextApptRes as unknown as NextAppt) : null
  const pendingConfirm = ((pendingConfirmRes ?? []) as unknown as NextAppt[]).map(comONomeDaSessao)
  const allPackages  = (packagesRes ?? []) as unknown as ActivePackage[]
  const activePkgs   = allPackages.filter(p => Number(p.used_sessions) < Number(p.total_sessions))
  const activePlans  = (plansRes ?? []) as unknown as ActivePlan[]
  const points       = Number(saldoDePontos ?? 0)
  // O cliente não carrega a rede no token: ela vem da ficha dele. Programa
  // desligado = nenhum sinal de pontos, nem com saldo.
  const redeDoCliente = (clientRes as { tenant_id: string | null } | null)?.tenant_id ?? null
  const fidelidadeLigada = redeDoCliente ? (await configDaRede(redeDoCliente, admin)).enabled : false
  // O plano FECHADO abre (A45): as sessões e o dinheiro dele, de lib/metrics.
  const financeiroDosPlanos = new Map(redeDoCliente ? await Promise.all(activePlans
    .filter(p => p.status === 'ACCEPTED')
    .map(async p => [p.id, await getFinanceiroDoPlano(redeDoCliente, p.id)] as const)) : [])

  const prePagos = ((prePagosRes ?? []) as unknown as {
    id: string; quantity: number; expires_at: string | null; procedures: { name: string } | null; procedure_sale_units: { status: string; appointment_id: string | null }[]
  }[]).map(v => ({ ...v, contagem: contagemDoPago((v.procedure_sale_units ?? []).map(u => ({ status: u.status, agendada: !!u.appointment_id }))) }))
    // A agendada não está "para agendar" (A27), mas o cartão fica enquanto houver alguma em aberto.
    .filter(v => v.contagem.paraAgendar + v.contagem.agendadas > 0)

  const hasActiveTreatments = activePkgs.length > 0 || activePlans.length > 0 || prePagos.length > 0

  // O plano PROPOSTO (D-18): validade da rede e o caminho para falar com a
  // clínica do endereço — o aceite é na clínica.
  // A clínica do endereço também é o cartão "A clínica" do fim da página (J-66).
  const temProposto = activePlans.some(p => p.status === 'PROPOSED')
  const [validadeDias, aClinica] = await Promise.all([
    temProposto && redeDoCliente
      ? ler(admin.from('tenants').select('plano_validade_dias').eq('id', redeDoCliente).maybeSingle(), 'ler a validade do plano proposto')
          .then(t => Number((t as { plano_validade_dias?: number } | null)?.plano_validade_dias ?? 30))
      : Promise.resolve(30),
    aClinicaDoEndereco(slug),
  ])
  // O avulso agendado de um procedimento do plano proposto (A68): a cliente
  // não sabia se pagaria os dois — o cartão do plano diz que ele é à parte.
  const avulsosPorPlano = new Map<string, string[]>()
  if (temProposto && redeDoCliente) {
    await Promise.all(activePlans.filter(p => p.status === 'PROPOSED').map(async p => {
      const lista = await avulsosDoPlano(admin, redeDoCliente, p.id)
      if (lista.length) avulsosPorPlano.set(p.id, lista.map(textoDoAvulso))
    }))
  }

  // Termos e contratos esperando a assinatura dele (§9.4.1).
  const paraAssinar = await contar(admin.from('issued_documents').select('id', { count: 'exact', head: true })
    .eq('client_id', ctx.clientId!).in('status', ['A_GERAR', 'PENDENTE']), 'contar os documentos para assinar')
  // A ficha de pré-atendimento que a clínica mandou ao agendar (2026-10-20).
  const preAtendimento = await preAtendimentoPendente(admin, ctx.clientId!)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* -- Saudação ----------------------------------------------- */}
      <div>
        <h1 style={{
          fontSize:      26,
          fontWeight:    800,
          color:         'var(--text)',
          letterSpacing: '-0.025em',
          marginBottom:  4,
        }}>
          Olá, {firstName}!
        </h1>
        <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)' }}>
          {bemVinda} ao seu espaço pessoal.
        </p>
      </div>

      {/* -- Pré-atendimento ---------------------------------------- */}
      {preAtendimento && (
        <Link href={`/${slug}/cliente/pre-atendimento`} data-testid="pre-atendimento-pendente" className="card" style={{
          textDecoration: 'none', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12,
          borderColor: 'var(--brand-soft-border)', background: 'var(--brand-soft)',
        }}>
          <ClipboardList size={20} color="var(--brand)" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 800, color: 'var(--text)', fontSize: 'var(--text-base-sz)' }}>
              {preAtendimento.modo === 'CONFIRMAR' ? 'Confirme a sua ficha de saúde' : 'Responda a sua ficha de saúde'}
            </p>
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
              {preAtendimento.modo === 'CONFIRMAR' ? 'Algo mudou desde a última vez? Leva um minuto.' : 'Algumas perguntas antes do seu atendimento.'}
            </p>
          </div>
          <ChevronRight size={16} color="var(--brand)" />
        </Link>
      )}

      {/* -- Documentos para assinar --------------------------------- */}
      {paraAssinar > 0 && (
        <Link href={`/${slug}/cliente/documentos`} data-testid="documentos-para-assinar" className="card" style={{
          textDecoration: 'none', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12,
          borderColor: 'var(--brand-soft-border)', background: 'var(--brand-soft)',
        }}>
          <FileSignature size={20} color="var(--brand)" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 800, color: 'var(--text)', fontSize: 'var(--text-base-sz)' }}>
              {paraAssinar === 1 ? '1 documento para assinar' : `${paraAssinar} documentos para assinar`}
            </p>
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>Leia e assine pelo celular, antes do seu atendimento.</p>
          </div>
          <ChevronRight size={16} color="var(--brand)" />
        </Link>
      )}

      {/* -- Pontos de fidelidade ----------------------------------- */}
      {fidelidadeLigada && (
        <Link href={`/${slug}/cliente/fidelidade`} data-testid="cartao-de-pontos" style={{
          textDecoration: 'none',
          background:    'var(--gradient-brand)',
          borderRadius:  14,
          padding:       '16px 20px',
          display:       'flex',
          alignItems:    'center',
          justifyContent: 'space-between',
          color:         'var(--on-brand)',
        }}>
          <div>
            <p style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, opacity: 0.8, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
              Seus pontos
            </p>
            <p style={{ fontSize: 'var(--text-kpi)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
              {points.toLocaleString('pt-BR')}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs-sz)', fontWeight: 700 }}>
            Ver extrato <ChevronRight size={16} />
          </div>
        </Link>
      )}

      {/* -- Aguardando confirmação --------------------------------- */}
      {pendingConfirm.length > 0 && (
        <section>
          <SectionHeader label="Aguardando sua confirmação" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pendingConfirm.map(a => (
              <Link
                key={a.id}
                href={`/${slug}/cliente/atendimentos/${a.id}/confirmar`}
                className="card"
                style={{
                  padding: '14px 16px', textDecoration: 'none',
                  border: '1.5px solid var(--brand)', background: 'var(--brand-soft)',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 800, color: 'var(--text)', fontSize: 'var(--text-card-title)', letterSpacing: '-0.01em', marginBottom: 2 }}>
                    {a.procedures?.name ?? 'Procedimento'}
                  </p>
                  <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--brand-deep, var(--brand))', fontWeight: 600 }}>
                    Toque para confirmar e avaliar
                  </p>
                </div>
                <ChevronRight size={18} color="var(--brand)" style={{ flexShrink: 0 }} />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* -- Próximo agendamento ------------------------------------- */}
      <section>
        <SectionHeader label="Próximo agendamento" />
        {nextAppt ? (
          <div className="card" style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 800, color: 'var(--text)', fontSize: 15.5, marginBottom: 4, letterSpacing: '-0.01em' }}>
                  {nextAppt.procedures?.name ?? 'Procedimento'}
                </p>
                <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)', marginBottom: 8 }}>
                  {nextAppt.professionals?.name ?? 'Profissional'}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CalendarDays size={13} color="var(--brand)" />
                  <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 600, color: 'var(--brand)' }}>
                    {(() => {
                      const { date, time } = fmtDateTime(nextAppt.scheduled_at)
                      return `${date} às ${time}`
                    })()}
                  </span>
                </div>
                {/* A51: o de hoje que passou da hora segue aqui até a clínica concluir. */}
                {jaPassouDaHora(nextAppt.scheduled_at) && (
                  <p data-passou-da-hora style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 6 }}>
                    Hoje, já no horário: a clínica registra quando o atendimento terminar.
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="card" style={{ padding: '20px 18px', textAlign: 'center' }}>
            <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)', marginBottom: 14 }}>
              Nenhum agendamento próximo.
            </p>
            <Link href={`/${slug}/cliente/agendamentos/novo`} className="btn-primary">
              Agendar agora
            </Link>
          </div>
        )}
      </section>

      {/* -- Tratamentos em curso ----------------------------------- */}
      {hasActiveTreatments && (
        <section>
          <SectionHeader label="Tratamentos em curso" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            {activePkgs.map(pkg => {
              const used  = Number(pkg.used_sessions)
              const total = Number(pkg.total_sessions)
              const pct   = total > 0 ? Math.round((used / total) * 100) : 0
              // A63: a próxima sessão livre diz o procedimento a agendar — e
              // se o app o agenda (visível, ativo, da rede ou desta unidade).
              const proxima = [...(pkg.package_sessions ?? [])]
                .filter(s => s.status === 'AVAILABLE' && !s.appointment_id)
                .sort((a, b) => a.session_number - b.session_number)[0]
              const proc = proxima?.procedures ?? null
              const peloApp = !!proc && proc.visible_on_client_app && proc.is_active && (!proc.branch_id || proc.branch_id === unidadeDoEndereco?.id)
              return (
                <div key={pkg.id} data-pacote className="card" style={{ padding: '14px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <Sparkles size={15} color="var(--brand)" />
                    <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 'var(--text-base-sz)' }}>
                      {(pkg.service_packages as { name: string } | null)?.name ?? 'Pacote de sessões'}
                    </p>
                  </div>
                  <ProgressBar pct={pct} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                    <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                      {used} de {total} sessões realizadas · restam {Math.max(0, total - used)}
                    </span>
                    {pkg.expires_at && (
                      <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)' }}>
                        válido até {new Date(pkg.expires_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                      </span>
                    )}
                  </div>
                  {proc && (peloApp ? (
                    <Link href={`/${slug}/cliente/agendamentos/novo?procedimento=${proc.id}`} className="btn-secondary"
                      style={{ marginTop: 10, justifyContent: 'center', width: '100%' }}>
                      <CalendarDays size={14} aria-hidden="true" /> Agendar {proc.name}
                    </Link>
                  ) : (
                    <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 10 }}>
                      {proc.name}: agende com a clínica.
                      {aClinica?.whatsapp && (
                        <> <a href={comMensagem(aClinica.whatsapp, `Olá! Quero agendar a próxima sessão do meu pacote (${proc.name}).`)!}
                          target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand)', fontWeight: 700 }}>Falar no WhatsApp</a></>
                      )}
                    </p>
                  ))}
                </div>
              )
            })}

            {prePagos.map(v => (
              <div key={v.id} className="card" data-pre-pago style={{ padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Sparkles size={15} color="var(--brand)" />
                  <div>
                    <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 'var(--text-base-sz)' }}>
                      {v.procedures?.name ?? 'Procedimento'}
                    </p>
                    <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                      {v.quantity} já pago{v.quantity > 1 ? 's' : ''} · {textoDoParaAgendar(v.contagem)}
                      {v.expires_at ? ` · válido até ${new Date(v.expires_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : ''}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {activePlans.filter(p => p.status === 'PROPOSED').map(plan => (
              <PlanoProposto key={plan.id} plano={plan} validadeDias={validadeDias} whatsapp={aClinica?.whatsapp ?? null} telefone={aClinica?.telefone ?? null}
                avulsos={avulsosPorPlano.get(plan.id) ?? []} />
            ))}

            {activePlans.filter(p => p.status === 'ACCEPTED' && financeiroDosPlanos.has(p.id)).map(plan => (
              <PlanoFechado key={plan.id} plano={plan} financeiro={financeiroDosPlanos.get(plan.id)!} slug={slug} />
            ))}

            {activePlans.filter(p => p.status !== 'PROPOSED' && !financeiroDosPlanos.has(p.id)).map(plan => {
              const procs = (plan.treatment_plan_sessions ?? [])
                .flatMap(s => s.treatment_plan_session_procedures ?? [])
                .map(p => p.procedures?.name)
                .filter(Boolean)
                .slice(0, 2)
                .join(', ')
              return (
                <div key={plan.id} className="card" style={{ padding: '14px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Sparkles size={15} color="var(--brand)" />
                    <div>
                      <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 'var(--text-base-sz)' }}>
                        Plano de tratamento
                      </p>
                      {procs && (
                        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', marginTop: 2 }}>
                          {procs}
                        </p>
                      )}
                    </div>
                    <span style={{
                      marginLeft: 'auto',
                      fontSize: 'var(--text-2xs)', fontWeight: 700,
                      color: 'var(--success)',
                      background: 'color-mix(in srgb, var(--success) 9%, transparent)',
                      padding: '3px 10px', borderRadius: 'var(--radius-chip-token)',
                    }}>
                      {plan.status === 'ACCEPTED' ? 'Ativo' : 'Proposto'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* -- CTA ---------------------------------------------------- */}
      <Link
        href={`/${slug}/cliente/agendamentos/novo`}
        className="btn-primary"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
      >
        <CalendarDays size={15} />
        Agendar procedimento
      </Link>

      {/* -- A clínica (J-66) ---------------------------------------- */}
      {aClinica && <CartaoDaClinica clinica={aClinica} />}

    </div>
  )
}

// -- Sub-components ------------------------------------------------

/**
 * O plano proposto como a cliente o vê (D-18): as sessões com os
 * procedimentos, o valor e a validade, e "Falar com a clínica". O app não
 * aceita: o aceite (e o pagamento) é na clínica.
 */
function PlanoProposto({ plano, validadeDias, whatsapp, telefone, avulsos = [] }: {
  plano: ActivePlan; validadeDias: number; whatsapp: string | null; telefone: string | null
  /** O agendado à parte de um procedimento do plano (A68), em texto. */
  avulsos?: string[]
}) {
  const sessoes = [...(plano.treatment_plan_sessions ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const itens = sessoes.flatMap(s => s.treatment_plan_session_procedures ?? [])
  const valor = itens.reduce((t, i) => t + Math.round(Number(i.price ?? 0) * 100), 0) / 100
  const validoAte = new Date(new Date(plano.created_at).getTime() + validadeDias * 86_400_000)
  const vencido = jaPassou(validoAte)
  const dia = validoAte.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  return (
    <div data-plano-proposto className="card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Sparkles size={15} color="var(--brand)" />
        <p style={{ fontWeight: 800, color: 'var(--text)', fontSize: 'var(--text-base-sz)' }}>Plano de tratamento proposto</p>
        <span style={{
          marginLeft: 'auto', fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--info)', background: 'var(--info-soft)',
          padding: '3px 10px', borderRadius: 'var(--radius-chip-token)', flexShrink: 0,
        }}>Proposto</span>
      </div>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sessoes.map((s, i) => (
          <li key={i} style={{ display: 'flex', gap: 8, fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)' }}>
            <span style={{ color: 'var(--text-faint)', fontWeight: 700, flexShrink: 0 }}>Sessão {i + 1}</span>
            <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              {(s.treatment_plan_session_procedures ?? []).map(x => x.procedures?.name ?? 'Procedimento').join(' + ') || '—'}
            </span>
          </li>
        ))}
      </ol>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', borderTop: '1px solid var(--hairline)', paddingTop: 10 }}>
        <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>{sessoes.length} {sessoes.length === 1 ? 'sessão' : 'sessões'}</span>
        <span style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--brand)', letterSpacing: '-0.01em' }}>{formatBRL(valor)}</span>
      </div>
      <p style={{ fontSize: 'var(--text-sm-sz)', color: vencido ? 'var(--warning)' : 'var(--text-muted)', fontWeight: 600 }}>
        {vencido ? `Proposta vencida em ${dia} — fale com a clínica para atualizar.` : `Válido até ${dia}.`} O aceite é feito na clínica.
      </p>
      {avulsos.length > 0 && (
        <p data-avulso-do-plano style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--warning)', fontWeight: 600 }}>
          {avulsos.join('; ')}: ele não faz parte deste plano. Fale com a clínica se ele deveria ser uma sessão do plano.
        </p>
      )}
      {whatsapp ? (
        // A66: o WhatsApp abre com a mensagem pronta sobre ESTE plano.
        <a href={comMensagem(whatsapp, `Olá! Vi no app o plano de tratamento proposto (${sessoes.length} ${sessoes.length === 1 ? 'sessão' : 'sessões'}, ${formatBRL(valor)}) e quero conversar sobre ele.`)!}
          target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ justifyContent: 'center' }}>
          <MessageCircle size={14} aria-hidden="true" /> Falar com a clínica
        </a>
      ) : telefone ? (
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', fontWeight: 600 }}>Telefone da clínica: {telefone}</p>
      ) : null}
    </div>
  )
}

/**
 * O plano FECHADO como a cliente o vê (A45 da 6ª simulação): o cartão abre
 * (`<details>`) e diz cada sessão — feita, agendada ou a agendar — e o
 * dinheiro: o pago e o a pagar, com o próximo vencimento. Os números são os
 * de `getFinanceiroDoPlano` (lib/metrics); a tela não soma. Nada clínico: só
 * os procedimentos e as datas.
 */
function PlanoFechado({ plano, financeiro, slug }: { plano: ActivePlan; financeiro: FinanceiroDoPlano; slug: string }) {
  const sessoes = [...(plano.treatment_plan_sessions ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const { total, feitas, agendadas } = financeiro.sessoes
  const proximo = financeiro.lancamentos.filter(l => !l.pago && l.vencimento).map(l => l.vencimento!).sort()[0] ?? null
  const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
  const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
  const situacao = (a: ActivePlan['treatment_plan_sessions'][number]['appointments']) => {
    if (a?.status === 'COMPLETED') return { texto: `Feita em ${dia(a.completed_at ?? a.scheduled_at)}`, cor: 'var(--success)' }
    if (a && ['SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS'].includes(a.status)) {
      return { texto: `Agendada para ${dia(a.scheduled_at)} às ${hora(a.scheduled_at)}`, cor: 'var(--info)' }
    }
    return { texto: 'A agendar', cor: 'var(--text-muted)' }
  }
  return (
    <details data-plano-fechado className="card cartao-que-abre" style={{ padding: '14px 18px' }}>
      <summary style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', listStyle: 'none' }}>
        <Sparkles size={15} color="var(--brand)" aria-hidden="true" />
        <div style={{ minWidth: 0 }}>
          <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 'var(--text-base-sz)' }}>Plano de tratamento</p>
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', marginTop: 2 }}>
            {feitas} de {total} {total === 1 ? 'sessão feita' : 'sessões feitas'}
            {agendadas > 0 ? ` · ${agendadas} ${agendadas === 1 ? 'agendada' : 'agendadas'}` : ''}
          </p>
        </div>
        <ChevronRight size={16} color="var(--text-faint)" aria-hidden="true" className="seta-do-cartao" style={{ marginLeft: 'auto', flexShrink: 0 }} />
      </summary>
      <div data-plano-detalhe style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--hairline)' }}>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sessoes.map((s, i) => {
            const sit = situacao(s.appointments)
            return (
              <li key={i} style={{ display: 'flex', flexDirection: 'column', gap: 1, fontSize: 'var(--text-sm-sz)' }}>
                <span style={{ color: 'var(--text-soft)', overflowWrap: 'anywhere' }}>
                  <b style={{ color: 'var(--text-faint)' }}>Sessão {i + 1}</b>{' '}
                  {(s.treatment_plan_session_procedures ?? []).map(x => x.procedures?.name ?? 'Procedimento').join(' + ') || '—'}
                </span>
                <span style={{ color: sit.cor, fontWeight: 600, fontSize: 'var(--text-xs-sz)' }}>{sit.texto}</span>
              </li>
            )
          })}
        </ol>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 'var(--text-sm-sz)', color: 'var(--text)', fontWeight: 600 }}>
          <span>Pago {formatBRL(financeiro.recebido)}</span>
          <span style={{ color: financeiro.aReceber > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
            A pagar {formatBRL(financeiro.aReceber)}
            {proximo ? ` · próxima em ${formatDia(proximo)}` : ''}
          </span>
        </div>
        <Link href={`/${slug}/cliente/financeiro`} prefetch={false}
          style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--brand)', fontWeight: 700 }}>
          Ver os pagamentos
        </Link>
      </div>
    </details>
  )
}

/** O instante já passou (fora do componente: a página renderiza uma vez por requisição). */
function jaPassou(d: Date): boolean {
  return d.getTime() < Date.now()
}

function SectionHeader({ label }: { label: string }) {
  return (
    <p style={{
      fontSize: 'var(--text-2xs)',
      fontWeight:    700,
      color:         'var(--text-muted)',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      marginBottom:  10,
    }}>
      {label}
    </p>
  )
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div style={{ height: 6, background: 'var(--hairline)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{
        height:       '100%',
        width:        `${pct}%`,
        background:   'var(--brand)',
        borderRadius: 3,
        transition:   'width 400ms',
      }} />
    </div>
  )
}
