'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Zap, Clock, RefreshCw, Gift, CalendarHeart, UserX, Package,
  Bell, CheckCircle2, CalendarDays, Star, Sparkles, AlertCircle, ChevronRight, ChevronLeft,
  AlarmClock,
} from 'lucide-react'
import { createCampaign, activateCampaign } from '@/actions/notification-campaigns'
import { AudiencePreview } from '@/components/admin/audience-preview'
import type { CampaignType, TriggerType, AudienceRules, CreateCampaignInput } from '@/actions/notification-campaigns'

// -- Types --------------------------------------------------------------

type Branch    = { id: string; name: string; city: string | null }
type Procedure = { id: string; name: string; category: string | null }

const NOTIF_TYPES = [
  { value: 'promotion',             label: 'Promoção',      Icon: Sparkles,    color: '#f59e0b' },
  { value: 'general',               label: 'Geral',         Icon: Bell,        color: 'var(--text-muted)' },
  { value: 'appointment_reminder',  label: 'Lembrete',      Icon: CalendarDays,color: 'var(--brand)' },
  { value: 'points_earned',         label: 'Pontos',        Icon: Star,        color: '#f59e0b' },
  { value: 'package_activated',     label: 'Pacote',        Icon: Package,     color: 'var(--brand)' },
  { value: 'appointment_confirmed', label: 'Confirmação',   Icon: CheckCircle2,color: '#22c55e' },
  { value: 'appointment_cancelled', label: 'Cancelamento',  Icon: AlertCircle, color: '#ef4444' },
]

// -- Main Component -----------------------------------------------------

interface Props {
  branches:   Branch[]
  procedures: Procedure[]
}

type Step = 1 | 2 | 3 | 4

