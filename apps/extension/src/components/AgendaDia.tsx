import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { DayAppointment } from '../lib/types'

const SP = 'America/Sao_Paulo'

/** Data de hoje em YYYY-MM-DD no fuso de São Paulo. */
function todayStr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SP }).format(new Date())
}

function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: SP, hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

/** Soma `days` a uma data YYYY-MM-DD (sem fuso — aritmética de calendário). */
function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d!))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

export function AgendaDia({ reloadKey, branchId }: { reloadKey: number; branchId?: string }) {
  const [date, setDate]   = useState(todayStr())
  const [appts, setAppts] = useState<DayAppointment[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setAppts(null)
    setError(null)
    api.agenda(date, branchId).then((r) => setAppts(r.appointments)).catch((e) => setError(e.message))
  }, [date, reloadKey, branchId])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label className="overline">Dia</label>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="btn-secondary" style={{ padding: '8px 11px' }} onClick={() => setDate((d) => shiftDate(d, -1))} aria-label="Dia anterior">‹</button>
          <input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ flex: 1 }} />
          <button className="btn-secondary" style={{ padding: '8px 11px' }} onClick={() => setDate((d) => shiftDate(d, 1))} aria-label="Próximo dia">›</button>
          <button className="btn-secondary" style={{ padding: '8px 10px', fontSize: 12 }} onClick={() => setDate(todayStr())}>Hoje</button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      {!error && appts === null && (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', marginTop: 12 }}>
          Carregando…
        </div>
      )}

      {appts && appts.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
          Nenhum agendamento neste dia.
        </div>
      )}

      {appts && appts.map((a) => (
        <div key={a.id} className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '11px 13px' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--brand)', letterSpacing: '-0.02em', minWidth: 46 }}>
            {fmtTime(a.scheduledAt)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {a.clientName ?? 'Cliente'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {a.isEvaluation ? 'Avaliação' : (a.procedureName ?? '—')} · {a.durationMin} min
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
