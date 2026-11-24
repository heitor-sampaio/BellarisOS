'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { ClipboardList, Copy, MessageCircle } from 'lucide-react'
import { formatDate, formatTime } from '@estetica-os/utils'
import { rotaCliente } from '@/lib/rotas'
import {
  situacaoDoPreAtendimento, gerarLinkDoPreAtendimento, enviarFichaPelaConversa, linkDaFichaDeNovo, completarNascimentoDaCliente,
  type SituacaoDoPreAtendimento, type LinkDoPreAtendimento,
} from '@/actions/pre-atendimento'
import { useFuso } from '@/components/shared/fuso'
import { Dica } from '@/components/shared/dica'
import { textoDaFichaValida } from '@/lib/pre-atendimento/validade'

/**
 * A ficha de pré-atendimento na janela do agendamento (2026-10-20): se a da
 * cliente está pendente ou já veio, e — pendente — o link para quem não usa o
 * app (copiar, ou abrir no WhatsApp do aparelho; com a rede mandando também
 * pela conversa, pelo WhatsApp da clínica — 2026-10-21). Só o estado: as respostas
 * são do prontuário, e aparecem na sessão.
 *
 * Nenhuma ficha mandada para este agendamento (o envio automático da rede
 * desligado, que é o padrão, ou a ficha respondida há pouco): quem tem a agenda
 * em Gerenciar manda daqui mesmo — "Enviar a ficha" abre o pendente na hora
 * (A49 da 6ª simulação). Quem só vê não vê o bloco.
 */
