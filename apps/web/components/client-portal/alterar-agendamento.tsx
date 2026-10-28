'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, XCircle, MessageCircle } from 'lucide-react'
import { gruposDeHorario } from '@/lib/appointments/periodos-do-dia'
import { cancelarPelaCliente, remarcarPelaCliente, horariosParaRemarcar } from '@/actions/portal-agendamentos'

const diaNoFuso = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(ms))
const diaDeHoje = () => diaNoFuso(Date.now())
const diaDeAmanha = () => diaNoFuso(Date.now() + 86_400_000)

/**
 * Cancelar ou remarcar pelo portal, até o prazo da rede (2026-10-21). Dentro
 * do prazo, só o caminho para falar com a clínica. As ações de verdade
 * conferem o prazo de novo no servidor.
 */
export function AlterarAgendamento({ appointmentId, scheduledAt, prazoHoras, whatsapp, telefone }: {
  appointmentId: string
  scheduledAt:   string
  prazoHoras:    number
  whatsapp:      string | null
  /** O telefone da clínica, já formatado — o contato quando o app não remarca mais. */
  telefone:      string | null
}) {
  const router = useRouter()
  const [abertoEm] = useState(() => Date.now())
  const podeAlterar = new Date(scheduledAt).getTime() - abertoEm >= prazoHoras * 3600_000
  const [modo, setModo] = useState<'nada' | 'remarcar' | 'cancelar'>('nada')
  const [dia, setDia] = useState('')
  const [slots, setSlots] = useState<string[] | null>(null)
  const [hora, setHora] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)
  const [enviando, iniciar] = useTransition()

  if (!podeAlterar) {
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Pelo app, só até {prazoHoras} horas antes do horário — e faltam menos que isso. Para cancelar ou remarcar, fale com a clínica.
        </p>
        {telefone && (
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', fontWeight: 600 }}>
            Telefone da clínica: {telefone}
          </p>
        )}
        {whatsapp && (
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ justifyContent: 'center' }}>
            <MessageCircle size={14} aria-hidden="true" /> Falar com a clínica
          </a>
        )}
      </div>
    )
  }

  function escolherDia(novo: string) {
    setDia(novo); setHora(null); setSlots(null); setErro(null)
    if (!novo) return
    iniciar(async () => {
      const r = await horariosParaRemarcar(appointmentId, novo)
      if ('error' in r) setErro(r.error)
      else setSlots(r.slots)
    })
  }

  function confirmarRemarcar() {
    if (!dia || !hora) return
    setErro(null)
    iniciar(async () => {
      const r = await remarcarPelaCliente(appointmentId, new Date(`${dia}T${hora}:00-03:00`).toISOString())
      if ('error' in r) { setErro(r.error); return }
      setFeito('Agendamento remarcado.'); setModo('nada'); router.refresh()
    })
  }

  function confirmarCancelar() {
    setErro(null)
    iniciar(async () => {
      const r = await cancelarPelaCliente(appointmentId, motivo)
      if ('error' in r) { setErro(r.error); return }
      setFeito('Agendamento cancelado.'); setModo('nada'); router.refresh()
    })
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
        Pelo app, você cancela ou remarca até {prazoHoras} horas antes do horário.
      </p>
      {feito && <p role="status" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--success)', fontWeight: 700 }}>{feito}</p>}

      {modo === 'nada' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn-secondary" onClick={() => { setModo('remarcar'); setFeito(null) }}>
            <CalendarClock size={14} aria-hidden="true" /> Remarcar
          </button>
          <button type="button" className="btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => { setModo('cancelar'); setFeito(null) }}>
            <XCircle size={14} aria-hidden="true" /> Cancelar agendamento
          </button>
        </div>
      )}

      {modo === 'remarcar' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)' }}>
            Novo dia
            <input type="date" className="field" value={dia} onChange={e => escolherDia(e.target.value)} />
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className={dia === diaDeHoje() ? 'chip-filtro is-ativo' : 'chip-filtro'} onClick={() => escolherDia(diaDeHoje())}>Hoje</button>
            <button type="button" className={dia === diaDeAmanha() ? 'chip-filtro is-ativo' : 'chip-filtro'} onClick={() => escolherDia(diaDeAmanha())}>Amanhã</button>
          </div>
          {slots && slots.length === 0 && (
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>Nenhum horário livre neste dia.</p>
          )}
          {slots && slots.length > 0 && gruposDeHorario(slots).map(g => (
            <div key={g.periodo} role="group" aria-label={g.periodo} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="overline">{g.periodo}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {g.horarios.map(h => (
                  <button key={h} type="button" aria-pressed={hora === h}
                    className={hora === h ? 'chip-filtro is-ativo' : 'chip-filtro'} onClick={() => setHora(h)}>
                    {h}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-secondary" disabled={enviando} onClick={() => setModo('nada')}>Voltar</button>
            <button type="button" className="btn-primary" disabled={enviando || !hora} onClick={confirmarRemarcar}>
              {enviando ? 'Remarcando…' : 'Confirmar novo horário'}
            </button>
          </div>
        </div>
      )}

      {modo === 'cancelar' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)' }}>
            Motivo
            <input className="field" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Opcional: conte para a clínica o porquê" />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-secondary" disabled={enviando} onClick={() => setModo('nada')}>Voltar</button>
            <button type="button" className="btn-primary" disabled={enviando} onClick={confirmarCancelar}>
              {enviando ? 'Cancelando…' : 'Confirmar cancelamento'}
            </button>
          </div>
        </div>
      )}

      {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600 }}>{erro}</p>}
    </div>
  )
}
