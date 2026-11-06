'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import type { Horario } from '@/lib/agenda/horario'
import { gradeDoCheckout, aPartirDeAgora } from '@/lib/checkout/grade-de-horarios'

/**
 * A grade de horários de quem agenda pelo checkout do plano e pelas sessões
 * do plano (D8 da simulação de 2026-10-29): a janela da UNIDADE naquele dia,
 * sem a pausa e sem cortar a noite (`gradeDoCheckout`), com os horários da
 * PROFISSIONAL em destaque. O resto é encaixe e continua escolhível (§9.1, o
 * seletor é livre); o que nem a unidade oferece vai pelo "Outro horário".
 * Era uma grade fixa, 08:00–20:00, igual para toda unidade e profissional.
 * Hoje, só o que ainda não passou — também no "Outro horário" (A24 da 6ª
 * simulação: de madrugada, oferecia 00:00–04:00).
 */
export function GradeDeHorarios({
  data, horarioDaUnidade, horarioDoProfissional, nomeDoProfissional, ocupado, selecionado, onEscolher, carregando, semOutroHorario = false,
}: {
  data:                  string
  horarioDaUnidade:      Horario | null
  horarioDoProfissional: Horario | null
  nomeDoProfissional?:   string
  /**
   * Quem já ocupa o horário (o mesmo profissional), ou nulo: o agendamento, ou
   * o bloqueio dela (`rotulo` "Bloqueado · motivo" — D5 da 8ª simulação).
   */
  ocupado:               (hora: string) => { clientName: string | null; rotulo?: string } | null
  selecionado:           string
  onEscolher:            (hora: string) => void
  carregando:            boolean
  /** Sem o "Outro horário (encaixe)": o modal Agendar já tem o campo de data e hora (A58 da 8ª). */
  semOutroHorario?:      boolean
}) {
  const [agora] = useState(() => new Date())
  const limite = aPartirDeAgora(data, agora)
  const [erroDoEncaixe, setErroDoEncaixe] = useState<string | null>(null)
  const grade = gradeDoCheckout(horarioDaUnidade, horarioDoProfissional, data, limite)
  const jaPassou = !!limite && grade.length === 0 && gradeDoCheckout(horarioDaUnidade, horarioDoProfissional, data).length > 0
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
          {jaPassou
            ? `Os horários de hoje já passaram. Para um encaixe, use ${semOutroHorario ? 'o campo de data e hora' : '“Outro horário”'}.`
            : `A unidade não abre neste dia. Para um encaixe, use ${semOutroHorario ? 'o campo de data e hora' : '“Outro horário”'}.`}
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
                title={booked ? (booked.rotulo ?? `Ocupado${booked.clientName ? ` — ${booked.clientName}` : ''}`)
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

      {!semOutroHorario && (<>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text-muted)' }}>
        Outro horário (encaixe)
        <input
          type="time" className="field" step={300}
          aria-label="Outro horário (encaixe)"
          value={foraDaGrade ? selecionado : ''}
          onChange={e => {
            const v = e.target.value
            if (!v) return
            if (limite && v < limite) { setErroDoEncaixe(`Escolha a partir de ${limite}.`); return }
            setErroDoEncaixe(null)
            onEscolher(v)
          }}
          style={{ width: 'auto' }}
        />
      </label>
      {erroDoEncaixe && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600 }}>{erroDoEncaixe}</p>}
      </>)}
    </div>
  )
}
