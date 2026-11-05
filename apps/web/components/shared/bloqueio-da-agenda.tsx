'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, Lock, X } from 'lucide-react'
import { toast } from 'sonner'
import { JanelaModal } from '@/components/shared/janela-modal'
import { SegSelect } from '@/components/shared/seg-select'
import { bloquearHorario, desfazerBloqueio } from '@/actions/agenda-bloqueios'
import { trechoDoBloqueio, recusaDoBloqueio, type BloqueioDaAgenda } from '@/lib/agenda/bloqueio'

/**
 * O bloqueio pontual da agenda (decisão 3 do Heitor, 7ª simulação): o botão
 * "Bloquear horário" com a janela dele, o bloco na grade e a janela de um
 * bloqueio (o que é, quem bloqueou, "Desfazer bloqueio").
 *
 * O bloco da grade não segura o clique: clicar no bloqueado abre o novo
 * agendamento, que avisa — o encaixe é da clínica (princípio 2). Só o rótulo
 * do bloco abre a janela dele.
 */

interface Alvo { id: string; name: string }

/** "AAAA-MM-DDTHH:MM" no relógio de quem vê, para o campo datetime-local. */
function local(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function BotaoBloquearHorario({ branchId, profissionais, salas = [], soEu = null, dia }: {
  branchId: string
  profissionais: Alvo[]
  salas?: Alvo[]
  /** A agenda "só os meus": o bloqueio é dela, sem escolher pessoa nem sala. */
  soEu?: Alvo | null
  /** O dia aberto na agenda (o padrão do início). */
  dia: Date
}) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <button type="button" className="btn-secondary" onClick={() => setAberto(true)}>
        <Lock size={14} aria-hidden="true" /> Bloquear horário
      </button>
      {aberto && <JanelaDeBloquear branchId={branchId} profissionais={profissionais} salas={salas} soEu={soEu} dia={dia} onFechar={() => setAberto(false)} />}
    </>
  )
}

