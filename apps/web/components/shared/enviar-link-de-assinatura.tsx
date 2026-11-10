'use client'

import { useState, useTransition } from 'react'
import { Copy, Link2, MessageCircle } from 'lucide-react'
import { formatDate, formatTime } from '@estetica-os/utils'
import { gerarLinkDeAssinatura } from '@/actions/documentos'

type Link = NonNullable<Awaited<ReturnType<typeof gerarLinkDeAssinatura>>['link']>

/**
 * "Enviar link" de assinatura onde a assinatura é pedida (A8 da 11ª simulação,
 * 2026-11-10: só a ficha → Documentos tinha o link; a janela da agenda e o
 * passo Documentação do checkout tinham só "Colher assinatura", e sair do
 * checkout para pegar o link o reabria do início). O MESMO
 * `gerarLinkDeAssinatura` da ficha: uso único, 7 dias, um ativo por documento
 * (gerar outro revoga o anterior), o link se mostra uma vez.
 */
export function EnviarLinkDeAssinatura({ documentoId, jaEnviadoAte, compacto = false }: {
  documentoId: string
  /** Há um link valendo (até quando): o botão diz "Novo link". */
  jaEnviadoAte?: string | null
  compacto?: boolean
}) {
  const [link, setLink] = useState<Link | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [ocupado, iniciar] = useTransition()

  function gerar() {
    setErro(null); setCopiado(false)
    iniciar(async () => {
      const r = await gerarLinkDeAssinatura(documentoId)
      if (r.error || !r.link) { setErro(r.error ?? 'Não consegui gerar o link.'); return }
      setLink(r.link)
    })
  }

  async function copiar(texto: string) {
    try { await navigator.clipboard.writeText(texto); setCopiado(true) } catch { setCopiado(false) }
  }

  const botao = { padding: compacto ? '4px 10px' : '6px 12px', fontSize: 'var(--text-xs-sz)', display: 'inline-flex', alignItems: 'center', gap: 5 } as const
  return (
    <div data-enviar-link-de-assinatura style={{ display: 'flex', flexDirection: 'column', gap: 6, flexBasis: '100%' }}>
      {!link && (
        <button type="button" className="btn-secondary" disabled={ocupado} onClick={gerar} style={{ ...botao, alignSelf: 'flex-start' }}>
          <Link2 size={13} aria-hidden="true" /> {ocupado ? 'Gerando…' : jaEnviadoAte ? 'Novo link de assinatura' : 'Enviar link de assinatura'}
        </button>
      )}
      {!link && jaEnviadoAte && (
        <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
          Já há um link valendo até {formatDate(jaEnviadoAte)} às {formatTime(jaEnviadoAte)}: gerar outro cancela esse.
        </span>
      )}
      {erro && <span role="alert" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--danger)' }}>{erro}</span>}
      {link && (
        <div data-link-de-assinatura style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 'var(--radius-field)', background: 'var(--bg-app)', border: '1px solid var(--border)' }}>
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', margin: 0 }}>
            Link de uso único, vale até {formatDate(link.expiraEm)} às {formatTime(link.expiraEm)}. A cliente confirma {link.pede === 'CPF' ? 'o CPF' : 'a data de nascimento'} antes de ver o documento.
            Ele só aparece agora: se perder, gere outro.
          </p>
          <input className="field" readOnly value={link.url} aria-label="Link de assinatura" onFocus={e => e.currentTarget.select()} style={{ fontSize: 'var(--text-xs-sz)' }} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary" onClick={() => copiar(link.url)} style={botao}>
              <Copy size={13} aria-hidden="true" /> {copiado ? 'Copiado' : 'Copiar link'}
            </button>
            <a href={link.whatsapp} target="_blank" rel="noopener noreferrer" className="btn-primary" style={botao}>
              <MessageCircle size={13} aria-hidden="true" /> Abrir no WhatsApp
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
