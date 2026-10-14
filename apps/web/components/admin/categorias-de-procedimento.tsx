'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Tags, Plus, Loader2, AlertCircle, CheckCircle2, X } from 'lucide-react'
import { JanelaModal } from '@/components/shared/janela-modal'
import {
  listarCategoriasDeProcedimento, criarCategoriaDeProcedimento, renomearCategoriaDeProcedimento,
  arquivarCategoriaDeProcedimento, type CategoriaDeProcedimento,
} from '@/actions/categorias-de-procedimento'

/**
 * Procedimentos → Categorias (2026-10-14): o vocabulário da rede para a
 * categoria do procedimento. A categoria gravada por outro caminho (a
 * importação, o Copilot) entra aqui sozinha; aqui se cria, renomeia — em todos
 * os procedimentos, e junta se o nome já existe — e arquiva (sai das opções
 * do cadastro, mas o procedimento que já está nela continua).
 */

const usoDe = (n: number) => (n === 0 ? 'nenhum procedimento' : `${n} ${n === 1 ? 'procedimento' : 'procedimentos'}`)

function Janela({ onFechar }: { onFechar: (mudou: boolean) => void }) {
  const [lista, setLista] = useState<CategoriaDeProcedimento[] | null>(null)
  const [nova, setNova] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [nomeNovo, setNomeNovo] = useState('')
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)
  const [mudou, setMudou] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Carrega ao abrir (a janela só é montada aberta).
  useEffect(() => {
    let viva = true
    listarCategoriasDeProcedimento().then(l => { if (viva) setLista(l) })
    return () => { viva = false }
  }, [])

  const agir = (fn: () => Promise<{ tom: 'ok' | 'erro'; texto: string } | null>) => {
    setAviso(null)
    startTransition(async () => {
      const r = await fn()
      setLista(await listarCategoriasDeProcedimento())
      if (r) setAviso(r)
    })
  }

  function criar() {
    const nome = nova
    agir(async () => {
      const r = await criarCategoriaDeProcedimento(nome)
      if (!r.ok) return { tom: 'erro', texto: r.error }
      setNova(''); setMudou(true)
      return null
    })
  }

  function salvarNome(c: CategoriaDeProcedimento) {
    const nome = nomeNovo
    agir(async () => {
      const r = await renomearCategoriaDeProcedimento(c.id, nome)
      if (!r.ok) return { tom: 'erro', texto: r.error }
      setEditando(null); setMudou(true)
      const onde = r.procedimentos ? ` em ${usoDe(r.procedimentos)}` : ''
      return { tom: 'ok', texto: r.juntou ? `"${c.nome}" foi juntada com "${r.nome}"${onde}.` : `Renomeada para "${r.nome}"${onde}.` }
    })
  }

  // As ativas primeiro; as arquivadas no fim.
  const visiveis = lista ? [...lista.filter(c => !c.arquivada), ...lista.filter(c => c.arquivada)] : []

  return (
    <JanelaModal onFechar={() => onFechar(mudou)} rotulo="Categorias de procedimento" largura={520} travado={isPending}>
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)', margin: 0 }}>Categorias de procedimento</h2>
            <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.5 }}>
              Organizam o catálogo e os relatórios. Renomear troca em todos os procedimentos; arquivar tira
              das opções do cadastro, mas quem já está nela continua.
            </p>
          </div>
          <button type="button" className="btn-ghost" aria-label="Fechar" onClick={() => onFechar(mudou)} disabled={isPending}>
            <X size={15} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="field" aria-label="Nova categoria" placeholder="Nova categoria" value={nova} maxLength={60}
            onChange={e => setNova(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && nova.trim()) { e.preventDefault(); criar() } }}
            style={{ flex: 1 }}
          />
          <button type="button" className="btn-primary" onClick={criar} disabled={!nova.trim() || isPending}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <Plus size={14} /> Criar categoria
          </button>
        </div>

        {aviso && (
          <div style={{
            display: 'flex', gap: 8, alignItems: 'flex-start', padding: '9px 12px', borderRadius: 'var(--radius-field-token)',
            background: aviso.tom === 'ok' ? 'var(--success-soft)' : 'var(--danger-soft)',
            color: aviso.tom === 'ok' ? 'var(--success)' : 'var(--danger)', fontSize: 'var(--text-sm-sz)', fontWeight: 600,
          }}>
            {aviso.tom === 'ok' ? <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 2 }} /> : <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />}
            <span>{aviso.texto}</span>
          </div>
        )}

        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-field-token)', overflow: 'hidden' }}>
          {!lista && (
            <p style={{ padding: 14, margin: 0, fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)', display: 'flex', gap: 8, alignItems: 'center' }}>
              <Loader2 size={14} className="animate-spin" /> Carregando…
            </p>
          )}
          {lista && visiveis.length === 0 && (
            <p style={{ padding: 14, margin: 0, fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>A rede ainda não tem categorias.</p>
          )}
          {visiveis.map((c, i) => (
            <div key={c.id} data-categoria={c.nome} style={{
              padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              borderTop: i ? '1px solid var(--hairline)' : 'none', opacity: c.arquivada ? 0.7 : 1,
            }}>
              {editando === c.id ? (
                <>
                  <input
                    className="field" aria-label="Novo nome" value={nomeNovo} maxLength={60} autoFocus
                    onChange={e => setNomeNovo(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); salvarNome(c) }
                      if (e.key === 'Escape') { e.stopPropagation(); setEditando(null) }
                    }}
                    style={{ flex: '1 1 200px' }}
                  />
                  <button type="button" className="btn-primary" disabled={!nomeNovo.trim() || isPending} onClick={() => salvarNome(c)}>Salvar</button>
                  <button type="button" className="btn-ghost" disabled={isPending} onClick={() => setEditando(null)}>Cancelar</button>
                </>
              ) : (
                <>
                  <div style={{ flex: '1 1 200px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text)', overflowWrap: 'anywhere' }}>{c.nome}</span>
                    <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)' }}>
                      {usoDe(c.procedimentos)}{c.arquivada && <> · <strong style={{ color: 'var(--warning)' }}>Arquivada</strong></>}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {!c.arquivada && (
                      <button type="button" className="btn-ghost" disabled={isPending}
                        onClick={() => { setEditando(c.id); setNomeNovo(c.nome); setAviso(null) }}>
                        Renomear
                      </button>
                    )}
                    <button type="button" className="btn-ghost" disabled={isPending}
                      onClick={() => agir(async () => {
                        const r = await arquivarCategoriaDeProcedimento(c.id, !c.arquivada)
                        if (r.ok) setMudou(true)
                        return r.ok ? null : { tom: 'erro', texto: r.error ?? 'Não foi possível.' }
                      })}>
                      {c.arquivada ? 'Reativar' : 'Arquivar'}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </JanelaModal>
  )
}

/** O botão da tela de Procedimentos, e a janela. Fechar com mudança recarrega a página. */
export function CategoriasDeProcedimento({ ativas }: { ativas: number }) {
  const router = useRouter()
  const [aberta, setAberta] = useState(false)
  return (
    <>
      <button type="button" className="btn-secondary" onClick={() => setAberta(true)} style={{ gap: 6 }}>
        <Tags size={14} /> Categorias
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          minWidth: 18, height: 18, borderRadius: 99, padding: '0 4px',
          background: 'var(--brand-soft)', color: 'var(--brand)', fontSize: 'var(--text-overline)', fontWeight: 700,
        }}>{ativas}</span>
      </button>
      {aberta && <Janela onFechar={mudou => { setAberta(false); if (mudou) router.refresh() }} />}
    </>
  )
}
