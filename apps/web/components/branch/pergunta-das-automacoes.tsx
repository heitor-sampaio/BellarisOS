'use client'

import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { JanelaModal } from '@/components/shared/janela-modal'
import { Dica } from '@/components/shared/dica'
import { perguntaDasAutomacoes } from '@/lib/crm/mover-da-etapa'

type Resposta = { automacoes: string[] } | { error: string }

/**
 * "Mover dispara a automação “X”. Disparar?" ao mover UM card pela tela (A35
 * da 22ª; o Heitor, 2026-11-18: "Também ao arrastar um"). O quadro, o menu do
 * card, o painel do inbox e o modal chamam `perguntar` antes de mover:
 *
 * - sem automação que case com a mudança → `true` na hora (move direto);
 * - "Sim" → `true`; "Não" → `false` (move sem disparar);
 * - fechar a janela, ou a consulta recusada → `null` (não move).
 */
export function usePerguntaDasAutomacoes() {
  const [nomes, setNomes] = useState<string[] | null>(null)
  const resolver = useRef<((v: boolean | null) => void) | null>(null)

  const perguntar = useCallback(async (consultar: () => Promise<Resposta>): Promise<boolean | null> => {
    let r: Resposta
    try { r = await consultar() } catch { r = { error: 'Não foi possível conferir as automações.' } }
    if ('error' in r) { toast.error(r.error); return null }
    if (!r.automacoes.length) return true
    return new Promise<boolean | null>(resolve => {
      resolver.current = resolve
      setNomes(r.automacoes)
    })
  }, [])

  const responder = useCallback((v: boolean | null) => {
    const r = resolver.current
    resolver.current = null
    setNomes(null)
    r?.(v)
  }, [])

  const janela = nomes ? <PerguntaDasAutomacoes nomes={nomes} onResponder={responder} /> : null
  return { perguntar, janela }
}

export function PerguntaDasAutomacoes({ nomes, onResponder }: {
  nomes: string[]
  onResponder: (disparar: boolean | null) => void
}) {
  return (
    <JanelaModal rotulo="Disparar as automações?" largura={420} papel="alertdialog" onFechar={() => onResponder(null)}>
      <div data-pergunta-das-automacoes style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
          Disparar as automações?
          <Dica rotulo="Sobre o Não">No “Não”, a oportunidade muda de etapa e a automação não roda.</Dica>
        </h2>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>{perguntaDasAutomacoes(nomes)}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={() => onResponder(false)}>Não</button>
          <button type="button" className="btn-primary" onClick={() => onResponder(true)}>Sim</button>
        </div>
      </div>
    </JanelaModal>
  )
}
