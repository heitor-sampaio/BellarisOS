'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { X, GitBranch, RotateCcw, RefreshCw } from 'lucide-react'
import {
  versoesDaAutomacao, lerVersao, type VersaoNaLista,
} from '@/actions/automacoes'
import type { GrafoDeAutomacao, LimitesDaAutomacao } from '@estetica-os/types'

/**
 * O histórico do grafo.
 *
 * `automations.versao` só contava desde a Fase 1 — cada salvamento
 * incrementava um número que ninguém conseguia consultar. O buraco aparece no
 * dia em que alguém mexe num fluxo que estava funcionando, e "estava
 * funcionando" é justamente o que se perdia.
 *
 * **Restaurar não salva.** A versão antiga entra no editor como rascunho e só
 * vira realidade quando a pessoa salvar — a mesma regra do resto do editor. Um
 * clique por engano não pode trocar em silêncio um fluxo que está no ar.
 */

const quando = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })

export function PainelDeVersoes({
  automacaoId, podeEditar, onFechar, onRestaurar,
}: {
  automacaoId: string
  podeEditar: boolean
  onFechar: () => void
  onRestaurar: (v: { nome: string; grafo: GrafoDeAutomacao; limites: LimitesDaAutomacao }) => void
}) {
  const [versoes, setVersoes] = useState<VersaoNaLista[]>([])
  const [carregando, agir]    = useTransition()

  const recarregar = useCallback(() => {
    agir(async () => { setVersoes(await versoesDaAutomacao(automacaoId)) })
  }, [automacaoId])

  useEffect(() => { recarregar() }, [recarregar])

  function restaurar(v: VersaoNaLista) {
    agir(async () => {
      const conteudo = await lerVersao(v.id)
      if (!conteudo) { toast.error('Não consegui ler esta versão.'); return }
      onRestaurar(conteudo)
      toast.success(`Versão ${v.versao} carregada. Confira e salve para valer.`)
    })
  }

  return (
    <aside
      aria-label="Versões da automação"
      style={{
        width: 340, flexShrink: 0, background: 'var(--surface)',
        borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', borderBottom: '1px solid var(--hairline)', gap: 8,
      }}>
        <span style={{
          fontWeight: 'var(--weight-extrabold)', fontSize: 'var(--text-sm-sz)',
          display: 'flex', alignItems: 'center', gap: 7,
        }}>
          <GitBranch size={15} /> Versões
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button" onClick={recarregar} className="btn-ghost"
            aria-label="Atualizar" style={{ padding: 4 }} disabled={carregando}
          >
            <RefreshCw size={14} />
          </button>
          <button type="button" onClick={onFechar} className="btn-ghost" aria-label="Fechar" style={{ padding: 4 }}>
            <X size={15} />
          </button>
        </div>
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {versoes.length === 0 && !carregando && (
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', padding: 8, lineHeight: 1.6 }}>
            Nenhuma versão guardada ainda. Cada salvamento daqui em diante deixa
            um retrato do fluxo aqui.
          </p>
        )}

        {versoes.map(v => (
          <div key={v.id} className="card-sm" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-xs-sz)' }}>
                Versão {v.versao}
                {v.atual && (
                  <span style={{
                    marginLeft: 6, fontSize: 10, fontWeight: 'var(--weight-bold)',
                    color: 'var(--success)',
                  }}>
                    no ar
                  </span>
                )}
              </span>
              <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{quando(v.quando)}</span>
            </div>

            <span style={{ fontSize: 11, color: 'var(--text-soft)' }}>
              {v.nome} · {v.nos} {v.nos === 1 ? 'passo' : 'passos'}, {v.ligacoes}{' '}
              {v.ligacoes === 1 ? 'ligação' : 'ligações'}
              {v.por ? ` · ${v.por}` : ''}
            </span>

            {podeEditar && !v.atual && (
              <button
                type="button" className="btn-ghost" disabled={carregando}
                style={{
                  alignSelf: 'flex-start', fontSize: 11, display: 'flex',
                  alignItems: 'center', gap: 5, color: 'var(--brand)',
                }}
                onClick={() => restaurar(v)}
              >
                <RotateCcw size={12} /> Voltar para esta
              </button>
            )}
          </div>
        ))}

        <p style={{ fontSize: 10.5, color: 'var(--text-muted)', padding: '4px 8px', lineHeight: 1.6 }}>
          Voltar para uma versão <strong>carrega</strong> o fluxo dela na tela —
          nada muda até você salvar. O histórico guarda os últimos 30
          salvamentos.
        </p>
      </div>
    </aside>
  )
}
