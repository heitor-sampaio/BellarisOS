'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Check, Calendar, Clock, User, Users, Sparkles, MapPin } from 'lucide-react'
import { getClientAvailableSlots, createClientAppointment } from '@/actions/appointments'
import { toast } from 'sonner'
import { iniciaisDoNome } from '@estetica-os/utils'
import { gruposDeHorario } from '@/lib/appointments/periodos-do-dia'
import { aUnica } from '@/lib/uma-opcao'

const diaNoFuso = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(ms))

interface Procedure {
  id:           string
  name:         string
  price:        number
  duration_min: number
  /** Quem realiza (por-01). Vazio = todas as que atendem. */
  realizam?:    string[]
  /**
   * O que ela já pagou deste procedimento, no lugar do preço (D10 da 8ª):
   * "Já pago pelo pacote X (sessão 2 de 3)" — o crédito que o agendamento usa.
   */
  jaPago?:      string | null
}

interface Professional {
  id:   string
  name: string
  /** Quando ela atende, em texto (`resumoDoHorario`, J-60). */
  horario?: string[]
}

interface Props {
  slug:          string
  branchId:      string
  /** O nome da unidade do endereço — onde o agendamento vai acontecer. */
  unidade?:      string
  /**
   * As unidades da clínica, quando há mais de uma (H5/A62): a cliente escolhe
   * onde quer ser atendida, e cada uma é o agendar do endereço DELA — os
   * procedimentos, as profissionais e os horários vêm de lá.
   */
  unidades?:     { slug: string; nome: string }[]
  /** Vindo do cartão do pacote (A63): o procedimento já escolhido, e o agendar começa pela profissional. */
  procedimentoInicial?: string | null
  /**
   * A unidade já foi escolhida para o procedimento do atalho (D12 da 9ª): sem
   * isto, com mais de uma unidade, o atalho do pacote começa por "Em qual unidade?".
   */
  unidadeEscolhida?: boolean
  procedures:    Procedure[]
  professionals: Professional[]
  /**
   * O prazo do app (horas; `tenants.portal_prazo_alteracao_horas`): o horário
   * que fica dentro dele nasce sem dar para alterar pelo app — o Confirmar
   * avisa antes (A52 da 8ª).
   */
  prazoHoras?:   number | null
}

type Step = 1 | 2 | 3 | 4

/** "Sem preferência" (D-16): o id vazio vai ao servidor como nulo, e ele escolhe quem está livre. */
const SEM_PREFERENCIA: Professional = { id: '', name: 'Sem preferência' }