export function PreAtendimentoDoAgendamento({ appointmentId, slug, podeMandar }: { appointmentId: string; slug?: string; podeMandar: boolean }) {
  const fuso = useFuso()
  const pathname = usePathname()
  const [situacao, setSituacao] = useState<SituacaoDoPreAtendimento | null>(null)
  const [link, setLink] = useState<LinkDoPreAtendimento | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [gerando, iniciar] = useTransition()
  const [nascimento, setNascimento] = useState('')
  // Relida depois de completar o nascimento (A12 da 10ª).
  const [leitura, setLeitura] = useState(0)

  useEffect(() => {
    let vivo = true
    situacaoDoPreAtendimento(appointmentId).then(r => {
      if (vivo && !('error' in r)) setSituacao(r)
    }).catch(() => { /* sem o estado, o bloco não aparece */ })
    return () => { vivo = false }
  }, [appointmentId, leitura])

  if (!situacao?.estado) return null
  const naoEnviada = situacao.estado === 'NAO_ENVIADA'
  if (naoEnviada && !podeMandar) return null

  if (situacao.estado === 'RESPONDIDO') {
    return (
      <div data-pre-atendimento-do-agendamento className="pre-atendimento-agendamento">
        <span className="chip chip-success">
          Ficha de saúde respondida{situacao.respondidoEm ? ` em ${formatDate(situacao.respondidoEm, fuso)}` : ''}
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

  // A12 da 10ª: sem CPF nem nascimento, o nascimento se completa aqui — e o link sai.
  function salvarNascimento() {
    setErro(null)
    iniciar(async () => {
      const r = await completarNascimentoDaCliente(appointmentId, nascimento)
      if ('error' in r) setErro(r.error)
      else setLeitura(n => n + 1)
    })
  }

  // A22 da 9ª: o link que ainda vale, o MESMO — sem gerar outro (que cancela este).
  function deNovo() {
    setErro(null)
    iniciar(async () => {
      const r = await linkDaFichaDeNovo(appointmentId)
      if ('error' in r) setErro(r.error)
      else setLink(r.link)
    })
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch { /* o campo continua selecionável */ }
  }

  // Como o link funciona: mora na dica do chip (2026-11-16, "A explicação mora na
  // dica"). Sem CPF, o "complete a data de nascimento" pede uma ação: fica à vista.
  const comoFunciona = naoEnviada && !link && !enviado
    ? 'Enviar a ficha gera o link: ela confirma o CPF (ou o nascimento) e responde pelo celular — e, se tiver o app, a ficha aparece lá também.'
    : 'A cliente recebe no app. Sem o app, mande o link: ela confirma o CPF (ou o nascimento) e responde pelo celular.'

  return (
    <div data-pre-atendimento-do-agendamento className="pre-atendimento-agendamento">
      <div className="pre-atendimento-agendamento-topo">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {naoEnviada && !link && !enviado ? (
            <span className="chip chip-muted">
              <ClipboardList size={12} aria-hidden="true" /> Ficha de saúde
            </span>
          ) : (
            <span className="chip chip-warning">
              <ClipboardList size={12} aria-hidden="true" /> Ficha de saúde pendente
            </span>
          )}
          {situacao.podeLink && <Dica rotulo="Como a ficha chega à cliente">{comoFunciona}</Dica>}
        </span>
        {podeMandar && situacao.podeLink && !link && !enviado && (
          <div className="pre-atendimento-agendamento-acoes">
            {situacao.pelaConversa && (
              <button type="button" className="btn-primary pre-atendimento-agendamento-botao" disabled={gerando} onClick={pelaConversa}>
                <MessageCircle size={13} aria-hidden="true" /> Mandar pela conversa
              </button>
            )}
            <button type="button" className="btn-secondary pre-atendimento-agendamento-botao" disabled={gerando} onClick={gerar}>
              {gerando ? 'Gerando…' : situacao.linkValidoAte ? 'Gerar outro link' : 'Enviar a ficha'}
            </button>
          </div>
        )}
      </div>
      {naoEnviada && !link && !enviado && (
        <p data-ficha-valida={situacao.fichaValida ? '' : undefined} className="pre-atendimento-agendamento-texto">
          {/* A1 da 26ª: com a ficha válida, ela é dita (até quando) — não "não foi enviada". */}
          {situacao.fichaValida
            ? textoDaFichaValida(situacao.fichaValida, iso => formatDate(iso, fuso))
            : 'A ficha de saúde não foi enviada para este agendamento.'}
        </p>
      )}
      {!situacao.podeLink && (
        <p className="pre-atendimento-agendamento-texto">
          {naoEnviada && !link && !enviado
            ? 'Para quem não tem CPF, complete a data de nascimento para enviar o link — ou responda a ficha aqui, no atendimento.'
            : 'Para quem não tem CPF, complete a data de nascimento para enviar o link. Sem um dos dois, a ficha vai só pelo app — ou é respondida aqui, no atendimento.'}
        </p>
      )}
      {/* A6 da 17ª (princípio 3): "pendente" com "Enviar a ficha" parecia que
          nada tinha saído — o aviso ao app já foi, ao agendar. */}
      {situacao.estado === 'PENDENTE' && situacao.noAppEm && !enviado && (
        <p data-ficha-no-app className="pre-atendimento-agendamento-texto">
          Mandada ao app da cliente ao agendar, em {formatDate(situacao.noAppEm, fuso)} às {formatTime(situacao.noAppEm, fuso)}.
          {situacao.podeLink ? ' O link é para mandar de novo, ou a quem não usa o app.' : ''}
        </p>
      )}
      {!situacao.podeLink && situacao.podeCompletarNascimento && (
        <div data-completar-nascimento className="pre-atendimento-agendamento-acoes" style={{ alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="field-label">Data de nascimento</span>
            <input type="date" className="field" value={nascimento} onChange={e => setNascimento(e.target.value)} />
          </label>
          <button type="button" className="btn-primary pre-atendimento-agendamento-botao" disabled={gerando || !nascimento} onClick={salvarNascimento}>
            Salvar o nascimento
          </button>
        </div>
      )}
      {!situacao.podeLink && situacao.clienteId && (
        <Link href={`${rotaCliente(pathname, slug, situacao.clienteId)}?aba=dados`} className="btn-secondary pre-atendimento-agendamento-botao" style={{ alignSelf: 'flex-start' }}>
          Editar o cadastro
        </Link>
      )}
      {situacao.linkValidoAte && !link && !enviado && (
        <div className="pre-atendimento-agendamento-link">
          <p className="pre-atendimento-agendamento-texto">
            Já há um link valendo até {formatDate(situacao.linkValidoAte, fuso)} às {formatTime(situacao.linkValidoAte, fuso)}.
            {situacao.linkDeNovo ? ' Mostre-o de novo para copiar ou mandar.' : ''} Gerar outro cancela esse.
          </p>
          {podeMandar && situacao.linkDeNovo && (
            <button type="button" className="btn-secondary pre-atendimento-agendamento-botao" style={{ alignSelf: 'flex-start' }} disabled={gerando} onClick={deNovo}>
              <Copy size={13} aria-hidden="true" /> Mostrar o link de novo
            </button>
          )}
        </div>
      )}
      {enviado && <p role="status" className="pre-atendimento-agendamento-texto">Link enviado pela conversa do WhatsApp da rede.</p>}
      {erro && <p role="alert" className="pre-atendimento-agendamento-erro">{erro}</p>}
      {link && (
        <div className="pre-atendimento-agendamento-link">
          <p className="pre-atendimento-agendamento-texto" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span>Vale até {formatDate(link.expiraEm, fuso)} às {formatTime(link.expiraEm, fuso)}.</span>
            <Dica rotulo="Sobre a validade do link">Enquanto valer, ele se mostra de novo nesta janela (“Mostrar o link de novo”).</Dica>
          </p>
          <input className="field" readOnly value={link.url} aria-label="Link da ficha" onFocus={e => e.currentTarget.select()} />
          <div className="pre-atendimento-agendamento-acoes">
            <button type="button" className="btn-secondary pre-atendimento-agendamento-botao" onClick={() => copiar(link.url)}>
              <Copy size={13} aria-hidden="true" /> {copiado ? 'Copiado' : 'Copiar link'}
            </button>
            <a href={link.whatsapp} target="_blank" rel="noopener noreferrer" className="btn-primary pre-atendimento-agendamento-botao">
              <MessageCircle size={13} aria-hidden="true" /> Abrir no WhatsApp do aparelho
            </a>
            {/* A31 da 7ª: numa rede sem WhatsApp ligado, o botão parecia o da
                clínica. É o wa.me (§9.4): abre o WhatsApp de quem está neste
                computador ou celular, com a mensagem pronta. O botão diz "do
                aparelho"; o resto mora na dica (2026-11-16). */}
            <Dica rotulo="Qual WhatsApp abre">
              <span data-whatsapp-do-aparelho>
                {situacao.pelaConversa
                  ? 'Abre o WhatsApp deste computador ou celular, com a mensagem pronta. Para mandar pelo WhatsApp da rede, use “Mandar pela conversa”.'
                  : 'Abre o WhatsApp deste computador ou celular, com a mensagem pronta — não é um WhatsApp ligado à rede.'}
              </span>
            </Dica>
          </div>
        </div>
      )}
    </div>
  )
}
