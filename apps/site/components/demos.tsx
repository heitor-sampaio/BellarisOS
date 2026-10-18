'use client'

import { CalendarCheck, Check, MessageCircle, PenLine, Send, Sparkles } from 'lucide-react'
import { useSequencia } from '@/components/movimento'

/**
 * As demonstrações vivas do site (2026-10-18). Contam a MESMA história das
 * telas fotografadas da Clínica Aurora — a Mariana Costa chega pelo anúncio
 * do preenchimento labial, agenda com a Dra. Ana Lima, assina o termo pelo
 * celular, e o Copilot acha os horários livres de amanhã —, então nada aqui
 * é promessa nova: é o que as telas já mostram, em movimento.
 *
 * São decoração (`aria-hidden`): o texto alternativo das telas já diz o que
 * elas mostram. Sem movimento, cada uma fica parada no passo inicial — os
 * avisos no primeiro, as conversas no fim, inteiras.
 */

const AVISOS = [
  { icone: MessageCircle, tom: 'whatsapp', rotulo: 'WhatsApp', titulo: 'Mariana Costa', texto: 'Oi! Vi o anúncio do preenchimento labial. Vocês têm horário essa semana?' },
  { icone: CalendarCheck, tom: 'marca', rotulo: 'Agenda', titulo: 'Agendado', texto: 'Mariana Costa · quinta, 10h · Dra. Ana Lima' },
  { icone: PenLine, tom: 'marca', rotulo: 'Termos', titulo: 'Termo assinado', texto: 'A Mariana assinou pelo celular. O PDF já está na ficha.' },
  { icone: Sparkles, tom: 'marca', rotulo: 'Copilot', titulo: 'Horários de amanhã', texto: 'A Dra. Ana Lima tem 10h, 11h30 e 15h livres.' },
] as const
const TEMPO_DOS_AVISOS = [3400, 3400, 3400, 3400] as const

