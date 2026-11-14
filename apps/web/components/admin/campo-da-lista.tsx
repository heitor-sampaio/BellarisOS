'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Loader2, Plus, Search, X } from 'lucide-react'
import { contemSemAcento } from '@/lib/texto'
import { criarItemDoEstoque, type ListaDoEstoque } from '@/actions/stock'

export interface ItemDaLista { id: string; nome: string }

const NOVO: Record<ListaDoEstoque, string> = {
  categorias: 'Nova categoria',
  marcas: 'Nova marca',
  fornecedores: 'Novo fornecedor',
}

const chave = (v: string) => v.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR')

/**
 * Categoria, marca ou fornecedor "com lista e campo de busca com autocomplete"
 * (E6/E3 do plano de adaptação, o Heitor, 13/11) — no cadastro do produto, no
 * estoque inicial e na Entrada. Escreve parte do nome (sem acento conta), escolhe
 * da lista; o que não existe se cria ali mesmo ("+ Nova marca “…”"), sem sair do
 * formulário. O id escolhido vai no campo escondido `nome`. Mesmo desenho do
 * "Indicada por" (components/shared/campo-indicada-por.tsx).
 */
export function CampoDaLista({ lista, rotulo, nome, itens, inicial = null, podeCriar = true, aoMudar, placeholder }: {
  lista: ListaDoEstoque
  rotulo: string
  nome: string
  itens: ItemDaLista[]
  /** O escolhido ao abrir: o id (ou o nome) de um item da lista. */
  inicial?: string | null
  podeCriar?: boolean
  aoMudar?: (item: ItemDaLista | null) => void
  placeholder?: string
}) {
  const [criados, setCriados] = useState<ItemDaLista[]>([])
  const todos = useMemo(() => {
    const vistos = new Set(itens.map(i => i.id))
    return [...itens, ...criados.filter(c => !vistos.has(c.id))]
  }, [itens, criados])
  const [escolhido, setEscolhido] = useState<ItemDaLista | null>(() =>
    inicial ? itens.find(i => i.id === inicial) ?? itens.find(i => chave(i.nome) === chave(inicial)) ?? null : null)
  const [termo, setTermo] = useState('')
  const [aberto, setAberto] = useState(false)
  const [ativo, setAtivo] = useState(0)
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const idCampo = useId()
  const idLista = useId()
  const campo = useRef<HTMLInputElement>(null)

  // O item escolhido sumiu da lista (excluído na janela): o campo se esvazia.
  useEffect(() => {
    if (escolhido && !todos.some(i => i.id === escolhido.id)) setEscolhido(null)
  }, [todos, escolhido])

  const busca = termo.trim()
  const achados = useMemo(() => (busca ? todos.filter(i => contemSemAcento([i.nome], busca)) : todos).slice(0, 50), [todos, busca])
  const mesmoNome = busca ? todos.find(i => chave(i.nome) === chave(busca)) : undefined
  const oferecerNovo = podeCriar && !!busca && !mesmoNome
  const opcoes = achados.length + (oferecerNovo ? 1 : 0)

  function escolher(item: ItemDaLista | null) {
    setEscolhido(item)
    setTermo('')
    setAberto(false)
    setErro(null)
    aoMudar?.(item)
    if (!item) requestAnimationFrame(() => campo.current?.focus())
  }

  async function criar() {
    if (!busca || criando) return
    setCriando(true)
    setErro(null)
    const r = await criarItemDoEstoque(lista, busca)
    setCriando(false)
    if (r.error || !r.item) { setErro(r.error ?? 'Não consegui criar.'); return }
    const novo = r.item
    setCriados(c => (c.some(x => x.id === novo.id) ? c : [...c, novo]))
    escolher(novo)
  }

  function teclar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { if (aberto) { e.preventDefault(); e.stopPropagation(); setAberto(false) } return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setAberto(true); setAtivo(a => Math.min(a + 1, Math.max(opcoes - 1, 0))); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo(a => Math.max(a - 1, 0)); return }
    if (e.key === 'Enter') {
      // Enter escolhe — nunca envia o formulário do produto pela metade.
      e.preventDefault()
      if (!aberto || opcoes === 0) return
      if (ativo < achados.length) escolher(achados[ativo]!)
      else void criar()
    }
  }

  const estiloOpcao = (marcada: boolean): React.CSSProperties => ({
    width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', cursor: 'pointer',
    borderBottom: '1px solid var(--hairline)', fontSize: 'var(--text-sm-sz)', color: 'var(--text)',
    background: marcada ? 'var(--bg-app)' : 'none', display: 'flex', alignItems: 'center', gap: 6,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label htmlFor={idCampo} className="field-label">{rotulo}</label>
      <input type="hidden" name={nome} value={escolhido?.id ?? ''} />
      {escolhido ? (
        <div data-campo-escolhido={rotulo} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          minHeight: 'var(--altura-controle)', padding: '0 12px', background: 'var(--brand-soft)',
          border: '1.5px solid var(--brand-soft-border)', borderRadius: 'var(--radius-field-token)',
        }}>
          <span style={{ minWidth: 0, fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-sm-sz)', color: 'var(--brand)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {escolhido.nome}
          </span>
          <button id={idCampo} type="button" aria-label={`Tirar ${rotulo.toLocaleLowerCase('pt-BR')}`} onClick={() => escolher(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand)', lineHeight: 0 }}>
            <X size={14} />
          </button>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <Search size={13} aria-hidden style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }} />
          <input
            ref={campo} id={idCampo}
            type="text" className="field campo-busca" style={{ paddingLeft: 30 }} autoComplete="off"
            role="combobox" aria-expanded={aberto} aria-controls={idLista} aria-autocomplete="list"
            placeholder={placeholder ?? (podeCriar ? 'Buscar ou criar…' : 'Buscar…')}
            value={termo}
            onChange={e => { setTermo(e.target.value); setAberto(true); setAtivo(0); setErro(null) }}
            onFocus={() => setAberto(true)}
            onBlur={() => setTimeout(() => setAberto(false), 150)}
            onKeyDown={teclar}
          />
          {aberto && (
            <div id={idLista} role="listbox" aria-label={rotulo} style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-card-sm)', marginTop: 4, boxShadow: 'var(--shadow-popover)',
              maxHeight: 220, overflow: 'auto',
            }}>
              {achados.map((i, n) => (
                <button key={i.id} type="button" role="option" aria-selected={n === ativo}
                  onMouseDown={e => e.preventDefault()} onClick={() => escolher(i)} onMouseEnter={() => setAtivo(n)}
                  style={estiloOpcao(n === ativo)}>
                  {i.nome}
                </button>
              ))}
              {oferecerNovo && (
                <button type="button" role="option" aria-selected={ativo === achados.length} disabled={criando}
                  onMouseDown={e => e.preventDefault()} onClick={() => void criar()} onMouseEnter={() => setAtivo(achados.length)}
                  style={{ ...estiloOpcao(ativo === achados.length), color: 'var(--brand)', fontWeight: 'var(--weight-bold)' }}>
                  {criando ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Plus size={13} aria-hidden />}
                  {NOVO[lista]} “{busca}”
                </button>
              )}
              {opcoes === 0 && (
                <p style={{ padding: '10px 14px', fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                  {busca ? `Nada com “${busca}”.` : 'A lista está vazia.'}
                </p>
              )}
            </div>
          )}
        </div>
      )}
      {erro && <p role="alert" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--danger)' }}>{erro}</p>}
    </div>
  )
}