function JanelaDeBloquear({ branchId, profissionais, salas, soEu, dia, onFechar }: {
  branchId: string; profissionais: Alvo[]; salas: Alvo[]; soEu: Alvo | null; dia: Date; onFechar: () => void
}) {
  const router = useRouter()
  const [para, setPara] = useState<'PROFISSIONAL' | 'SALA'>('PROFISSIONAL')
  const [profId, setProfId] = useState(soEu?.id ?? '')
  const [salaId, setSalaId] = useState('')
  // O padrão: a próxima hora cheia do dia aberto (hoje, a partir de agora), por uma hora.
  const [padrao] = useState(() => {
    const agora = new Date()
    const base = new Date(dia)
    if (base.toDateString() === agora.toDateString()) base.setHours(agora.getHours() + 1, 0, 0, 0)
    else base.setHours(12, 0, 0, 0)
    return { ini: local(base), fim: local(new Date(base.getTime() + 3_600_000)) }
  })
  const [inicio, setInicio] = useState(padrao.ini)
  const [fim, setFim] = useState(padrao.fim)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [gravando, iniciar] = useTransition()

  const alvoId = soEu ? soEu.id : para === 'PROFISSIONAL' ? profId : salaId
  function bloquear() {
    setErro(null)
    if (!alvoId) { setErro(para === 'SALA' ? 'Escolha a sala.' : 'Escolha a profissional.'); return }
    const e = { inicio: new Date(inicio).toISOString(), fim: new Date(fim).toISOString(), motivo }
    const recusa = recusaDoBloqueio(e)
    if (recusa) { setErro(recusa); return }
    iniciar(async () => {
      const r = await bloquearHorario({
        branchId, ...e,
        professionalId: soEu || para === 'PROFISSIONAL' ? alvoId : null,
        roomId: !soEu && para === 'SALA' ? alvoId : null,
      })
      if (r.error) { setErro(r.error); return }
      toast.success('Horário bloqueado.', r.aviso ? { description: r.aviso } : undefined)
      onFechar()
      router.refresh()
    })
  }

  const rotulo = { fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' } as const
  return (
    <JanelaModal onFechar={onFechar} rotulo="Bloquear horário" largura={460} travado={gravando}>
      <div style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>Bloquear horário</h2>
          <button type="button" className="btn-ghost" onClick={onFechar} aria-label="Fechar" style={{ padding: '4px 6px' }}><X size={16} /></button>
        </div>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)', lineHeight: 1.5 }}>
          {soEu
            ? `O horário de ${soEu.name} fica bloqueado: o app da cliente e o Copilot não o oferecem. Quem agendar nele pela agenda é avisado.`
            : 'O app da cliente e o Copilot não oferecem o horário bloqueado. Quem agendar nele pela agenda é avisado, e o encaixe continua permitido.'}
        </p>
        {!soEu && salas.length > 0 && (
          <div role="group" aria-label="Bloquear para">
            <SegSelect ariaLabel="Bloquear para" value={para} onSelect={k => setPara(k as 'PROFISSIONAL' | 'SALA')}
              options={[{ key: 'PROFISSIONAL', label: 'Profissional' }, { key: 'SALA', label: 'Sala' }]} />
          </div>
        )}
        {!soEu && para === 'PROFISSIONAL' && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={rotulo}>Profissional</span>
            <select className="field" value={profId} onChange={e => setProfId(e.target.value)} aria-label="Profissional">
              <option value="">Selecione…</option>
              {profissionais.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        {!soEu && para === 'SALA' && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={rotulo}>Sala</span>
            <select className="field" value={salaId} onChange={e => setSalaId(e.target.value)} aria-label="Sala">
              <option value="">Selecione…</option>
              {salas.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
        <div className="form-2col">
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={rotulo}>Início</span>
            <input type="datetime-local" className="field" value={inicio} onChange={e => setInicio(e.target.value)} aria-label="Início" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={rotulo}>Fim</span>
            <input type="datetime-local" className="field" value={fim} onChange={e => setFim(e.target.value)} aria-label="Fim" />
          </label>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={rotulo}>Motivo</span>
          <input className="field" value={motivo} maxLength={200} onChange={e => setMotivo(e.target.value)} aria-label="Motivo"
            placeholder="Almoço, folga, férias, manutenção…" />
        </label>
        {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn-secondary" onClick={onFechar} disabled={gravando}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={bloquear} disabled={gravando}>{gravando ? 'Bloqueando…' : 'Bloquear'}</button>
        </div>
      </div>
    </JanelaModal>
  )
}

/**
 * O bloco do bloqueio na grade: a faixa (sem segurar o clique, que agenda e
 * avisa) e o rótulo, que abre a janela do bloqueio.
 */
export function BlocoDoBloqueio({ bloqueio, top, height, rotulo, podeDesfazer, esquerda = 0 }: {
  bloqueio: BloqueioDaAgenda
  top: number
  height: number
  /** "Bloqueado · Almoço" — e, na grade da rede, de quem é. */
  rotulo: string
  podeDesfazer: boolean
  esquerda?: number
}) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <div data-bloqueio={bloqueio.id} style={{
        position: 'absolute', top, height, left: esquerda, right: 0, zIndex: 0, pointerEvents: 'none',
        background: 'var(--warning-soft)', borderTop: '1px dashed var(--warning-border)', borderBottom: '1px dashed var(--warning-border)',
        opacity: 0.85,
      }} />
      {/* O rótulo é um irmão, por cima dos cartões: o agendamento que começa
          junto com o bloqueio o cobriria. */}
      <button type="button" data-rotulo-do-bloqueio={bloqueio.id} title={`${rotulo} · ${trechoDoBloqueio(bloqueio)}`}
        onClick={e => { e.stopPropagation(); setAberto(true) }}
        style={{
          position: 'absolute', top: top + 2, right: 4, maxWidth: `calc(100% - ${esquerda + 8}px)`, zIndex: 3,
          display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 8px',
          borderRadius: 'var(--radius-chip-token)', border: '1px solid var(--warning-border)', background: 'var(--surface)',
          fontSize: 'var(--text-overline)', fontWeight: 'var(--weight-bold)', color: 'var(--warning)', cursor: 'pointer',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
        <Ban size={11} aria-hidden="true" style={{ flexShrink: 0 }} /> {rotulo}
      </button>
      {/* A janela mora dentro da coluna da grade: o clique nela não pode subir
          até a coluna (que abriria um novo agendamento). */}
      {aberto && (
        <span style={{ display: 'contents' }} onClick={e => e.stopPropagation()}>
          <JanelaDoBloqueio bloqueio={bloqueio} titulo={rotulo} podeDesfazer={podeDesfazer} onFechar={() => setAberto(false)} />
        </span>
      )}
    </>
  )
}

export function JanelaDoBloqueio({ bloqueio, titulo, podeDesfazer, onFechar }: {
  bloqueio: BloqueioDaAgenda; titulo: string; podeDesfazer: boolean; onFechar: () => void
}) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [desfazendo, iniciar] = useTransition()
  function desfazer() {
    setErro(null)
    iniciar(async () => {
      const r = await desfazerBloqueio(bloqueio.id)
      if (r.error) { setErro(r.error); return }
      toast.success('Bloqueio desfeito: o horário voltou a ficar livre.')
      onFechar()
      router.refresh()
    })
  }
  return (
    <JanelaModal onFechar={onFechar} rotulo="Horário bloqueado" largura={420} travado={desfazendo}>
      <div style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>Horário bloqueado</h2>
          <button type="button" className="btn-ghost" onClick={onFechar} aria-label="Fechar" style={{ padding: '4px 6px' }}><X size={16} /></button>
        </div>
        <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)' }}>{titulo}</p>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)' }}>
          {trechoDoBloqueio(bloqueio).replace(/^d/, 'D')} · Motivo: {bloqueio.motivo}
        </p>
        {bloqueio.criadoPorNome && <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>Bloqueado por {bloqueio.criadoPorNome}.</p>}
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
          O app da cliente e o Copilot não oferecem este horário. Pela agenda, o encaixe é permitido, com aviso.
        </p>
        {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
        {podeDesfazer && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button type="button" className="btn-secondary" onClick={onFechar} disabled={desfazendo}>Fechar</button>
            <button type="button" className="btn-primary" onClick={desfazer} disabled={desfazendo}>{desfazendo ? 'Desfazendo…' : 'Desfazer bloqueio'}</button>
          </div>
        )}
      </div>
    </JanelaModal>
  )
}
