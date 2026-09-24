'use client'

import { useState, useEffect, useTransition, useRef } from 'react'
import { Zap, Plus, Pencil, Trash2, X, Search } from 'lucide-react'
import {
  listQuickReplies, saveQuickReply, deleteQuickReply, type QuickReply,
} from '@/actions/quick-replies'

/**
 * Respostas rápidas na conversa.
 *
 * Fica junto do compositor, e não numa tela de configuração, porque quem
 * escreve o atalho é quem atende: percebe que digitou a mesma coisa pela quinta
 * vez e guarda ali mesmo. Ter que sair da conversa para isso faz a biblioteca
 * nunca ser alimentada.
 */
export function InboxQuickReplies({
  canEdit, busca, onEscolher, onClose,
}: {
  canEdit:    boolean
  /** Texto digitado depois da `/`, para filtrar sem sair do compositor. */
  busca:      string
  onEscolher: (texto: string) => void
  onClose:    () => void
}) {
  const [itens,   setItens]   = useState<QuickReply[] | null>(null)
  const [erro,    setErro]    = useState<string | null>(null)
  const [editando, setEditando] = useState<QuickReplyInput | null>(null)
  const [filtro,  setFiltro]  = useState(busca)
  const [isPending, startTransition] = useTransition()
  const buscaRef = useRef<HTMLInputElement>(null)

  useEffect(() => { recarregar() }, [])
  useEffect(() => { setFiltro(busca) }, [busca])

  function recarregar() {
    listQuickReplies()
      .then(setItens)
      .catch(e => { setItens([]); setErro(e instanceof Error ? e.message : 'Erro ao carregar') })
  }

  const visiveis = (itens ?? []).filter(q => {
    const t = filtro.trim().toLowerCase()
    if (!t) return true
    return q.title.toLowerCase().includes(t) || q.content.toLowerCase().includes(t)
  })

  function salvar() {
    if (!editando) return
    setErro(null)
    startTransition(async () => {
      const res = await saveQuickReply(editando)
      if (!res.ok) { setErro(res.error ?? 'Erro ao salvar'); return }
      setEditando(null)
      recarregar()
    })
  }

  function apagar(q: QuickReply) {
    if (!confirm(`Apagar o atalho "${q.title}"?`)) return
    setErro(null)
    startTransition(async () => {
      const res = await deleteQuickReply(q.id)
      if (!res.ok) { setErro(res.error ?? 'Erro ao apagar'); return }
      recarregar()
    })
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(17,17,17,.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="card"
        style={{ width: 520, maxWidth: '100%', maxHeight: '80vh', padding: 0, display: 'flex', flexDirection: 'column' }}
      >
        <div style={{
          padding: '13px 18px', borderBottom: '1px solid var(--hairline)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={15} color="var(--brand)" />
            <p style={{ margin: 0, fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)' }}>
              Respostas rápidas
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost" style={{ height: 30, padding: '0 8px' }}>
            <X size={15} />
          </button>
        </div>

        {editando ? (
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label className="overline" style={{ color: 'var(--text-muted)' }}>Nome do atalho</label>
              <input
                value={editando.title}
                onChange={e => setEditando({ ...editando, title: e.target.value })}
                placeholder="Preço da limpeza de pele"
                className="field"
                style={{ fontSize: 'var(--text-base-sz)' }}
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label className="overline" style={{ color: 'var(--text-muted)' }}>Texto</label>
              <textarea
                value={editando.content}
                onChange={e => setEditando({ ...editando, content: e.target.value })}
                rows={6}
                placeholder="A limpeza de pele profunda sai por R$ 180 e leva cerca de 1h…"
                className="field"
                style={{ fontSize: 'var(--text-base-sz)', resize: 'vertical' }}
              />
            </div>
            {erro && <Erro texto={erro} />}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => { setEditando(null); setErro(null) }} className="btn-ghost">
                Cancelar
              </button>
              <button type="button" onClick={salvar} disabled={isPending} className="btn-primary">
                {isPending ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ padding: '12px 18px 0', display: 'flex', gap: 8 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={13} color="var(--text-faint)" style={{ position: 'absolute', left: 10, top: 11 }} />
                <input
                  ref={buscaRef}
                  value={filtro}
                  onChange={e => setFiltro(e.target.value)}
                  placeholder="Buscar…"
                  className="field campo-busca"
                  style={{ fontSize: 'var(--text-base-sz)', paddingLeft: 30, width: '100%' }}
                  autoFocus
                />
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setEditando({ title: filtro.trim(), content: '' })}
                  className="btn-primary"
                  style={{ height: 36, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}
                >
                  <Plus size={14} /> Novo
                </button>
              )}
            </div>

            <div style={{ padding: 12, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {erro && <Erro texto={erro} />}

              {itens === null ? (
                <p style={{ padding: 8, fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', margin: 0 }}>Carregando…</p>
              ) : visiveis.length === 0 ? (
                <p style={{ padding: 12, fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)', margin: 0, lineHeight: 1.5 }}>
                  {itens.length === 0
                    ? 'Nenhuma resposta rápida ainda. Guarde aqui o que você já digitou três vezes hoje: preço, horário de funcionamento, como chegar.'
                    : 'Nada encontrado com esse termo.'}
                </p>
              ) : visiveis.map(q => (
                <div
                  key={q.id}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    padding: '9px 10px', borderRadius: 9,
                    border: '1px solid var(--hairline)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => { onEscolher(q.content); onClose() }}
                    style={{
                      flex: 1, textAlign: 'left', border: 'none', background: 'none',
                      cursor: 'pointer', padding: 0, minWidth: 0,
                    }}
                  >
                    <p style={{ margin: 0, fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)' }}>
                      {q.title}
                    </p>
                    <p style={{
                      margin: '2px 0 0', fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)',
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}>
                      {q.content}
                    </p>
                  </button>
                  {canEdit && (
                    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                      <button type="button" title="Editar"
                        onClick={() => setEditando({ id: q.id, title: q.title, content: q.content })}
                        className="btn-ghost" style={{ height: 28, padding: '0 7px' }}>
                        <Pencil size={12} />
                      </button>
                      <button type="button" title="Apagar"
                        onClick={() => apagar(q)}
                        className="btn-ghost" style={{ height: 28, padding: '0 7px', color: 'var(--danger)' }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

interface QuickReplyInput { id?: string; title: string; content: string }

function Erro({ texto }: { texto: string }) {
  return (
    <div style={{
      padding: '8px 12px', borderRadius: 8,
      background: 'var(--danger-soft)', border: '1px solid color-mix(in srgb, var(--danger) 20%, transparent)',
      fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600,
    }}>
      {texto}
    </div>
  )
}