export function NewAppointmentWizard({ slug, branchId, unidade, unidades = [], procedimentoInicial = null, unidadeEscolhida = false, procedures, professionals, prazoHoras = null }: Props) {
  const router = useRouter()
  const inicial = procedures.find(p => p.id === procedimentoInicial) ?? null
  // Só quem REALIZA o procedimento (por-01; sem ninguém marcado, todas).
  const realizam = (p: Procedure | null) => p?.realizam?.length
    ? professionals.filter(x => p.realizam!.includes(x.id))
    : professionals
  // A2 da 10ª: com UMA profissional, o passo "Tem preferência de profissional?"
  // não pergunta nada — ela vem escolhida, e o agendar segue para a data.
  const unicaDe = (p: Procedure | null) => aUnica(realizam(p))
  const unicaInicial = inicial ? unicaDe(inicial) : null
  // O atalho do pacote (A63) começa na profissional — mas, com mais de uma
  // unidade, pergunta antes onde (D12 da 9ª; H5: a cliente agenda em qualquer unidade).
  const [step,       setStep]       = useState<Step>(inicial && (unidades.length <= 1 || unidadeEscolhida) ? (unicaInicial ? 3 : 2) : 1)
  const [procedure,  setProcedure]  = useState<Procedure | null>(inicial)
  const [prof,       setProf]       = useState<Professional | null>(unicaInicial)
  const [date,       setDate]       = useState('')
  const [slots,      setSlots]      = useState<string[]>([])
  const [time,       setTime]       = useState('')
  const [error,      setError]      = useState('')
  // O "agora" do aviso do prazo (A52): quando a tela abriu, como no alterar.
  const [abertoEm] = useState(() => Date.now())
  const [isPending,  startTransition] = useTransition()

  // O dia de hoje em Brasília (o toISOString dava o de amanhã depois das 21h).
  const [{ today, tomorrow }] = useState(() => ({ today: diaNoFuso(Date.now()), tomorrow: diaNoFuso(Date.now() + 86_400_000) }))

  const quemRealiza = realizam(procedure)
  const soUma = !!procedure && quemRealiza.length === 1

  function handleSelectProcedure(p: Procedure) {
    setProcedure(p)
    const unica = unicaDe(p)
    setProf(unica)
    setDate('')
    setSlots([])
    setTime('')
    setStep(unica ? 3 : 2)
  }

  function handleSelectProfessional(p: Professional) {
    setProf(p)
    setDate('')
    setSlots([])
    setTime('')
    setStep(3)
  }

  function handleDateChange(newDate: string) {
    setDate(newDate)
    setTime('')
    setSlots([])
    if (!newDate || !prof || !procedure) return
    startTransition(async () => {
      const res = await getClientAvailableSlots(branchId, prof.id || null, newDate, procedure.duration_min, procedure.id)
      setSlots(res.slots)
    })
  }

  function handleSelectTime(t: string) {
    setTime(t)
    setStep(4)
  }

  function handleConfirm() {
    if (!procedure || !prof || !date || !time) return
    setError('')
    const parts = time.split(':')
    const hhStr = (parts[0] ?? '00').padStart(2, '0')
    const mmStr = (parts[1] ?? '00').padStart(2, '0')
    const scheduledAt = new Date(`${date}T${hhStr}:${mmStr}:00-03:00`).toISOString()

    startTransition(async () => {
      const res = await createClientAppointment({
        branchId, procedureId: procedure.id, professionalId: prof.id || null, scheduledAt, slug,
      })
      if (res.error) {
        setError(res.error)
        return
      }
      // A48 da 6ª simulação: no "Sem preferência", ninguém dizia quem ficou com o horário.
      // A52 da 12ª: dentro do prazo do app, o aviso diz também que o app não muda mais este horário.
      const noPrazo = prazoHoras != null && prazoHoras > 0 && new Date(scheduledAt).getTime() - Date.now() < prazoHoras * 3_600_000
      toast.success('Horário marcado', {
        description: `${res.quemAtende ? `Com ${res.quemAtende}, ` : ''}${fmtDate(date)} às ${time}.`
          + (noPrazo ? ` Fica a menos de ${prazoHoras} horas: para cancelar ou remarcar, fale com a clínica.` : ''),
      })
      if (res.documentosParaAssinar) {
        // O procedimento pede termo ou contrato: direto para ele.
        router.push(`/${slug}/cliente/documentos?agendamento=${res.id}`)
      } else {
        router.push(`/${slug}/cliente/agendamentos`)
      }
    })
  }

  // --- Step indicators ---------------------------------------------
  const STEPS = [
    { n: 1, label: 'Procedimento', icon: <Sparkles size={13} /> },
    { n: 2, label: 'Profissional', icon: <User size={13} /> },
    { n: 3, label: 'Data e hora',  icon: <Calendar size={13} /> },
    { n: 4, label: 'Confirmar',    icon: <Check size={13} /> },
  ]

  const fmtPrice = (v: number) =>
    `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

  const fmtDate = (d: string) => {
    if (!d) return ''
    const [y, m, dd] = d.split('-')
    return new Date(Number(y), Number(m) - 1, Number(dd)).toLocaleDateString('pt-BR', {
      weekday: 'long', day: 'numeric', month: 'long',
    })
  }

  return (
    <div>
      {/* Back + title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <button
          type="button"
          onClick={() => {
            if (step > 1) {
              // Com uma profissional só, o passo dela não existe: volta ao procedimento.
              setStep((step === 3 && soUma ? 1 : step - 1) as Step)
            } else {
              router.back()
            }
          }}
          aria-label="Voltar"
          style={{
            width: 34, height: 34, borderRadius: 10, border: '1px solid var(--border)',
            background: 'var(--surface)', cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)',
          }}
        >
          <ChevronLeft size={16} />
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          Novo agendamento
        </h1>
      </div>

      {/* Progress bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
        {STEPS.map(s => (
          <div key={s.n} style={{ flex: 1 }}>
            <div style={{
              height:       3,
              borderRadius: 2,
              background:   s.n <= step ? 'var(--brand)' : 'var(--hairline)',
              transition:   'background 240ms',
              marginBottom: 4,
            }} />
            <p style={{
              fontSize: 'var(--text-overline)',
              fontWeight: s.n === step ? 700 : 500,
              color:      s.n === step ? 'var(--brand)' : 'var(--text-faint)',
              letterSpacing: '0.02em',
            }}>
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* --- Step 1: Procedimento ---------------------------------- */}
      {step === 1 && (
        <div>
          {unidades.length > 1 && (
            <div style={{ marginBottom: 24 }}>
              <p id="agendar-unidade" style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)', marginBottom: 10 }}>
                Em qual unidade?
              </p>
              <div role="group" aria-labelledby="agendar-unidade" aria-label="Unidade" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {unidades.map(u => {
                  const atual = u.slug === slug
                  return (
                    <Link
                      key={u.slug}
                      href={procedure
                        ? `/${u.slug}/cliente/agendamentos/novo?procedimento=${procedure.id}&unidade=escolhida`
                        : `/${u.slug}/cliente/agendamentos/novo`}
                      aria-current={atual ? 'page' : undefined}
                      replace
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12,
                        border: `1.5px solid ${atual ? 'var(--brand)' : 'var(--border)'}`,
                        background: atual ? 'var(--brand-soft)' : 'var(--surface)',
                        color: 'var(--text)', fontWeight: 700, fontSize: 'var(--text-base-sz)', textDecoration: 'none',
                      }}
                    >
                      <MapPin size={15} color="var(--brand)" aria-hidden="true" style={{ flexShrink: 0 }} />
                      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{u.nome}</span>
                      {atual && <Check size={15} color="var(--brand)" aria-hidden="true" style={{ marginLeft: 'auto', flexShrink: 0 }} />}
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
          <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)', marginBottom: 16 }}>
            Qual procedimento você deseja agendar?
          </p>
          {procedures.length === 0 && (
            <p style={{ color: 'var(--text-faint)', fontSize: 'var(--text-base-sz)', textAlign: 'center', padding: '48px 0' }}>
              Nenhum procedimento disponível para agendamento online.
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {procedures.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectProcedure(p)}
                style={{
                  display:                    'flex',
                  justifyContent:             'space-between',
                  alignItems:                 'center',
                  padding:                    '14px 18px',
                  borderRadius:               12,
                  border:                     `1.5px solid ${procedure?.id === p.id ? 'var(--brand)' : 'var(--border)'}`,
                  background:                 procedure?.id === p.id ? 'var(--brand-soft)' : 'var(--surface)',
                  cursor:                     'pointer',
                  textAlign:                  'left',
                  width:                      '100%',
                  transition:                 'all 120ms',
                  touchAction:                'manipulation',
                  WebkitTapHighlightColor:    'transparent',
                }}
              >
                <div>
                  <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 'var(--text-base-sz)', marginBottom: 2 }}>
                    {p.name}
                  </p>
                  <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
                    {p.duration_min}min
                  </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                  <p style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--brand)' }}>
                    {p.jaPago ? 'Já pago' : fmtPrice(p.price)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* --- Step 2: Profissional ---------------------------------- */}
      {step === 2 && (
        <div>
          <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)', marginBottom: 16 }}>
            Tem preferência de profissional?
          </p>
          {quemRealiza.length === 0 && (
            <p style={{ color: 'var(--text-faint)', fontSize: 'var(--text-base-sz)', textAlign: 'center', padding: '48px 0' }}>
              Nenhum profissional disponível.
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {quemRealiza.length > 1 && (
              <button
                type="button"
                onClick={() => handleSelectProfessional(SEM_PREFERENCIA)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderRadius: 12,
                  border: `1.5px solid ${prof === SEM_PREFERENCIA ? 'var(--brand)' : 'var(--border)'}`,
                  background: prof === SEM_PREFERENCIA ? 'var(--brand-soft)' : 'var(--surface)',
                  cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all 120ms',
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', background: 'var(--brand-soft)', color: 'var(--brand)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Users size={16} />
                </div>
                <div>
                  <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 'var(--text-base-sz)' }}>Sem preferência</p>
                  <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>Mostra os horários de todas as profissionais</p>
                </div>
              </button>
            )}
            {quemRealiza.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectProfessional(p)}
                style={{
                  display:        'flex',
                  alignItems:     'center',
                  gap:            12,
                  padding:        '14px 18px',
                  borderRadius:   12,
                  border:         `1.5px solid ${prof?.id === p.id ? 'var(--brand)' : 'var(--border)'}`,
                  background:     prof?.id === p.id ? 'var(--brand-soft)' : 'var(--surface)',
                  cursor:         'pointer',
                  textAlign:      'left',
                  width:          '100%',
                  transition:     'all 120ms',
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'var(--brand-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--brand)', fontWeight: 800, fontSize: 'var(--text-base-sz)', flexShrink: 0,
                }}>
                  {iniciaisDoNome(p.name, 1)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 'var(--text-base-sz)' }}>
                    {p.name}
                  </p>
                  {p.horario && p.horario.length > 0 && (
                    <p data-horario-da-profissional style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
                      {p.horario.join(' · ')}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* --- Step 3: Data e horário -------------------------------- */}
      {step === 3 && (
        <div>
          <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)', marginBottom: 16 }}>
            Escolha a data e o horário disponível.
          </p>
          {soUma && prof?.id && (
            <p data-profissional-unica style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', fontWeight: 700, marginTop: -8, marginBottom: 16 }}>
              Com {prof.name}
            </p>
          )}

          <div style={{ marginBottom: 20 }}>
            <label htmlFor="novo-agendamento-data" style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em', display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>
              Data
            </label>
            <input
              id="novo-agendamento-data"
              type="date"
              className="field"
              min={today}
              value={date}
              onChange={e => handleDateChange(e.target.value)}
              style={{ maxWidth: 220 }}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button type="button" aria-pressed={date === today} className={date === today ? 'chip-filtro is-ativo' : 'chip-filtro'} onClick={() => handleDateChange(today)}>Hoje</button>
              <button type="button" aria-pressed={date === tomorrow} className={date === tomorrow ? 'chip-filtro is-ativo' : 'chip-filtro'} onClick={() => handleDateChange(tomorrow)}>Amanhã</button>
            </div>
            {prof?.id && prof.horario && prof.horario.length > 0 && (
              <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', marginTop: 10 }}>
                {prof.name} atende: {prof.horario.join(' · ')}
              </p>
            )}
          </div>

          {date && (
            <div>
              <label style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em', display: 'block', marginBottom: 10 }}>
                HORÁRIOS DISPONÍVEIS
              </label>
              {isPending ? (
                <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)', padding: '16px 0' }}>
                  Carregando horários…
                </p>
              ) : slots.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {gruposDeHorario(slots).map(g => (
                  <div key={g.periodo} role="group" aria-label={g.periodo} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span className="overline">{g.periodo}</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {g.horarios.map(slot => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => handleSelectTime(slot)}
                      style={{
                        display:      'flex',
                        alignItems:   'center',
                        gap:          5,
                        padding:      '8px 16px',
                        borderRadius: 10,
                        border:       `1.5px solid ${time === slot ? 'var(--brand)' : 'var(--border)'}`,
                        background:   time === slot ? 'var(--brand-soft)' : 'var(--surface)',
                        color:        time === slot ? 'var(--brand)' : 'var(--text)',
                        fontWeight:   time === slot ? 700 : 500,
                        fontSize: 'var(--text-base-sz)',
                        cursor:       'pointer',
                        transition:   'all 120ms',
                      }}
                    >
                      <Clock size={12} />
                      {slot}
                    </button>
                  ))}
                  </div>
                  </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-faint)', padding: '16px 0' }}>
                  Nenhum horário disponível para esta data.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* --- Step 4: Confirmar ------------------------------------- */}
      {step === 4 && procedure && prof && date && time && (
        <div>
          <p style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)', marginBottom: 20 }}>
            Confirme os detalhes do seu agendamento.
          </p>

          <div className="card" style={{ padding: '20px 22px', marginBottom: 24 }}>
            {unidades.length > 1 && unidade && <Row label="Unidade" value={unidade} />}
            <Row label="Procedimento" value={procedure.name} />
            <Row label="Profissional"  value={prof.id ? prof.name : 'A clínica escolhe quem estiver livre'} />
            <Row label="Data"          value={fmtDate(date)} />
            <Row label="Horário"       value={time} />
            <Row label="Duração"       value={`${procedure.duration_min} min`} />
            <Row label="Valor"         value={procedure.jaPago ?? fmtPrice(procedure.price)} accent />
          </div>

          {/* A52 da 8ª: o agendamento dentro do prazo do app nascia "Prazo do
              app encerrado" — o Confirmar avisa ANTES. */}
          {prazoHoras != null && prazoHoras > 0 && date && time
            && new Date(`${date}T${time.padStart(5, '0')}:00-03:00`).getTime() - abertoEm < prazoHoras * 3_600_000 && (
            <p data-dentro-do-prazo style={{
              color: 'var(--text)', background: 'var(--warning-soft)', borderRadius: 'var(--radius-field-token)',
              padding: '10px 14px', fontSize: 'var(--text-sm-sz)', marginBottom: 16, lineHeight: 1.45,
            }}>
              {/* A52 da 12ª: a Sabrina leu e não entendeu — a frase diz o que acontece com ESTE agendamento. */}
              Este horário fica a menos de {prazoHoras} horas: o agendamento nasce sem cancelar nem remarcar pelo app (pelo app, só até {prazoHoras} horas antes).
              Depois de confirmar, para mudar, fale com a clínica.
            </p>
          )}

          {error && (
            <p style={{
              color:        'var(--warning)',
              background:   'var(--warning-soft)',
              borderRadius: 8,
              padding:      '10px 14px',
              fontSize: 'var(--text-base-sz)',
              fontWeight:   700,
              marginBottom: 16,
            }}>
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center', fontSize: 'var(--text-base-sz)' }}
          >
            {isPending ? 'Agendando…' : 'Confirmar agendamento'}
          </button>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      display:        'flex',
      justifyContent: 'space-between',
      alignItems:     'center',
      padding:        '9px 0',
      borderBottom:   '1px solid var(--hairline)',
    }}>
      <span style={{ fontSize: 'var(--text-base-sz)', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
      <span style={{
        fontSize: 'var(--text-base-sz)',
        fontWeight: accent ? 800 : 600,
        color:      accent ? 'var(--brand)' : 'var(--text)',
      }}>
        {value}
      </span>
    </div>
  )
}
