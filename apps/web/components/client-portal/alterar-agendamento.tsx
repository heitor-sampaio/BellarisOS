'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, XCircle, MessageCircle, Phone } from 'lucide-react'
import { gruposDeHorario } from '@/lib/appointments/periodos-do-dia'
import { limiteParaAlterar } from '@/lib/clientes/agenda-do-portal'
import { useFuso } from '@/components/shared/fuso'
import { instanteNoFuso } from '@/lib/datetime'
import { cancelarPelaCliente, remarcarPelaCliente, horariosParaRemarcar, quemAtendeNoRemarcar } from '@/actions/portal-agendamentos'

/** O dia no relógio da unidade (F62). */
const diaNoFuso = (ms: number, fuso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(new Date(ms))
const diaDeHoje = (fuso: string) => diaNoFuso(Date.now(), fuso)
const diaDeAmanha = (fuso: string) => diaNoFuso(Date.now() + 86_400_000, fuso)
/** "quinta-feira, 13/11" — o dia escolhido (AAAA-MM-DD), pelo meio-dia de Brasília. */
const diaPorExtenso = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'UTC' })

/**
 * Cancelar ou remarcar pelo portal, até o prazo da rede (2026-10-21). Dentro
 * do prazo, só o caminho para falar com a clínica. As ações de verdade
 * conferem o prazo de novo no servidor.
 */
