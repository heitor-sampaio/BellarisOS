'use client'

import { useEffect, useState, useTransition, useRef } from 'react'
import { UserCheck, ExternalLink, CalendarPlus, X, Check, Compass } from 'lucide-react'
import { LEAD_SOURCES, sourceStyle } from '@estetica-os/utils'
import { TagBadge } from '@/components/shared/tag-badge'
import { TagPicker } from '@/components/shared/tag-picker'
import { PickerCompacto } from '@/components/shared/picker-compacto'
import { StageOptions } from '@/components/branch/stage-options'
import { LeadTimeline } from '@/components/branch/lead-timeline'
import {
  getLeadForConversation,
  type Conversation,
  type InboxLead,
  type InboxStage,
} from '@/actions/inbox'
import { updateLead, updateLeadStage } from '@/actions/leads'
import { ClientForm } from '@/components/branch/client-form'
import {
  getCrmSchedulingData,
  getCrmSlots,
  createCrmAppointment,
  type CrmSchedulingData,
} from '@/actions/crm-scheduling'

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
  slug,
  onLeadChanged,
}: {
  conversation:   Conversation
  canEdit:        boolean
  branches:       PanelBranch[]
  /** Portal em que o painel está — revalidação e link de volta seguem daqui. */
  slug:           string
  onLeadChanged?: () => void
}) {
  const [lead,    setLead]    = useState<InboxLead | null>(null)
  const [stages,  setStages]  = useState<InboxStage[]>([])
  const [funnels, setFunnels] = useState<{ id: string; name: string }[]>([])
  // Sobe a cada alteração no lead, para o histórico recarregar.
  const [historicoKey, setHistoricoKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving,  startSave]  = useTransition()
  const [scheduling, setScheduling] = useState(false)
  const [convertOpen, setConvertOpen] = useState(false)
  const [chainToSchedule, setChainToSchedule] = useState(false)  // converter e emendar no agendamento

  // Campos editáveis
  const [name,   setName]   = useState('')
  const [phone,  setPhone]  = useState('')
  const [email,  setEmail]  = useState('')
  const [social, setSocial] = useState('')
  const [source, setSource] = useState('')
  const [notes,  setNotes]  = useState('')
  const [stageId, setStageId] = useState('')
  const [tags,   setTags]   = useState<string[]>([])
  /** Catálogo da rede: o card escolhe entre estas, e não cria tag nova. */
  const [tagsDaRede, setTagsDaRede] = useState<string[]>([])
  // Estado do salvamento automático.
  const [salvando,   setSalvando]   = useState(false)
  const [salvoEm,    setSalvoEm]    = useState<number | null>(null)
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setScheduling(false)
    getLeadForConversation(conversation.id).then(res => {
      if (!active) return
      setStages(res.stages)
      setFunnels(res.funnels)
      setTagsDaRede(res.tagsDaRede ?? [])
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

        // Marca o que o servidor JÁ tem, senão o salvamento automático dispara
        // no instante em que o card abre e grava de volta o que acabou de ler.
        // Os campos e a ordem têm que bater com `estadoAtual`.
        salvoRef.current = JSON.stringify({
          name:   res.lead.name ?? '',
          phone:  res.lead.phone ?? '',
          email:  res.lead.email ?? '',
          social: res.lead.social_media ?? '',
          source: res.lead.source ?? '',
          notes:  res.lead.notes ?? '',
          stageId: res.lead.crm_stage_id ?? '',
          tags:   res.lead.tags ?? [],
        })
      }
      setSalvando(false)
      setSalvoEm(null)
      setErroSalvar(null)
      setConvertOpen(false)
      setLoading(false)
    })
    return () => { active = false }
  }, [conversation.id])

  function removeTag(t: string) {
    setTags(prev => prev.filter(x => x !== t))
  }

  // -- Salvamento automático --------------------------------------------------
  //
  // Não há botão: o card salva sozinho, como o resto do produto já faz com a
  // etapa. O que ele precisa garantir é que ninguém perca alteração — nem quem
  // digita e troca de conversa, nem quem fecha a aba.

  /** Assinatura do que está na tela. Muda = há o que salvar. */
  const estadoAtual = JSON.stringify({ name, phone, email, social, source, notes, stageId, tags })
  /** Assinatura do que o servidor já tem. */
  const salvoRef   = useRef('')
  /** Dados prontos para salvar, para o caso de precisar salvar na saída. */
  const pendenteRef = useRef<{ lead: InboxLead; fd: FormData } | null>(null)

  async function gravar(leadAtual: InboxLead, fd: FormData, assinatura: string) {
    const res = await updateLead(undefined, fd)
    pendenteRef.current = null
    if (res?.error) { setErroSalvar(res.error); setSalvando(false); return }
    salvoRef.current = assinatura
    setErroSalvar(null)
    setSalvando(false)
    setSalvoEm(Date.now())
    setHistoricoKey(k => k + 1)
    onLeadChanged?.()
  }

  useEffect(() => {
    if (loading || !lead || !canEdit) return
    if (estadoAtual === salvoRef.current) return

    const motivo = motivoParaNaoSalvar()
    if (motivo) { setErroSalvar(motivo); return }

    setErroSalvar(null)
    // Enquanto há alteração pendente, "Alterações salvas" seria mentira: volta
    // ao aviso neutro até a gravação acontecer de fato.
    setSalvoEm(null)
    const fd = montarFormData(lead)
    pendenteRef.current = { lead, fd }

    // Meio segundo depois da última tecla. Salvar a cada tecla inundaria o
    // servidor de escritas e de revalidações da rota.
    const t = setTimeout(() => {
      setSalvando(true)
      void gravar(lead, fd, estadoAtual)
    }, 500)

    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadoAtual, lead, loading, canEdit])

  // Trocar de conversa ou fechar a aba no meio do intervalo não pode engolir a
  // alteração: o que estiver pendente vai embora agora.
  useEffect(() => {
    function salvarPendente() {
      const p = pendenteRef.current
      if (!p) return
      pendenteRef.current = null
      void updateLead(undefined, p.fd)
    }
    window.addEventListener('beforeunload', salvarPendente)
    return () => {
      window.removeEventListener('beforeunload', salvarPendente)
      salvarPendente()
    }
  }, [conversation.id])

  /**
   * O que o servidor exige, verificado aqui antes de incomodá-lo.
   *
   * No salvamento automático isso não é redundância: apagar o nome para
   * reescrever passa por "nome vazio" a cada digitação, e sem a checagem local
   * cada letra viraria uma ida ao servidor que volta com erro. O estado
   * inválido é normal enquanto se edita — só não pode ser gravado.
   */
  function motivoParaNaoSalvar(): string | null {
    if (!name.trim()) return 'Informe o nome para salvar.'
    if (!phone.trim() && !email.trim() && !social.trim()) {
      return 'Informe telefone, e-mail ou rede social para salvar.'
    }
    return null
  }

  function montarFormData(leadAtual: InboxLead): FormData {
    const fd = new FormData()
    fd.set('_leadId', leadAtual.id)
    fd.set('_slug', slug)
    fd.set('name', name)
    fd.set('phone', phone)
    fd.set('email', email)
    fd.set('social_media', social)
    fd.set('source', source)
    fd.set('notes', notes)
    fd.set('crm_stage_id', stageId)
    fd.set('tags', JSON.stringify(tags))
    fd.set('procedure_ids', JSON.stringify(leadAtual.procedure_ids))
    return fd
  }

  function handleStageChange(next: string) {
    if (!lead) return
    setStageId(next)
    startSave(async () => {
      await updateLeadStage(lead.id, next, slug)
      setHistoricoKey(k => k + 1)
      onLeadChanged?.()
    })
  }

  // "Novo agendamento": se já é cliente, agenda direto; senão converte primeiro e emenda no agendamento.
  function handleScheduleClick() {
    if (!lead) return
    if (lead.client_id) {
      setScheduling(true)
    } else {
      setChainToSchedule(true)
      setConvertOpen(true)
    }
  }

  function handleConverted() {
    setConvertOpen(false)
    getLeadForConversation(conversation.id).then(res => setLead(res.lead))
    setHistoricoKey(k => k + 1)
    onLeadChanged?.()
    if (chainToSchedule) {
      setChainToSchedule(false)
      setScheduling(true)   // emenda no agendamento (o cliente já foi criado)
    }
  }

  function closeConvert() {
    setConvertOpen(false)
    setChainToSchedule(false)
  }


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
        {/* Volta para o quadro do portal em que a pessoa está. */}
        <a
          href={slug === '__admin__' ? '/admin/oportunidades' : `/${slug}/oportunidades`}
          title="Ver nas oportunidades"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--brand)' }}
        >
          Oportunidades <ExternalLink size={12} />
        </a>
      </div>

      {/* Ações rápidas */}
      {!disabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" className="btn-primary" onClick={handleScheduleClick}>
            <CalendarPlus size={14} /> Novo agendamento
          </button>
          {lead.client_id ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center', fontSize: 12.5, fontWeight: 700, color: 'var(--success)' }}>
              <UserCheck size={14} /> Já é cliente
            </span>
          ) : (
            <button type="button" className="btn-secondary" onClick={() => { setChainToSchedule(false); setConvertOpen(true) }}>
              <UserCheck size={14} /> Converter em cliente
            </button>
          )}
        </div>
      )}

      {/* Origem
          Mesma forma das tags: o valor atual à vista, as opções dentro do
          seletor. O select nativo mostrava a origem duas vezes — na etiqueta e
          repetida no campo — e ocupava uma linha inteira para um dado que quase
          nunca muda depois que o lead entra. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={labelStyle}>Origem</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
          {source
            ? <TagBadge
                label={LEAD_SOURCES.find(s => s.key === source)?.label ?? source}
                style={sourceStyle(source)}
                size="sm"
                onRemove={disabled ? undefined : () => setSource('')}
              />
            : <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Não informado</span>}
        </div>
        <PickerCompacto
          icone={<Compass size={12} />}
          rotuloBotao={source ? 'Alterar origem' : 'Definir origem'}
          opcoes={LEAD_SOURCES.map(s => ({ valor: s.key, rotulo: s.label }))}
          selecionadas={source ? [source] : []}
          disabled={disabled}
          textoListaVazia="Nenhuma origem cadastrada."
          onEscolher={setSource}
        />
      </div>

      {/* Tags
          Só as do lead ficam à vista; as disponíveis moram dentro do seletor.
          Antes o card despejava o catálogo inteiro aberto, e numa rede com
          dezenas de tags isso empurrava telefone, etapa e histórico para fora
          da tela — justamente o que se consulta durante um atendimento. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={labelStyle}>Tags</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
          {tags.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Nenhuma tag</span>}
          {tags.map(t => (
            <TagBadge key={t} label={t} size="xs" onRemove={disabled ? undefined : () => removeTag(t)} />
          ))}
        </div>
        <TagPicker
          selecionadas={tags}
          disponiveis={tagsDaRede}
          disabled={disabled}
          onChange={setTags}
        />
      </div>

      {/* Etapa */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={labelStyle}>Etapa</span>
        <select className="field" value={stageId} disabled={disabled} onChange={e => handleStageChange(e.target.value)} style={fieldStyle}>
          <option value="">—</option>
          <StageOptions funnels={funnels} stages={stages} />
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

      {/* Estado do salvamento automático.
          Salvar sem dizer nada deixa a dúvida de se salvou — e o erro de
          validação PRECISA aparecer, porque sem botão não há nada que a pessoa
          possa clicar para descobrir que o card não está sendo gravado. */}
      {!disabled && (
        <div style={{ minHeight: 18, display: 'flex', alignItems: 'center', gap: 5 }}>
          {erroSalvar ? (
            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#dc2626', lineHeight: 1.4 }}>
              {erroSalvar}
            </span>
          ) : salvando ? (
            <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>Salvando…</span>
          ) : salvoEm ? (
            <span style={{
              fontSize: 11.5, color: 'var(--success)', fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              <Check size={12} /> Alterações salvas
            </span>
          ) : (
            <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>
              As alterações salvam sozinhas
            </span>
          )}
        </div>
      )}

      {/* Histórico — quem atende pelo inbox precisa ver por onde o card passou
          sem ter que abrir o quadro. */}
      <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>
        <LeadTimeline leadId={lead.id} refreshKey={historicoKey} />
      </div>

      {scheduling && lead && (
        <ScheduleModal
          leadId={lead.id}
          branches={branches}
          onClose={() => setScheduling(false)}
          onScheduled={() => { setScheduling(false); onLeadChanged?.() }}
        />
      )}

      {convertOpen && lead && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
          onClick={closeConvert}
        >
          <div className="card" style={{ width: 480, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 0 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>
                {chainToSchedule ? 'Converter em cliente para agendar' : 'Converter em cliente'}
              </h3>
              <button type="button" onClick={closeConvert} style={{
                width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--bg-app)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)',
              }}>
                <X size={14} />
              </button>
            </div>
            <div style={{ padding: 20 }}>
              <ClientForm
                branchId=""
                slug={slug}
                branches={branches}
                leadId={lead.id}
                prefill={{ name: lead.name, phone: lead.phone ?? undefined, email: lead.email ?? undefined }}
                onSuccess={handleConverted}
                showCancelButton
                onCancel={closeConvert}
              />
            </div>
          </div>
        </div>
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
