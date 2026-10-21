'use client'

import { useEffect, useState, useTransition } from 'react'
import { ClipboardList, Copy, MessageCircle } from 'lucide-react'
import { formatDate, formatTime } from '@estetica-os/utils'
import {
  situacaoDoPreAtendimento, gerarLinkDoPreAtendimento, enviarFichaPelaConversa,
  type SituacaoDoPreAtendimento, type LinkDoPreAtendimento,
} from '@/actions/pre-atendimento'

/**
 * A ficha de pré-atendimento na janela do agendamento (2026-10-20): se a da
 * cliente está pendente ou já veio, e — pendente — o link para quem não usa o
 * app (copiar, ou abrir no WhatsApp do aparelho; com a rede mandando também
 * pela conversa, pelo WhatsApp da clínica — 2026-10-21). Só o estado: as respostas
 * são do prontuário, e aparecem na sessão.
 *
 * Sem envio ligado na rede (nenhuma ficha mandada), não mostra nada.
 */
export function PreAtendimentoDoAgendamento({ appointmentId, podeMandar }: { appointmentId: string; podeMandar: boolean }) {
  const [situacao, setSituacao] = useState<SituacaoDoPreAtendimento | null>(null)
  const [link, setLink] = useState<LinkDoPreAtendimento | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [gerando, iniciar] = useTransition()

  useEffect(() => {
    let vivo = true
    situacaoDoPreAtendimento(appointmentId).then(r => {
      if (vivo && !('error' in r)) setSituacao(r)
    }).catch(() => { /* sem o estado, o bloco não aparece */ })
    return () => { vivo = false }
  }, [appointmentId])

  if (!situacao?.estado) return null

  if (situacao.estado === 'RESPONDIDO') {
    return (
      <div data-pre-atendimento-do-agendamento className="pre-atendimento-agendamento">
        <span className="chip chip-success">
          Ficha de saúde respondida{situacao.respondidoEm ? ` em ${formatDate(situacao.respondidoEm)}` : ''}
        </span>
      </div>
    )
  }

  function gerar() {
    setErro(null)
    iniciar(async () => {
      const r = await gerarLinkDoPreAtendimento(appointmentId)
      if ('error' in r) setErro(r.error)
      else setLink(r.link)
    })
  }

  function pelaConversa() {
    setErro(null)
    iniciar(async () => {
      const r = await enviarFichaPelaConversa(appointmentId)
      if ('enviado' in r) { setEnviado(true); return }
      setErro(r.error)
      // Gerado e não enviado: o link volta para copiar.
      if (r.link) setLink(r.link)
    })
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch { /* o campo continua selecionável */ }
  }

  return (
    <div data-pre-atendimento-do-agendamento className="pre-atendimento-agendamento">
      <div className="pre-atendimento-agendamento-topo">
        <span className="chip chip-warning">
          <ClipboardList size={12} aria-hidden="true" /> Ficha de saúde pendente
        </span>
        {podeMandar && situacao.podeLink && !link && !enviado && (
          <div className="pre-atendimento-agendamento-acoes">
            {situacao.pelaConversa && (
              <button type="button" className="btn-primary pre-atendimento-agendamento-botao" disabled={gerando} onClick={pelaConversa}>
                <MessageCircle size={13} aria-hidden="true" /> Mandar pela conversa
              </button>
            )}
            <button type="button" className="btn-secondary pre-atendimento-agendamento-botao" disabled={gerando} onClick={gerar}>
              {gerando ? 'Gerando…' : 'Enviar a ficha'}
            </button>
          </div>
        )}
      </div>
      <p className="pre-atendimento-agendamento-texto">
        {situacao.podeLink
          ? 'A cliente recebe no app. Sem o app, mande o link: ela confirma o CPF (ou o nascimento) e responde pelo celular.'
          : 'Sem CPF nem data de nascimento no cadastro, a ficha vai só pelo app — ou é respondida aqui, no atendimento.'}
      </p>
      {enviado && <p role="status" className="pre-atendimento-agendamento-texto">Link enviado pela conversa do WhatsApp da clínica.</p>}
      {erro && <p role="alert" className="pre-atendimento-agendamento-erro">{erro}</p>}
      {link && (
        <div className="pre-atendimento-agendamento-link">
          <p className="pre-atendimento-agendamento-texto">
            Vale até {formatDate(link.expiraEm)} às {formatTime(link.expiraEm)}. Ele só aparece agora: se perder, gere outro.
          </p>
          <input className="field" readOnly value={link.url} aria-label="Link da ficha" onFocus={e => e.currentTarget.select()} />
          <div className="pre-atendimento-agendamento-acoes">
            <button type="button" className="btn-secondary pre-atendimento-agendamento-botao" onClick={() => copiar(link.url)}>
              <Copy size={13} aria-hidden="true" /> {copiado ? 'Copiado' : 'Copiar link'}
            </button>
            <a href={link.whatsapp} target="_blank" rel="noopener noreferrer" className="btn-primary pre-atendimento-agendamento-botao">
              <MessageCircle size={13} aria-hidden="true" /> Abrir no WhatsApp
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