export function NotificationCampaignForm({ branches, procedures }: Props) {
  const router = useRouter()
  const [step, setStep]           = useState<Step>(1)
  const [isPending, startTransition] = useTransition()
  const [error, setError]         = useState<string | null>(null)

  // Step 1
  const [campType,      setCampType]      = useState<CampaignType>('IMMEDIATE')
  const [triggerType,   setTriggerType]   = useState<TriggerType>('BIRTHDAY')
  const [scheduledAt,   setScheduledAt]   = useState('')
  const [triggerDays,   setTriggerDays]   = useState(30)
  const [triggerHours,  setTriggerHours]  = useState(24)
  const [annualMonth,   setAnnualMonth]   = useState(3)
  const [annualDay,     setAnnualDay]     = useState(8)

  // Step 2
  const [name,          setName]          = useState('')
  const [title,         setTitle]         = useState('')
  const [body,          setBody]          = useState('')
  const [notifType,     setNotifType]     = useState('promotion')

  // Step 3 — audience
  const [branchIds,     setBranchIds]     = useState<string[]>([])
  const [genders,       setGenders]       = useState<('M'|'F'|'O')[]>([])
  const [procIds,       setProcIds]       = useState<string[]>([])
  const [tags,          setTags]          = useState<string[]>([])
  const [tagInput,      setTagInput]      = useState('')
  const [hasApp,        setHasApp]        = useState(false)
  const [maxDays,       setMaxDays]       = useState<number | null>(null)

  const audienceRules: AudienceRules = {
    ...(branchIds.length   && { branch_ids: branchIds }),
    ...(genders.length     && { genders }),
    ...(procIds.length     && { procedure_ids: procIds }),
    ...(tags.length        && { tags }),
    ...(hasApp             && { has_app_account: true }),
    ...(maxDays            && { max_days_since_visit: maxDays }),
  }

  const previewTitle = title.replace(/\{\{first_name\}\}/g, 'Ana')

  function getTriggerConfig(): Record<string, unknown> | undefined {
    if (campType !== 'AUTOMATED') return undefined
    if (triggerType === 'ANNUAL_DATE')       return { month: annualMonth, day: annualDay }
    if (triggerType === 'BIRTHDAY')          return undefined
    if (triggerType === 'BEFORE_APPOINTMENT') return { hours: triggerHours }
    return { days: triggerDays }
  }

  function canAdvance(): boolean {
    if (step === 1) {
      if (campType === 'SCHEDULED' && !scheduledAt) return false
      return true
    }
    if (step === 2) return name.trim().length > 0 && title.trim().length > 0 && body.trim().length > 0
    return true
  }

  function handleSubmit(activate: boolean) {
    setError(null)
    startTransition(async () => {
      const input: CreateCampaignInput = {
        name,
        type:              campType,
        title,
        body,
        notification_type: notifType,
        audience_rules:    audienceRules,
        channels:          ['in_app'],
        ...(campType === 'SCHEDULED' && { scheduled_at: scheduledAt }),
        ...(campType === 'AUTOMATED' && {
          trigger_type:   triggerType,
          trigger_config: getTriggerConfig(),
        }),
      }

      const res = await createCampaign(input)
      if ('error' in res) { setError(res.error); return }

      if (activate) {
        const actRes = await activateCampaign(res.id)
        if (actRes.error) { setError(actRes.error); return }
      }

      router.push('/admin/notificacoes')
    })
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      {/* -- Step indicator --------------------------------------- */}
      <StepIndicator current={step} total={4} labels={['Tipo', 'Conteúdo', 'Público', 'Revisar']} />

      {/* -- Step 1: Type & Trigger ------------------------------- */}
      {step === 1 && (
        <div className="card" style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <h2 className="card-title">Tipo de campanha</h2>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {([
              { type: 'IMMEDIATE', label: 'Imediata',   desc: 'Disparada agora para todos os clientes selecionados', Icon: Zap,       color: '#7c3aed' },
              { type: 'SCHEDULED', label: 'Agendada',   desc: 'Disparada em uma data e hora específica',              Icon: Clock,     color: '#0284c7' },
              { type: 'AUTOMATED', label: 'Automática', desc: 'Recorrente, disparada por evento ou data',             Icon: RefreshCw, color: 'var(--brand)' },
            ] as { type: CampaignType; label: string; desc: string; Icon: React.ElementType; color: string }[]).map(opt => (
              <button
                key={opt.type}
                type="button"
                onClick={() => setCampType(opt.type)}
                style={{
                  flex:          '1 1 180px',
                  padding:       '18px 20px',
                  borderRadius:  12,
                  border:        campType === opt.type ? `2px solid ${opt.color}` : '1px solid var(--border)',
                  background:    campType === opt.type ? `${opt.color}0f` : 'var(--surface)',
                  cursor:        'pointer',
                  textAlign:     'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <opt.Icon size={18} color={opt.color} />
                  <span style={{ fontWeight: 800, fontSize: 14, color: campType === opt.type ? opt.color : 'var(--text)' }}>
                    {opt.label}
                  </span>
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.4 }}>{opt.desc}</p>
              </button>
            ))}
          </div>

          {/* Scheduled: datetime */}
          {campType === 'SCHEDULED' && (
            <div>
              <SectionLabel>Data e hora do disparo</SectionLabel>
              <input
                type="datetime-local"
                className="field"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                style={{ maxWidth: 280 }}
              />
            </div>
          )}

          {/* Automated: trigger selector */}
          {campType === 'AUTOMATED' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <SectionLabel>Gatilho da automação</SectionLabel>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {([
                  { t: 'BIRTHDAY',           label: 'Aniversário',        desc: 'No dia do aniversário do cliente',          Icon: Gift },
                  { t: 'ANNUAL_DATE',        label: 'Data comemorativa',  desc: 'Toda vez que uma data específica chegar',   Icon: CalendarHeart },
                  { t: 'BEFORE_APPOINTMENT', label: 'Lembrete de agenda', desc: 'N horas antes do agendamento confirmado',   Icon: AlarmClock },
                  { t: 'DAYS_AFTER_VISIT',   label: 'Pós-visita',         desc: 'N dias após o último atendimento',          Icon: CalendarDays },
                  { t: 'DAYS_BEFORE_EXPIRY', label: 'Venc. de pacote',    desc: 'N dias antes do pacote vencer',             Icon: Package },
                ] as { t: TriggerType; label: string; desc: string; Icon: React.ElementType }[]).map(opt => (
                  <button
                    key={opt.t}
                    type="button"
                    onClick={() => setTriggerType(opt.t)}
                    style={{
                      flex:        '1 1 140px',
                      padding:     '14px 16px',
                      borderRadius: 10,
                      border:      triggerType === opt.t ? '2px solid var(--brand)' : '1px solid var(--border)',
                      background:  triggerType === opt.t ? 'var(--brand-soft)' : 'var(--surface)',
                      cursor:      'pointer',
                      textAlign:   'left',
                    }}
                  >
                    <opt.Icon size={16} color={triggerType === opt.t ? 'var(--brand)' : 'var(--text-muted)'} style={{ marginBottom: 6 }} />
                    <p style={{ fontSize: 13, fontWeight: 800, color: triggerType === opt.t ? 'var(--brand)' : 'var(--text)', marginBottom: 3 }}>
                      {opt.label}
                    </p>
                    <p style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.3 }}>{opt.desc}</p>
                  </button>
                ))}
              </div>

              {(triggerType === 'DAYS_AFTER_VISIT' || triggerType === 'DAYS_BEFORE_EXPIRY') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <SectionLabel style={{ marginBottom: 0 }}>
                    {triggerType === 'DAYS_AFTER_VISIT' ? 'Dias após visita' : 'Dias antes do vencimento'}
                  </SectionLabel>
                  <input
                    type="number"
                    className="field"
                    value={triggerDays}
                    min={1}
                    max={365}
                    onChange={e => setTriggerDays(Number(e.target.value))}
                    style={{ width: 80 }}
                  />
                </div>
              )}

              {triggerType === 'BEFORE_APPOINTMENT' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <SectionLabel style={{ marginBottom: 0 }}>Enviar quantas horas antes?</SectionLabel>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[2, 6, 12, 24, 48].map(h => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setTriggerHours(h)}
                        style={{
                          padding: '6px 14px', borderRadius: 8,
                          border:     triggerHours === h ? '2px solid var(--brand)' : '1px solid var(--border)',
                          background: triggerHours === h ? 'var(--brand-soft)' : 'var(--surface)',
                          color:      triggerHours === h ? 'var(--brand)' : 'var(--text-muted)',
                          fontWeight: 700, fontSize: 13, cursor: 'pointer',
                        }}
                      >
                        {h}h
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {triggerType === 'ANNUAL_DATE' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <SectionLabel style={{ marginBottom: 0 }}>Data anual (mês / dia)</SectionLabel>
                  <select className="field" value={annualMonth} onChange={e => setAnnualMonth(Number(e.target.value))} style={{ width: 130 }}>
                    {['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
                      .map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                  <input
                    type="number"
                    className="field"
                    value={annualDay}
                    min={1}
                    max={31}
                    onChange={e => setAnnualDay(Number(e.target.value))}
                    style={{ width: 70 }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* -- Step 2: Content -------------------------------------- */}
      {step === 2 && (
        <div className="card" style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <h2 className="card-title">Conteúdo da notificação</h2>

          <div>
            <SectionLabel>Nome interno da campanha</SectionLabel>
            <input className="field" placeholder="ex: Aniversariantes de julho" value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div>
            <SectionLabel>Título <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(suporta {'{{first_name}}'})</span></SectionLabel>
            <input
              className="field"
              placeholder="ex: Feliz aniversário, {{first_name}}! 🎂"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
            {title && (
              <p style={{ marginTop: 5, fontSize: 12, color: 'var(--brand)', fontWeight: 600 }}>
                Preview: {previewTitle}
              </p>
            )}
          </div>

          <div>
            <SectionLabel>Mensagem</SectionLabel>
            <textarea
              className="field"
              rows={4}
              placeholder="ex: Como presente, preparamos um desconto especial de 15% em qualquer procedimento este mês."
              value={body}
              onChange={e => setBody(e.target.value)}
              style={{ resize: 'vertical' }}
            />
          </div>

          <div>
            <SectionLabel>Tipo de notificação (ícone / cor)</SectionLabel>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {NOTIF_TYPES.map(opt => {
                const active = notifType === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setNotifType(opt.value)}
                    style={{
                      display:      'flex', alignItems: 'center', gap: 6,
                      padding:      '7px 14px', borderRadius: 8,
                      border:       active ? `2px solid ${opt.color}` : '1px solid var(--border)',
                      background:   active ? `${opt.color}18` : 'var(--surface)',
                      cursor:       'pointer', fontSize: 13, fontWeight: 700,
                      color:        active ? opt.color : 'var(--text-muted)',
                    }}
                  >
                    <opt.Icon size={13} />
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* -- Step 3: Audience ------------------------------------- */}
      {step === 3 && (
        <div className="card" style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Segmentação de público</h2>
            <AudiencePreview rules={audienceRules} />
          </div>

          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: -8 }}>
            Todos os filtros são opcionais. Deixe em branco para atingir todos os clientes ativos.
          </p>

          {/* Branches */}
          <div>
            <SectionLabel>Filiais</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {branches.map(b => (
                <CheckRow
                  key={b.id}
                  label={b.name}
                  sub={b.city ?? undefined}
                  checked={branchIds.includes(b.id)}
                  onChange={v => setBranchIds(v ? [...branchIds, b.id] : branchIds.filter(x => x !== b.id))}
                />
              ))}
            </div>
            {branchIds.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4 }}>Nenhuma selecionada = todas as filiais</p>
            )}
          </div>

          {/* Gender */}
          <div>
            <SectionLabel>Gênero</SectionLabel>
            <div style={{ display: 'flex', gap: 8 }}>
              {([['M', 'Masculino'], ['F', 'Feminino'], ['O', 'Outro']] as [string, string][]).map(([v, lbl]) => {
                const sel = genders.includes(v as 'M'|'F'|'O')
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setGenders(sel ? genders.filter(x => x !== v) as ('M'|'F'|'O')[] : [...genders, v as 'M'|'F'|'O'])}
                    style={{
                      padding: '7px 14px', borderRadius: 8,
                      border:     sel ? '2px solid var(--brand)' : '1px solid var(--border)',
                      background: sel ? 'var(--brand-soft)' : 'var(--surface)',
                      color:      sel ? 'var(--brand)' : 'var(--text-muted)',
                      fontWeight: 700, fontSize: 13, cursor: 'pointer',
                    }}
                  >
                    {lbl}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Procedures */}
          <div>
            <SectionLabel>Histórico de procedimentos (clientes que já fizeram)</SectionLabel>
            <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 0' }}>
              {procedures.map(p => (
                <CheckRow
                  key={p.id}
                  label={p.name}
                  sub={p.category ?? undefined}
                  checked={procIds.includes(p.id)}
                  onChange={v => setProcIds(v ? [...procIds, p.id] : procIds.filter(x => x !== p.id))}
                  indent
                />
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            <SectionLabel>Tags do CRM</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {tags.map(t => (
                <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99, background: 'var(--brand-soft)', color: 'var(--brand)', fontSize: 12, fontWeight: 700 }}>
                  {t}
                  <button type="button" onClick={() => setTags(tags.filter(x => x !== t))} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: 'inherit' }}>×</button>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="field"
                placeholder="Digitar tag e pressionar Enter"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && tagInput.trim()) {
                    e.preventDefault()
                    const t = tagInput.trim()
                    if (!tags.includes(t)) setTags([...tags, t])
                    setTagInput('')
                  }
                }}
                style={{ flex: 1 }}
              />
            </div>
          </div>

          {/* Has app account */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={hasApp}
              onChange={e => setHasApp(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--brand)' }}
            />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
              Apenas clientes com conta no app
            </span>
          </label>

          {/* Max days since visit */}
          <div>
            <SectionLabel>Sem visita há mais de N dias (reengajamento)</SectionLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="number"
                className="field"
                value={maxDays ?? ''}
                min={1}
                placeholder="ex: 60"
                onChange={e => setMaxDays(e.target.value ? Number(e.target.value) : null)}
                style={{ width: 80 }}
              />
              {maxDays && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>dias</span>}
            </div>
          </div>
        </div>
      )}

      {/* -- Step 4: Review --------------------------------------- */}
      {step === 4 && (
        <div className="card" style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <h2 className="card-title">Revisar campanha</h2>

          <ReviewRow label="Nome"       value={name} />
          <ReviewRow label="Tipo"       value={{ IMMEDIATE: 'Imediata', SCHEDULED: 'Agendada', AUTOMATED: 'Automática' }[campType]} />
          {campType === 'SCHEDULED' && scheduledAt && (
            <ReviewRow label="Agendada para" value={new Date(scheduledAt).toLocaleString('pt-BR')} />
          )}
          {campType === 'AUTOMATED' && (
            <ReviewRow label="Gatilho" value={{
              BIRTHDAY: 'Aniversário do cliente',
              ANNUAL_DATE: `${annualDay}/${annualMonth} todo ano`,
              DAYS_AFTER_VISIT: `${triggerDays} dias após última visita`,
              DAYS_BEFORE_EXPIRY: `${triggerDays} dias antes do vencimento`,
              BEFORE_APPOINTMENT: `${triggerHours}h antes do agendamento`,
            }[triggerType]} />
          )}
          <ReviewRow label="Título"     value={previewTitle} />
          <ReviewRow label="Mensagem"   value={body} />
          <ReviewRow label="Canal"      value="In-app (sino do portal do cliente)" />

          <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 16 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
              Público estimado
            </p>
            <AudiencePreview rules={audienceRules} />
          </div>

          {error && (
            <p style={{ color: '#ef4444', background: '#ef444418', borderRadius: 8, padding: '10px 14px', fontSize: 13, fontWeight: 700 }}>
              {error}
            </p>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-secondary"
              disabled={isPending}
              onClick={() => handleSubmit(false)}
            >
              {isPending ? 'Salvando…' : 'Salvar rascunho'}
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={isPending}
              onClick={() => handleSubmit(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {isPending ? 'Aguarde…' : campType === 'IMMEDIATE' ? 'Ativar e enviar agora' : campType === 'SCHEDULED' ? 'Agendar envio' : 'Ativar automação'}
            </button>
          </div>
        </div>
      )}

      {/* -- Navigation ------------------------------------------- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
        <button
          type="button"
          className="btn-ghost"
          style={{ display: 'flex', alignItems: 'center', gap: 5, visibility: step > 1 ? 'visible' : 'hidden' }}
          onClick={() => setStep(s => (s - 1) as Step)}
        >
          <ChevronLeft size={15} />
          Voltar
        </button>
        {step < 4 && (
          <button
            type="button"
            className="btn-primary"
            disabled={!canAdvance()}
            style={{ display: 'flex', alignItems: 'center', gap: 5 }}
            onClick={() => setStep(s => (s + 1) as Step)}
          >
            Próximo
            <ChevronRight size={15} />
          </button>
        )}
      </div>
    </div>
  )
}

// -- Sub-components -----------------------------------------------------

function StepIndicator({ current, total, labels }: { current: number; total: number; labels: string[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28, gap: 0 }}>
      {Array.from({ length: total }, (_, i) => {
        const n    = i + 1
        const done = n < current
        const active = n === current
        return (
          <div key={n} style={{ display: 'flex', alignItems: 'center', flex: n < total ? 1 : 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 800,
                background: done ? 'var(--brand)' : active ? 'var(--brand)' : 'var(--surface)',
                border:     done || active ? 'none' : '2px solid var(--border)',
                color:      done || active ? '#fff' : 'var(--text-muted)',
              }}>
                {done ? '✓' : n}
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: active ? 'var(--brand)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {labels[i]}
              </span>
            </div>
            {n < total && (
              <div style={{ flex: 1, height: 2, background: done ? 'var(--brand)' : 'var(--border)', margin: '0 4px', marginBottom: 16 }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <p style={{
      fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
      textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8, ...style,
    }}>
      {children}
    </p>
  )
}

function CheckRow({ label, sub, checked, onChange, indent }: {
  label:    string
  sub?:     string
  checked:  boolean
  onChange: (v: boolean) => void
  indent?:  boolean
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: indent ? '7px 16px' : '7px 0', cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ width: 15, height: 15, accentColor: 'var(--brand)', flexShrink: 0 }}
      />
      <span style={{ fontSize: 13.5, fontWeight: checked ? 700 : 500, color: 'var(--text)' }}>
        {label}
        {sub && <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 12, marginLeft: 5 }}>· {sub}</span>}
      </span>
    </label>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, borderBottom: '1px solid var(--hairline)', paddingBottom: 12 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{value}</span>
    </div>
  )
}
