'use client'

import { Check } from 'lucide-react'
import type { Horario } from '@/lib/agenda/horario'
import { gradeDoCheckout } from '@/lib/checkout/grade-de-horarios'

/**
 * A grade de horários de quem agenda pelo checkout do plano e pelas sessões
 * do plano (D8 da simulação de 2026-10-29): a janela da UNIDADE naquele dia,
 * sem a pausa e sem cortar a noite (`gradeDoCheckout`), com os horários da
 * PROFISSIONAL em destaque. O resto é encaixe e continua escolhível (§9.1, o
 * seletor é livre); o que nem a unidade oferece vai pelo "Outro horário".
 * Era uma grade fixa, 08:00–20:00, igual para toda unidade e profissional.
 */
export function GradeDeHorarios({
  data, horarioDaUnidade, horarioDoProfissional, nomeDoProfissional, ocupado, selecionado, onEscolher, carregando,
}: {
  data:                  string
  horarioDaUnidade:      Horario | null
  horarioDoProfissional: Horario | null
  nomeDoProfissional?:   string
  /** O agendamento que já ocupa o horário (o mesmo profissional), ou nulo. */
  ocupado:               (hora: string) => { clientName: string | null } | null
  selecionado:           string
  onEscolher:            (hora: string) => void
  carregando:            boolean
}) {
  const grade = gradeDoCheckout(horarioDaUnidade, horarioDoProfissional, data)
  const temEncaixe = grade.some(h => !h.doProfissional)
  const foraDaGrade = !!selecionado && !grade.some(h => h.hora === selecionado)
  const quem = nomeDoProfissional?.trim() || 'a profissional'

  return (
    <div data-grade-de-horarios style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Horários</p>
        {carregando && <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>carregando…</p>}
      </div>

      {!carregando && grade.length === 0 && (
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          A unidade não abre neste dia. Para um encaixe, use “Outro horário”.
        </p>
      )}

      {!carregando && grade.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
          {grade.map(({ hora, doProfissional }) => {
            const booked = ocupado(hora)
            const sel    = selecionado === hora
            const encaixe = !doProfissional && !booked
            return (
              <button key={hora} type="button" disabled={!!booked} onClick={() => onEscolher(hora)}
                data-horario={hora} data-encaixe={encaixe ? '' : undefined}
                aria-pressed={sel}
                title={booked ? `Ocupado${booked.clientName ? ` — ${booked.clientName}` : ''}`
                  : encaixe ? `Fora do horário de ${quem} — encaixe` : undefined}
                style={{
                  padding: '8px 4px', borderRadius: 8, fontSize: 'var(--text-sm-sz)', fontWeight: 700,
                  cursor:     booked ? 'not-allowed' : 'pointer',
                  background: sel ? 'var(--brand)' : booked || encaixe ? 'var(--bg-app)' : 'var(--surface)',
                  color:      sel ? 'var(--on-brand)' : booked ? 'var(--text-faint)' : encaixe ? 'var(--text-muted)' : 'var(--text)',
                  border:     sel ? '2px solid var(--brand)'
                    : booked ? '1px solid var(--hairline)'
                    : encaixe ? '1px dashed var(--border)'
                    : '1.5px solid var(--brand-soft-border)',
                  textDecoration: booked ? 'line-through' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
                }}>
                {sel && <Check size={10} />}{hora}
              </button>
            )
          })}
        </div>
      )}

      {!carregando && temEncaixe && (
        <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
          Contorno rosé: o horário de {quem}. Tracejado: encaixe, fora do horário dela.
        </p>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text-muted)' }}>
        Outro horário (encaixe)
        <input
          type="time" className="field" step={300}
          aria-label="Outro horário (encaixe)"
          value={foraDaGrade ? selecionado : ''}
          onChange={e => { if (e.target.value) onEscolher(e.target.value) }}
          style={{ width: 'auto' }}
        />
      </label>
    </div>
  )
}
