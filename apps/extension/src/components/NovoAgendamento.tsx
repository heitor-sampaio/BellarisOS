import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { BootstrapData, ClientHit } from '../lib/types'

const SP = 'America/Sao_Paulo'
const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: SP }).format(new Date())

export function NovoAgendamento({ data, branchId, onCreated }: { data: BootstrapData; branchId?: string; onCreated: () => void }) {
  // Cliente
  const [query, setQuery]     = useState('')
  const [hits, setHits]       = useState<ClientHit[]>([])
  const [client, setClient]   = useState<ClientHit | null>(null)

  // Atendimento
  const [isEvaluation, setIsEvaluation] = useState(false)
  const [procedureId, setProcedureId]   = useState('')
  const [professionalId, setProfessionalId] = useState('')
  const [roomId, setRoomId] = useState('')
  const [date, setDate]     = useState(todayStr())

  // Slots
  const [slots, setSlots] = useState<string[] | null>(null)
  const [slot, setSlot]   = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const procedure = data.procedures.find((p) => p.id === procedureId)
  const durationMin = isEvaluation ? 60 : (procedure?.duration_min ?? 60)

  // Busca de cliente (debounce simples)
  useEffect(() => {
    if (client || query.trim().length < 2) { setHits([]); return }
    const t = setTimeout(() => {
      api.searchClients(query.trim()).then((r) => setHits(r.clients)).catch(() => setHits([]))
    }, 300)
    return () => clearTimeout(t)
  }, [query, client])

  // Carrega slots quando profissional + tipo + data definidos
  useEffect(() => {
    setSlot('')
    if (!professionalId || !date || (!isEvaluation && !procedureId)) { setSlots(null); return }
    setSlots(null)
    api.slots(professionalId, date, durationMin, branchId)
      .then((r) => setSlots(r.slots))
      .catch(() => setSlots([]))
  }, [professionalId, date, procedureId, isEvaluation, durationMin, branchId])

  async function handleSubmit() {
    setError(null)
    if (!client)                      return setError('Selecione um cliente.')
    if (!isEvaluation && !procedureId) return setError('Selecione um procedimento.')
    if (!professionalId)              return setError('Selecione um profissional.')
    if (!slot)                        return setError('Selecione um horário.')

    setSubmitting(true)
    const scheduledAt = new Date(`${date}T${slot}:00-03:00`).toISOString()
    try {
      await api.createAppointment({
        branchId,
        clientId:       client.id,
        procedureId:    isEvaluation ? null : procedureId,
        professionalId,
        scheduledAt,
        roomId:         roomId || null,
        isEvaluation,
      })
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao agendar.')
      setSubmitting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Cliente */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label className="overline">Cliente</label>
        {client ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div className="card" style={{ flex: 1, padding: '9px 11px' }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>{client.name}</div>
              {client.phone && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{client.phone}</div>}
            </div>
            <button className="btn-secondary" style={{ padding: '8px 10px' }} onClick={() => { setClient(null); setQuery('') }}>
              Trocar
            </button>
          </div>
        ) : (
          <>
            <input
              className="field" value={query} placeholder="Nome, telefone ou CPF"
              onChange={(e) => setQuery(e.target.value)}
            />
            {hits.length > 0 && (
              <div className="card" style={{ padding: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {hits.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setClient(c); setHits([]) }}
                    style={{
                      textAlign: 'left', padding: '8px 10px', border: 'none', background: 'transparent',
                      cursor: 'pointer', borderRadius: 8, fontFamily: 'inherit',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{c.name}</div>
                    {c.phone && <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{c.phone}</div>}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Avaliação */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}>
        <input type="checkbox" checked={isEvaluation} onChange={(e) => setIsEvaluation(e.target.checked)} style={{ width: 15, height: 15 }} />
        Consulta de avaliação (sem procedimento)
      </label>

      {/* Procedimento */}
      {!isEvaluation && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label className="overline">Procedimento</label>
          <select className="field" value={procedureId} onChange={(e) => setProcedureId(e.target.value)}>
            <option value="">Selecione…</option>
            {data.procedures.map((p) => (
              <option key={p.id} value={p.id}>{p.name} · {p.duration_min}min</option>
            ))}
          </select>
        </div>
      )}

      {/* Profissional */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label className="overline">Profissional</label>
        <select className="field" value={professionalId} onChange={(e) => setProfessionalId(e.target.value)}>
          <option value="">Selecione…</option>
          {data.professionals.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Sala (opcional) */}
      {data.rooms.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label className="overline">Sala (opcional)</label>
          <select className="field" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">Sem sala</option>
            {data.rooms.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Data */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label className="overline">Dia</label>
        <input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {/* Horários */}
      {slots !== null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label className="overline">Horário</label>
          {slots.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>Sem horários livres neste dia.</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {slots.map((s) => (
                <button key={s} className="chip" data-selected={slot === s} onClick={() => setSlot(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <div className="error-box">{error}</div>}

      <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
        {submitting ? 'Agendando…' : 'Agendar'}
      </button>
    </div>
  )
}
