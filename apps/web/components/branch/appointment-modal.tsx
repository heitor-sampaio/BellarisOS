'use client'

import { useActionState, useEffect, useState, useMemo } from 'react'
import { addAppointment } from '@/actions/appointments'
import { X, Calendar, Search, UserPlus } from 'lucide-react'

interface Client      { id: string; name: string; phone: string }
interface Procedure   { id: string; name: string; category: string; duration_min: number; price: string | number }
interface Professional { id: string; name: string }
interface Room        { id: string; name: string }

interface AppointmentModalProps {
  branchId:      string
  slug:          string
  clients:       Client[]
  procedures:    Procedure[]
  professionals: Professional[]
  rooms:         Room[]
  defaultDate?:  string   // ISO datetime hint (from calendar click)
  onClose:       () => void
  onSuccess:     () => void
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

export function AppointmentModal({
  branchId, slug, clients, procedures, professionals, rooms,
  defaultDate, onClose, onSuccess,
}: AppointmentModalProps) {
  const [state, formAction, pending] = useActionState(addAppointment, undefined)
  const [clientSearch, setClientSearch] = useState('')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [showClientList, setShowClientList] = useState(false)
  const [isEvaluation, setIsEvaluation] = useState(false)

  useEffect(() => { if (state?.success) { onSuccess(); onClose() } }, [state?.success])

  const filteredClients = clientSearch.length >= 1
    ? clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()) || c.phone.includes(clientSearch))
    : []

  const noClients = clients.length === 0

  // Data/hora padrão em horário local (não UTC)
  const defaultDT = useMemo(() => {
    if (defaultDate) return defaultDate.substring(0, 16)  // já vem como local de agenda-calendar
    const rounded = new Date(Math.ceil(Date.now() / 1800000) * 1800000)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${rounded.getFullYear()}-${pad(rounded.getMonth()+1)}-${pad(rounded.getDate())}T${pad(rounded.getHours())}:${pad(rounded.getMinutes())}`
  }, [defaultDate])

  // Controla o valor do input (exibe local) e o hidden UTC para envio
  const [localDT, setLocalDT] = useState(defaultDT)

  // Ao mudar o defaultDate (novo clique no calendário), reseta
  useEffect(() => { setLocalDT(defaultDT) }, [defaultDT])

  const scheduledAtUTC = useMemo(
    () => localDT ? new Date(localDT).toISOString() : '',
    [localDT],
  )

  const minDT = useMemo(() => {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(34,22,25,0.45)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card" style={{ width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--brand-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Calendar size={16} style={{ color: 'var(--brand)' }} />
            </div>
            <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
              Novo agendamento
            </h2>
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ padding: '4px 6px' }}><X size={16} /></button>
        </div>

        <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input type="hidden" name="_branchId" value={branchId} />
          <input type="hidden" name="_slug" value={slug} />
          <input type="hidden" name="client_id" value={selectedClient?.id ?? ''} />

          {/* Busca de cliente */}
          <Field label="Cliente *">
            <div style={{ position: 'relative' }}>
              {selectedClient ? (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '9px 12px',
                  background: 'var(--brand-soft)', border: '1.5px solid var(--brand-soft-border)',
                  borderRadius: 'var(--radius-field-token)',
                }}>
                  <div>
                    <span style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-sm-sz)', color: 'var(--brand)' }}>{selectedClient.name}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', marginLeft: 8 }}>{selectedClient.phone}</span>
                  </div>
                  <button type="button" onClick={() => setSelectedClient(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand)', lineHeight: 0 }}>
                    <X size={14} />
                  </button>
                </div>
              ) : noClients ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px',
                  background: 'var(--bg-app)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-field-token)',
                }}>
                  <UserPlus size={14} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
                  <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                    Nenhum cliente cadastrado nesta filial.{' '}
                    <a href={`/${slug}/clients/new`} style={{ color: 'var(--brand)', fontWeight: 700 }}>
                      Cadastrar cliente
                    </a>
                  </span>
                </div>
              ) : (
                <>
                  <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    className="field"
                    style={{ paddingLeft: 30 }}
                    placeholder="Buscar cliente por nome ou telefone…"
                    value={clientSearch}
                    onChange={e => { setClientSearch(e.target.value); setShowClientList(true) }}
                    onFocus={() => setShowClientList(true)}
                  />
                  {showClientList && clientSearch.length > 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-card-sm)', marginTop: 4,
                      boxShadow: '0 8px 24px -6px rgba(34,22,25,.12)',
                      maxHeight: 200, overflow: 'auto',
                    }}>
                      {filteredClients.length > 0 ? (
                        filteredClients.slice(0, 8).map(c => (
                          <button
                            key={c.id} type="button"
                            onClick={() => { setSelectedClient(c); setClientSearch(''); setShowClientList(false) }}
                            style={{
                              width: '100%', textAlign: 'left', padding: '9px 14px',
                              background: 'none', border: 'none', cursor: 'pointer',
                              borderBottom: '1px solid var(--hairline)',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-app)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                          >
                            <span style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>{c.name}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', marginLeft: 8 }}>{c.phone}</span>
                          </button>
                        ))
                      ) : (
                        <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                            Nenhum resultado para "{clientSearch}".{' '}
                          </span>
                          <a
                            href={`/${slug}/clients/new`}
                            style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--brand)', fontWeight: 700, whiteSpace: 'nowrap' }}
                          >
                            + Cadastrar
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </Field>

          <label style={{
            display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 14px', borderRadius: 10,
            border: isEvaluation ? '1.5px solid var(--brand)' : '1px solid var(--border)',
            background: isEvaluation ? 'var(--brand-soft)' : 'var(--bg-app)',
          }}>
            <input
              type="checkbox"
              name="is_evaluation"
              value="true"
              checked={isEvaluation}
              onChange={e => setIsEvaluation(e.target.checked)}
              style={{ accentColor: 'var(--brand)', width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
            />
            <div>
              <span style={{ fontSize: 13, fontWeight: 700, color: isEvaluation ? 'var(--brand)' : 'var(--text)' }}>Consulta de avaliação</span>
              <span style={{ fontSize: 11, color: 'var(--text-faint)', display: 'block', marginTop: 1 }}>
                {isEvaluation ? 'Sem procedimento fixo — a profissional definirá o plano na consulta' : 'A profissional poderá registrar um plano de tratamento neste atendimento'}
              </span>
            </div>
          </label>

          {!isEvaluation && (
            <Field label="Procedimento *">
              <select name="procedure_id" required className="field">
                <option value="">Selecione o procedimento…</option>
                {procedures.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.duration_min}min — R$ {parseFloat(String(p.price)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div className="form-2col">
            <Field label="Profissional *">
              <select name="professional_id" required className="field">
                <option value="">Selecione…</option>
                {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>

            <Field label="Sala / Cabine">
              <select name="room_id" className="field">
                <option value="">Sem sala definida</option>
                {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Data e hora *">
            <input
              type="datetime-local" required className="field"
              value={localDT}
              min={minDT}
              onChange={e => setLocalDT(e.target.value)}
            />
            <input type="hidden" name="scheduled_at" value={scheduledAtUTC} />
          </Field>

          <Field label="Observações internas">
            <textarea name="notes" rows={2} className="field" placeholder="Preferências, contraindicações…" style={{ resize: 'vertical' }} />
          </Field>

          {state?.error && (
            <p style={{ color: 'var(--warning)', background: 'var(--warning-soft)', borderRadius: 'var(--radius-field-token)', padding: '8px 12px', fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)' }}>
              {state.error}
            </p>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4, alignItems: 'center' }}>
            {!selectedClient && !noClients && (
              <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)', marginRight: 4 }}>
                Selecione um cliente para continuar
              </span>
            )}
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button
              type="submit"
              disabled={pending || !selectedClient || noClients}
              className="btn-primary"
              style={{ opacity: (!selectedClient || noClients) ? 0.5 : 1 }}
            >
              <Calendar size={14} />
              {pending ? 'Agendando…' : 'Confirmar agendamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
