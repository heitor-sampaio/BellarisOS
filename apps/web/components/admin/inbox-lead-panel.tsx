'use client'

import { useEffect, useState, useTransition } from 'react'
import { Plus, UserCheck, ExternalLink, CalendarPlus, X, Check } from 'lucide-react'
import { LEAD_SOURCES, sourceStyle } from '@estetica-os/utils'
import { TagBadge } from '@/components/shared/tag-badge'
import {
  getLeadForConversation,
  type Conversation,
  type InboxLead,
  type InboxStage,
} from '@/actions/inbox'
import { updateLead, updateLeadStage, convertLeadToClient } from '@/actions/leads'
import {
  getCrmSchedulingData,
  getCrmSlots,
  createCrmAppointment,
  type CrmSchedulingData,
} from '@/actions/crm-scheduling'

const SLUG = '__admin__' // o inbox vive em /admin/crm

export interface PanelBranch { id: string; name: string; slug: string }

const labelStyle: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)',
  letterSpacing: '0.05em', textTransform: 'uppercase',
}

function todayInSP(): string {
  // 'en-CA' devolve YYYY-MM-DD
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

export function InboxLeadPanel({
  conversation,
  canEdit,
  branches,
  onLeadChanged,
}: {
  conversation:   Conversation
  canEdit:        boolean
  branches:       PanelBranch[]
  onLeadChanged?: () => void
}) {
  const [lead,    setLead]    = useState<InboxLead | null>(null)
  const [stages,  setStages]  = useState<InboxStage[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  startSave]  = useTransition()
  const [converting, startConvert] = useTransition()
  const [scheduling, setScheduling] = useState(false)

  // Campos editáveis
  const [name,   setName]   = useState('')
  const [phone,  setPhone]  = useState('')
  const [email,  setEmail]  = useState('')
  const [social, setSocial] = useState('')
  const [source, setSource] = useState('')
  const [notes,  setNotes]  = useState('')
  const [stageId, setStageId] = useState('')
  const [tags,   setTags]   = useState<string[]>([])
  const [tagDraft, setTagDraft] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setScheduling(false)
    getLeadForConversation(conversation.id).then(res => {
      if (!active) return
      setStages(res.stages)
      setLead(res.lead)
      if (res.lead) {
        setName(res.lead.name ?? '')
        setPhone(res.lead.phone ?? '')
        setEmail(res.lead.email ?? '')
        setSocial(res.lead.social_media ?? '')
        setSource(res.lead.source ?? '')
        setNotes(res.lead.notes ?? '')
        setStageId(res.lead.crm_stage_id ?? '')
        setTags(res.lead.tags ?? [])
      }
      setLoading(false)
    })
    return () => { active = false }
  }, [conversation.id])

  function addTag(raw: string) {
    const t = raw.trim()
    if (!t || tags.includes(t)) return
    setTags(prev => [...prev, t])
    setTagDraft('')
  }
  function removeTag(t: string) {
    setTags(prev => prev.filter(x => x !== t))
  }

  function handleSave() {
    if (!lead) return
    const fd = new FormData()
    fd.set('_leadId', lead.id)
    fd.set('_slug', SLUG)
    fd.set('name', name)
    fd.set('phone', phone)
    fd.set('email', email)
    fd.set('social_media', social)
    fd.set('source', source)
    fd.set('notes', notes)
    fd.set('crm_stage_id', stageId)
    fd.set('tags', JSON.stringify(tags))
    fd.set('procedure_ids', JSON.stringify(lead.procedure_ids))
    startSave(async () => {
      await updateLead(undefined, fd)
      onLeadChanged?.()
    })
  }

  function handleStageChange(next: string) {
    if (!lead) return
    setStageId(next)
    startSave(async () => {
      await updateLeadStage(lead.id, next, SLUG)
      onLeadChanged?.()
    })
  }

  function handleConvert() {
    if (!lead) return
    startConvert(async () => {
      await convertLeadToClient(lead.id, SLUG)
      const res = await getLeadForConversation(conversation.id)
      setLead(res.lead)
      onLeadChanged?.()
    })
  }

  const tagSuggestions = LEAD_SOURCES.map(s => s.key).filter(k => !tags.includes(k))

  if (loading) {
    return <div style={{ padding: 20, fontSize: 12.5, color: 'var(--text-faint)' }}>Carregando card…</div>
  }

  // Conversa sem card (fallback — normalmente a auto-criação já gera o lead)
  if (!lead) {
    return (
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={labelStyle}>Card do lead</span>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
          {conversation.contact_name ?? 'Sem nome'}
        </p>
        {conversation.contact_phone && (
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{conversation.contact_phone}</p>
        )}
        <p style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.5, marginTop: 6 }}>
          Esta conversa ainda não tem um card no funil.
        </p>
      </div>
    )
  }

  const disabled = !canEdit
  const fieldStyle: React.CSSProperties = { fontSize: 13 }

  return (
    <div style={{ padding: '18px 18px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={labelStyle}>Card do lead</span>
        <a href="/admin/crm" title="Ver no funil"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--brand)' }}>
          Funil <ExternalLink size={12} />
        </a>
      </div>

      {/* Ações rápidas */}
      {!disabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" className="btn-primary" onClick={() => setScheduling(true)}>
            <CalendarPlus size={14} /> Novo agendamento
          </button>
          {lead.client_id ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center', fontSize: 12.5, fontWeight: 700, color: 'var(--success)' }}>
              <UserCheck size={14} /> Já é cliente
            </span>
          ) : (
            <button type="button" className="btn-secondary" onClick={handleConvert} disabled={converting}>
              <UserCheck size={14} /> {converting ? 'Convertendo…' : 'Converter em cliente'}
            </button>
          )}
        </div>
      )}

      {/* Origem */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={labelStyle}>Origem</span>
        {source
          ? <TagBadge label={source} style={sourceStyle(source)} size="sm" />
          : <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Não informado</span>}
        <select className="field" value={source} disabled={disabled} onChange={e => setSource(e.target.value)} style={fieldStyle}>
          <option value="">Não informado</option>
          {LEAD_SOURCES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

      {/* Tags */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={labelStyle}>Tags</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {tags.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Nenhuma tag</span>}
          {tags.map(t => (
            <TagBadge key={t} label={t} size="xs" onRemove={disabled ? undefined : () => removeTag(t)} />
          ))}
        </div>
        {!disabled && (
          <>
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="field" value={tagDraft} placeholder="Nova tag (ex.: Unidade: Centro)"
                onChange={e => setTagDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagDraft) } }}
                style={{ ...fieldStyle, flex: 1 }} />
              <button type="button" className="btn-secondary" onClick={() => addTag(tagDraft)} style={{ flexShrink: 0, padding: '0 10px' }}>
                <Plus size={14} />
              </button>
            </div>
            {tagSuggestions.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {tagSuggestions.map(s => (
                  <button key={s} type="button" onClick={() => addTag(s)}
                    style={{
                      fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                      border: '1px dashed var(--border)', background: 'var(--bg-app)', color: 'var(--text-muted)', cursor: 'pointer',
                    }}>
                    + {s}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Etapa */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={labelStyle}>Etapa</span>
        <select className="field" value={stageId} disabled={disabled} onChange={e => handleStageChange(e.target.value)} style={fieldStyle}>
          <option value="">—</option>
          {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* Contato */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={labelStyle}>Contato</span>
        <input className="field" value={name}   disabled={disabled} placeholder="Nome"        onChange={e => setName(e.target.value)}   style={fieldStyle} />
        <input className="field" value={phone}  disabled={disabled} placeholder="Telefone"    onChange={e => setPhone(e.target.value)}  style={fieldStyle} />
        <input className="field" value={email}  disabled={disabled} placeholder="E-mail"      onChange={e => setEmail(e.target.value)}  style={fieldStyle} />
        <input className="field" value={social} disabled={disabled} placeholder="Rede social" onChange={e => setSocial(e.target.value)} style={fieldStyle} />
      </div>

      {/* Observações */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={labelStyle}>Observações</span>
        <textarea className="field" value={notes} disabled={disabled} rows={3}
          placeholder="Anotações sobre o lead…" onChange={e => setNotes(e.target.value)}
          style={{ ...fieldStyle, resize: 'vertical' }} />
      </div>

      {/* Salvar */}
      {!disabled && (
        <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      )}

      {scheduling && lead && (
        <ScheduleModal
          leadId={lead.id}
          branches={branches}
          onClose={() => setScheduling(false)}
          onScheduled={() => { setScheduling(false); onLeadChanged?.() }}
        />
      )}
    </div>
  )
}

// --- Modal de agendamento ----------------------------------------------------

function ScheduleModal({
  leadId, branches, onClose, onScheduled,
}: {
  leadId:      string
  branches:    PanelBranch[]
  onClose:     () => void
  onScheduled: () => void
}) {
  const [branchId,   setBranchId]   = useState(branches[0]?.id ?? '')
  const [data,       setData]       = useState<CrmSchedulingData | null>(null)
  const [loadingData, setLoadingData] = useState(false)
  const [isEvaluation, setIsEvaluation] = useState(false)
  const [procedureId, setProcedureId] = useState('')
  const [professionalId, setProfessionalId] = useState('')
  const [roomId,     setRoomId]     = useState('')
  const [date,       setDate]       = useState(todayInSP())
  const [slots,      setSlots]      = useState<string[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [slot,       setSlot]       = useState('')
  const [saving,     startSave]     = useTransition()
  const [error,      setError]      = useState<string | null>(null)

  const durationMin = isEvaluation
    ? 60
    : (data?.procedures.find(p => p.id === procedureId)?.duration_min ?? 60)

  // Carrega profissionais/procedimentos/salas da filial
  useEffect(() => {
    if (!branchId) { setData(null); return }
    let active = true
    setLoadingData(true)
    setData(null); setProcedureId(''); setProfessionalId(''); setRoomId(''); setSlots([]); setSlot('')
    getCrmSchedulingData(branchId).then(d => { if (active) { setData(d); setLoadingData(false) } })
    return () => { active = false }
  }, [branchId])

  // Carrega horários livres
  useEffect(() => {
    const ready = branchId && professionalId && date && (isEvaluation || procedureId)
    if (!ready) { setSlots([]); return }
    let active = true
    setLoadingSlots(true); setSlot('')
    getCrmSlots(branchId, professionalId, date, durationMin).then(s => { if (active) { setSlots(s); setLoadingSlots(false) } })
    return () => { active = false }
  }, [branchId, professionalId, date, procedureId, isEvaluation, durationMin])

  function handleSubmit() {
    setError(null)
    if (!branchId)                        { setError('Selecione a unidade.'); return }
    if (!professionalId)                  { setError('Selecione o profissional.'); return }
    if (!isEvaluation && !procedureId)    { setError('Selecione o procedimento.'); return }
    if (!slot)                            { setError('Selecione um horário.'); return }

    const scheduledAt = new Date(`${date}T${slot}:00-03:00`).toISOString()
    startSave(async () => {
      const res = await createCrmAppointment({
        leadId,
        branchId,
        professionalId,
        procedureId: isEvaluation ? null : procedureId,
        scheduledAt,
        roomId: roomId || null,
        isEvaluation,
      })
      if (res.error) { setError(res.error); return }
      onScheduled()
    })
  }

  const selectStyle: React.CSSProperties = { fontSize: 13, width: '100%' }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={onClose}
    >
      <div className="card" style={{ width: 400, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 0 }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Novo agendamento</h3>
          <button type="button" onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--bg-app)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)',
          }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Unidade */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={labelStyle}>Unidade</span>
            <select className="field" value={branchId} onChange={e => setBranchId(e.target.value)} style={selectStyle}>
              {branches.length === 0 && <option value="">Nenhuma filial</option>}
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>

          {/* Avaliação */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={isEvaluation} onChange={e => setIsEvaluation(e.target.checked)} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Consulta de avaliação</span>
          </label>

          {/* Procedimento */}
          {!isEvaluation && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={labelStyle}>Procedimento</span>
              <select className="field" value={procedureId} disabled={loadingData} onChange={e => setProcedureId(e.target.value)} style={selectStyle}>
                <option value="">{loadingData ? 'Carregando…' : 'Selecione…'}</option>
                {data?.procedures.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}

          {/* Profissional */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={labelStyle}>Profissional</span>
            <select className="field" value={professionalId} disabled={loadingData} onChange={e => setProfessionalId(e.target.value)} style={selectStyle}>
              <option value="">{loadingData ? 'Carregando…' : 'Selecione…'}</option>
              {data?.professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>

          {/* Sala (opcional) */}
          {data && data.rooms.length > 0 && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={labelStyle}>Sala (opcional)</span>
              <select className="field" value={roomId} onChange={e => setRoomId(e.target.value)} style={selectStyle}>
                <option value="">Nenhuma</option>
                {data.rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
          )}

          {/* Data */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={labelStyle}>Dia</span>
            <input type="date" className="field" value={date} onChange={e => setDate(e.target.value)} style={selectStyle} />
          </label>

          {/* Horários */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={labelStyle}>Horário</span>
            {loadingSlots ? (
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Carregando horários…</span>
            ) : slots.length === 0 ? (
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                {professionalId && (isEvaluation || procedureId) ? 'Sem horários livres neste dia.' : 'Escolha profissional e procedimento.'}
              </span>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {slots.map(h => (
                  <button key={h} type="button" onClick={() => setSlot(h)}
                    style={{
                      fontSize: 12, fontWeight: 700, padding: '5px 11px', borderRadius: 99, cursor: 'pointer',
                      border: slot === h ? '1.5px solid var(--brand)' : '1.5px solid var(--border)',
                      background: slot === h ? 'var(--brand-soft)' : 'var(--bg-app)',
                      color: slot === h ? 'var(--brand)' : 'var(--text-muted)',
                    }}>
                    {h}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && (
            <p style={{ fontSize: 12, color: 'var(--warning)', background: 'var(--warning-soft)', borderRadius: 8, padding: '8px 12px', fontWeight: 700 }}>
              {error}
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="button" className="btn-primary" onClick={handleSubmit} disabled={saving || !slot}>
              <Check size={14} /> {saving ? 'Agendando…' : 'Agendar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