export function AlterarAgendamento({ appointmentId, scheduledAt, prazoHoras, whatsapp, whatsappParaAlterar = null, ligar = null, telefone, profissional = null, semPreferenciaInicial = false, ofereceSemPreferencia = false }: {
  appointmentId: string
  scheduledAt:   string
  prazoHoras:    number
  whatsapp:      string | null
  /** Fora do prazo (A53): o WhatsApp com "preciso cancelar ou remarcar" já escrito. */
  whatsappParaAlterar?: string | null
  /** Fora do prazo (A53): o "Ligar" (tel:) da clínica. */
  ligar?:        string | null
  /** O nome da profissional do agendamento. */
  profissional?: string | null
  /** O agendamento foi feito em "Sem preferência" (A59): o remarcar começa por aí. */
  semPreferenciaInicial?: boolean
  /** Mais de uma profissional realiza o procedimento na unidade: oferece "Sem preferência" (A59). */
  ofereceSemPreferencia?: boolean
  /** O telefone da clínica, já formatado — o contato quando o app não remarca mais. */
  telefone:      string | null
}) {
  const router = useRouter()
  // F62: o dia e a hora são os do relógio da UNIDADE.
  const fuso = useFuso()
  const [abertoEm] = useState(() => Date.now())
  const podeAlterar = new Date(scheduledAt).getTime() - abertoEm >= prazoHoras * 3600_000
  // O dia e a hora em que o prazo acaba (J-61): era só "até 24 horas antes".
  const limite = limiteParaAlterar(scheduledAt, prazoHoras, fuso)
  const [modo, setModo] = useState<'nada' | 'remarcar' | 'cancelar'>('nada')
  const [dia, setDia] = useState('')
  const [slots, setSlots] = useState<string[] | null>(null)
  const [hora, setHora] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)
  const [enviando, iniciar] = useTransition()
  // Com quem remarcar (A59): a mesma profissional, ou "Sem preferência" — que
  // escolhe de novo, entre quem realiza, quem estiver livre no horário.
  const [semPreferencia, setSemPreferencia] = useState(ofereceSemPreferencia && semPreferenciaInicial)
  // A56 da 11ª: em "Sem preferência", quem fica com o horário — antes de confirmar.
  // A resposta guarda o dia e a hora a que se refere: a de outro horário não aparece.
  const [quemAtendeDe, setQuemAtendeDe] = useState<{ chave: string; nome: string | null; mesma: boolean } | null>(null)
  const chaveDoHorario = semPreferencia && dia && hora ? `${dia} ${hora}` : null
  const quemAtende = quemAtendeDe && quemAtendeDe.chave === chaveDoHorario ? quemAtendeDe : null
  const esperandoQuemAtende = !!chaveDoHorario && !quemAtende
  useEffect(() => {
    if (!chaveDoHorario || !dia || !hora) return
    let vivo = true
    // A falha libera o botão (sem o nome): o servidor confere de novo ao remarcar.
    quemAtendeNoRemarcar(appointmentId, dia, hora).then(r => { if (vivo) setQuemAtendeDe({ chave: chaveDoHorario, ...r }) })
      .catch(() => { if (vivo) setQuemAtendeDe({ chave: chaveDoHorario, nome: null, mesma: false }) })
    return () => { vivo = false }
  }, [chaveDoHorario, dia, hora, appointmentId])
  // A57 da 11ª: o horário novo dentro do prazo do app — depois de remarcar, só a clínica muda.
  const novoDentroDoPrazo = !!dia && !!hora && prazoHoras > 0
    && instanteNoFuso(dia, hora, fuso).getTime() - abertoEm < prazoHoras * 3_600_000

  if (!podeAlterar) {
    // A53 da 7ª simulação: a regra do prazo fica; a saída diz o prazo, liga e
    // manda a mensagem certa ("preciso cancelar ou remarcar").
    const zap = whatsappParaAlterar ?? whatsapp
    return (
      <div data-fora-do-prazo className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          O prazo para alterar pelo app terminou em {limite} ({prazoHoras} horas antes do horário). A clínica ainda
          cancela ou remarca: para isso, fale com a clínica.
        </p>
        {telefone && (
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', fontWeight: 600 }}>
            Telefone da clínica: {telefone}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {zap && (
            <a href={zap} target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ justifyContent: 'center', flex: '1 1 180px' }}>
              <MessageCircle size={14} aria-hidden="true" /> Falar com a clínica
            </a>
          )}
          {ligar && (
            <a href={ligar} className="btn-secondary" style={{ justifyContent: 'center', flex: '1 1 180px' }}>
              <Phone size={14} aria-hidden="true" /> Ligar para a clínica
            </a>
          )}
        </div>
      </div>
    )
  }

  function escolherDia(novo: string, sem = semPreferencia) {
    setDia(novo); setHora(null); setSlots(null); setErro(null)
    if (!novo) return
    iniciar(async () => {
      const r = await horariosParaRemarcar(appointmentId, novo, sem)
      if ('error' in r) setErro(r.error)
      else setSlots(r.slots)
    })
  }

  function confirmarRemarcar() {
    if (!dia || !hora) return
    setErro(null)
    iniciar(async () => {
      const r = await remarcarPelaCliente(appointmentId, instanteNoFuso(dia, hora, fuso).toISOString(), semPreferencia)
      if ('error' in r) { setErro(r.error); return }
      // A51 da 12ª: o remarcado diz com quem ficou e quando (a Sabrina passou da Eva à Fernanda calada).
      setFeito(`Agendamento remarcado${r.quemAtende ? `: com ${r.quemAtende}` : ''}, ${diaPorExtenso(dia)} às ${hora}.`); setModo('nada'); router.refresh()
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
        Pelo app, você cancela ou remarca até {limite} ({prazoHoras} horas antes do horário).
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
          {ofereceSemPreferencia && (
            <div role="group" aria-label="Com quem?" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" aria-pressed={!semPreferencia} className={!semPreferencia ? 'chip-filtro is-ativo' : 'chip-filtro'}
                onClick={() => { setSemPreferencia(false); if (dia) escolherDia(dia, false) }}>
                {profissional ? `Só com ${profissional}` : 'A mesma profissional'}
              </button>
              <button type="button" aria-pressed={semPreferencia} className={semPreferencia ? 'chip-filtro is-ativo' : 'chip-filtro'}
                onClick={() => { setSemPreferencia(true); if (dia) escolherDia(dia, true) }}>
                Sem preferência
              </button>
            </div>
          )}
          {/* A50 da 12ª: "Sem preferência" marcado ao lado de "Com Helena" não dizia se a profissional podia mudar. */}
          {ofereceSemPreferencia && semPreferencia && (
            <p data-o-que-e-sem-preferencia style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', lineHeight: 1.45 }}>
              Sem preferência: {profissional ? `hoje o agendamento é com ${profissional}; no` : 'no'} horário novo, fica com quem estiver livre — pode ser outra profissional.
              {profissional ? ` Para ficar com ${profissional}, escolha “Só com ${profissional}”.` : ''}
            </p>
          )}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)' }}>
            Novo dia
            <input type="date" className="field" value={dia} onChange={e => escolherDia(e.target.value)} />
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className={dia === diaDeHoje(fuso) ? 'chip-filtro is-ativo' : 'chip-filtro'} onClick={() => escolherDia(diaDeHoje(fuso))}>Hoje</button>
            <button type="button" className={dia === diaDeAmanha(fuso) ? 'chip-filtro is-ativo' : 'chip-filtro'} onClick={() => escolherDia(diaDeAmanha(fuso))}>Amanhã</button>
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
          {semPreferencia && hora && quemAtende?.nome && (
            <p data-quem-atende-no-remarcar role="status" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', fontWeight: 600 }}>
              Com {quemAtende.nome}{quemAtende.mesma ? ' (a mesma de antes)' : ''} — quem está livre neste horário.
            </p>
          )}
          {novoDentroDoPrazo && (
            <p data-dentro-do-prazo style={{
              color: 'var(--text)', background: 'var(--warning-soft)', borderRadius: 'var(--radius-field-token)',
              padding: '10px 14px', fontSize: 'var(--text-sm-sz)', lineHeight: 1.45,
            }}>
              Este horário fica a menos de {prazoHoras} horas: depois de remarcar, para mudar de novo ou cancelar, fale com a clínica.
            </p>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-secondary" disabled={enviando} onClick={() => setModo('nada')}>Voltar</button>
            {/* A51 da 12ª: em "Sem preferência", só confirma depois de saber com quem. */}
            <button type="button" className="btn-primary" disabled={enviando || !hora || esperandoQuemAtende} onClick={confirmarRemarcar}>
              {enviando ? 'Remarcando…' : esperandoQuemAtende ? 'Conferindo quem atende…' : 'Confirmar novo horário'}
            </button>
          </div>
        </div>
      )}

      {modo === 'cancelar' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)' }}>
            Motivo (opcional)
            <input className="field" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Conte para a clínica o porquê, se quiser" />
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