export function AvisosDoHero() {
  const [ref, passo] = useSequencia<HTMLDivElement>(TEMPO_DOS_AVISOS, false)
  return (
    <div ref={ref} className="site-avisos" data-avisos data-passo={passo} aria-hidden="true">
      {AVISOS.map((a, i) => {
        const Icone = a.icone
        return (
          <div key={a.rotulo} className={`site-aviso${i === passo ? ' ativo' : ''}`}>
            <span className={`site-aviso-icone site-aviso-${a.tom}`}><Icone size={18} /></span>
            <span className="site-aviso-corpo">
              <span className="site-aviso-rotulo">{a.rotulo} <i>agora</i></span>
              <strong>{a.titulo}</strong>
              <span className="site-aviso-texto">{a.texto}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ─── A conversa do WhatsApp chegando ─── */

type Fala = { de: 'ela' | 'clinica' | 'evento'; texto: string; etiqueta?: string }

const CONVERSA: Fala[] = [
  { de: 'ela', texto: 'Oi! Vi o anúncio do preenchimento labial. Vocês têm horário essa semana?', etiqueta: 'Veio do anúncio' },
  { de: 'clinica', texto: 'Temos sim! A Dra. Ana tem quinta às 10h ou sexta às 15h30.' },
  { de: 'ela', texto: 'Quinta às 10h é perfeito!' },
  { de: 'evento', texto: 'Agendado · quinta, 10h · Dra. Ana Lima' },
]
// Cada passo: quantas falas já apareceram e quem está digitando.
const PASSOS_DA_CONVERSA: { falas: number; digitando?: 'ela' | 'clinica' }[] = [
  { falas: 0, digitando: 'ela' },
  { falas: 1 },
  { falas: 1, digitando: 'clinica' },
  { falas: 2 },
  { falas: 2, digitando: 'ela' },
  { falas: 3 },
  { falas: 4 },
]
const TEMPO_DA_CONVERSA = [1000, 1700, 1300, 1900, 1000, 1300, 3600] as const

export function DemoConversa() {
  const [ref, passo] = useSequencia<HTMLDivElement>(TEMPO_DA_CONVERSA)
  const { falas, digitando } = PASSOS_DA_CONVERSA[passo]!
  return (
    <div ref={ref} className="site-demo" data-demo="conversa" data-passo={passo} aria-hidden="true">
      <div className="site-demo-topo">
        <span className="site-demo-avatar">M</span>
        <span className="site-demo-quem"><strong>Mariana Costa</strong><span className="site-demo-canal">WhatsApp</span></span>
      </div>
      <div className="site-demo-falas">
        {CONVERSA.slice(0, falas).map(f => f.de === 'evento' ? (
          <span key={f.texto} className="site-demo-evento"><CalendarCheck size={14} />{f.texto}</span>
        ) : (
          <span key={f.texto} className={`site-demo-fala site-demo-${f.de}`}>
            {f.etiqueta && <span className="site-demo-etiqueta">{f.etiqueta}</span>}
            {f.texto}
          </span>
        ))}
        {digitando && <Digitando lado={digitando} />}
      </div>
    </div>
  )
}

/* ─── O Copilot: pergunta, resposta e o "confirma?" antes de gravar ─── */

const PERGUNTA_1 = 'Quais horários a Dra. Ana tem livres amanhã?'
const PERGUNTA_2 = 'Agende a toxina da Mariana às 15h'

type PassoDoCopilot = { campo?: string; itens: number; pensando?: boolean; confirmado?: boolean }
const PASSOS_DO_COPILOT: PassoDoCopilot[] = [
  { campo: PERGUNTA_1, itens: 0 },
  { itens: 1, pensando: true },
  { itens: 2 },
  { campo: PERGUNTA_2, itens: 2 },
  { itens: 3, pensando: true },
  { itens: 4 },
  { itens: 4, confirmado: true },
  { itens: 5, confirmado: true },
]
const TEMPO_DO_COPILOT = [1900, 1300, 2400, 1700, 1200, 1900, 700, 3400] as const

export function DemoCopilot() {
  const [ref, passo] = useSequencia<HTMLDivElement>(TEMPO_DO_COPILOT)
  const { campo, itens, pensando, confirmado } = PASSOS_DO_COPILOT[passo]!
  const conversa = [
    <span key="p1" className="site-demo-fala site-demo-clinica">{PERGUNTA_1}</span>,
    <span key="r1" className="site-demo-fala site-demo-ela">Amanhã a <strong>Dra. Ana Lima</strong> tem 10h, 11h30 e 15h livres.</span>,
    <span key="p2" className="site-demo-fala site-demo-clinica">{PERGUNTA_2}</span>,
    <div key="c" className="site-demo-confirma">
      <span className="site-demo-confirma-titulo">Confirma este agendamento?</span>
      <span>Mariana Costa · Toxina</span>
      <span className="site-muted">Amanhã, 15h · Dra. Ana Lima</span>
      <span className="site-demo-confirma-botoes">
        <span className={`site-demo-botao${confirmado ? ' apertado' : ''}`}>{confirmado && <Check size={14} />}Confirmar</span>
        <span className="site-demo-botao site-demo-botao-neutro">Cancelar</span>
      </span>
    </div>,
    <span key="ok" className="site-demo-evento"><Check size={14} />Agendado para amanhã, 15h</span>,
  ]
  return (
    <div ref={ref} className="site-demo site-demo-copilot" data-demo="copilot" data-passo={passo} aria-hidden="true">
      <div className="site-demo-topo">
        <span className="site-demo-avatar site-demo-avatar-copilot"><Sparkles size={15} /></span>
        <span className="site-demo-quem"><strong>Copilot</strong><span className="site-muted">Mostra antes de gravar</span></span>
      </div>
      <div className="site-demo-falas">
        {conversa.slice(0, itens)}
        {pensando && <Digitando lado="ela" />}
      </div>
      <div className="site-demo-campo">
        {campo
          ? <span key={passo} className="site-demo-digitado">{campo}</span>
          : <span className="site-muted">Peça algo ao Copilot…</span>}
        <Send size={15} />
      </div>
    </div>
  )
}

function Digitando({ lado }: { lado: 'ela' | 'clinica' }) {
  return <span className={`site-demo-fala site-demo-${lado} site-demo-digitando`}><i /><i /><i /></span>
}
