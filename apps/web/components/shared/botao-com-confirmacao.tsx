'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { JanelaModal } from '@/components/shared/janela-modal'

/**
 * Um botão cuja ação pede confirmação antes (2026-10-21): desativar membro e
 * unidade eram um clique só (atrito da simulação de um dia de clínica), e
 * desativar o membro também bloqueia o login dele.
 *
 * `acao` pode ser uma server action (a página do servidor passa a dela).
 */
export function BotaoComConfirmacao({
  acao, titulo, explicacao, rotuloConfirmar, children, title, className = 'btn-ghost', style,
}: {
  acao:            () => Promise<unknown>
  /** A pergunta, que também é o nome da janela ("Desativar membro?"). */
  titulo:          string
  explicacao:      React.ReactNode
  rotuloConfirmar: string
  children:        React.ReactNode
  title?:          string
  className?:      string
  style?:          React.CSSProperties
}) {
  const router = useRouter()
  const [aberta, setAberta] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [fazendo, iniciar] = useTransition()

  function confirmar() {
    setErro(null)
    iniciar(async () => {
      try {
        const r = await acao() as { error?: string } | undefined
        if (r && typeof r === 'object' && r.error) { setErro(r.error); return }
        setAberta(false)
        router.refresh()
      } catch {
        setErro('Não deu certo. Tente de novo.')
      }
    })
  }

  return (
    <>
      <button type="button" className={className} style={style} title={title} aria-label={title} onClick={() => setAberta(true)}>
        {children}
      </button>
      {aberta && (
        <JanelaModal rotulo={titulo} largura={440} travado={fazendo} onFechar={() => setAberta(false)}>
          <div style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>{titulo}</h2>
            <div style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', lineHeight: 1.5 }}>{explicacao}</div>
            {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600 }}>{erro}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" disabled={fazendo} onClick={() => setAberta(false)}>Voltar</button>
              <button type="button" className="btn-primary" disabled={fazendo} onClick={confirmar}>
                {fazendo ? 'Um momento…' : rotuloConfirmar}
              </button>
            </div>
          </div>
        </JanelaModal>
      )}
    </>
  )
}
