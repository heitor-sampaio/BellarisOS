'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Tags, Award, Truck, Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { JanelaModal } from '@/components/shared/janela-modal'
import { criarItemDoEstoque, renomearItemDoEstoque, excluirItemDoEstoque, type ListaDoEstoque } from '@/actions/stock'

type Item = { id: string; nome: string }

const TEXTOS: Record<ListaDoEstoque, { titulo: string; novo: string; exemplo: string; vazio: string; ajuda: string; ao_excluir: string; icone: typeof Tags }> = {
  categorias: {
    titulo: 'Categorias', novo: 'Nova categoria', exemplo: 'Ex.: Injetáveis', vazio: 'Nenhuma categoria cadastrada ainda.',
    ajuda: 'Organizam os produtos e dão o começo do SKU. Também se criam ali mesmo, no cadastro do produto.',
    ao_excluir: 'Os produtos dela ficam sem categoria (o SKU não muda).', icone: Tags,
  },
  marcas: {
    titulo: 'Marcas', novo: 'Nova marca', exemplo: 'Ex.: Galderma', vazio: 'Nenhuma marca cadastrada ainda.',
    ajuda: 'A marca é escolhida em cada entrada no estoque (e no estoque inicial), e filtra a lista de produtos.',
    ao_excluir: 'As entradas já feitas guardam o nome; ela só sai das opções e do filtro.', icone: Award,
  },
  fornecedores: {
    titulo: 'Fornecedores', novo: 'Novo fornecedor', exemplo: 'Ex.: Distribuidora Sul', vazio: 'Nenhum fornecedor cadastrado ainda.',
    ajuda: 'O fornecedor é escolhido em cada entrada no estoque (e no estoque inicial), e filtra a lista de produtos.',
    ao_excluir: 'As entradas já feitas guardam o nome; ele só sai das opções e do filtro.', icone: Truck,
  },
}

/**
 * Categorias, Marcas e Fornecedores (E1/E4/E5 do plano de adaptação, o Heitor,
 * 13/11): três cadastros de texto livre da rede, com a mesma janela — criar,
 * renomear e excluir. Aparece para quem tem o Estoque em Gerenciar (ser da rede
 * deixou de contar).
 */
export function CadastroDoEstoque({ lista, itens }: { lista: ListaDoEstoque; itens: Item[] }) {
  const t = TEXTOS[lista]
  const Icone = t.icone
  const router = useRouter()
  const [aberta, setAberta] = useState(false)
  const [novo, setNovo] = useState('')
  const [editando, setEditando] = useState<Item | null>(null)
  const [excluindo, setExcluindo] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [gravando, iniciar] = useTransition()

  function fazer(acao: () => Promise<{ error?: string }>, depois?: () => void) {
    setErro(null)
    iniciar(async () => {
      const r = await acao()
      if (r.error) { setErro(r.error); return }
      depois?.()
      router.refresh()
    })
  }

  function fechar() { setAberta(false); setErro(null); setEditando(null); setExcluindo(null); setNovo('') }

  return (
    <>
      <button type="button" className="btn-secondary" style={{ gap: 6 }} onClick={() => setAberta(true)}>
        <Icone size={14} aria-hidden /> {t.titulo}
      </button>
      {aberta && (
        <JanelaModal rotulo={t.titulo} largura={440} travado={gravando} onFechar={fechar}>
          <div style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>{t.titulo}</h2>
              <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 2 }}>{t.ajuda}</p>
            </div>

            <form style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
              onSubmit={e => {
                e.preventDefault()
                fazer(() => criarItemDoEstoque(lista, novo), () => setNovo(''))
              }}>
              <label htmlFor={`novo-${lista}`} className="field-label">{t.novo}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input id={`novo-${lista}`} className="field" maxLength={120} value={novo} onChange={e => setNovo(e.target.value)}
                  placeholder={t.exemplo} autoComplete="off" disabled={gravando} />
                <button type="submit" className="btn-primary" disabled={gravando || !novo.trim()} style={{ flexShrink: 0, gap: 5 }}>
                  <Plus size={14} aria-hidden /> Adicionar
                </button>
              </div>
            </form>

            {itens.length === 0
              ? <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>{t.vazio}</p>
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 340, overflow: 'auto' }}>
                  {itens.map(item => (
                    <div key={item.id} data-item-da-lista={item.nome} style={{
                      display: 'flex', flexDirection: 'column', gap: 6,
                      padding: '7px 10px', background: 'var(--bg-app)', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-field-token)',
                    }}>
                      {editando?.id === item.id ? (
                        <form style={{ display: 'flex', gap: 6 }} onSubmit={e => {
                          e.preventDefault()
                          fazer(() => renomearItemDoEstoque(lista, item.id, editando.nome), () => setEditando(null))
                        }}>
                          <input className="field" aria-label={`Novo nome de ${item.nome}`} value={editando.nome} maxLength={120} autoFocus
                            onChange={e => setEditando({ id: item.id, nome: e.target.value })} disabled={gravando} />
                          <button type="submit" className="btn-primary" aria-label="Salvar" title="Salvar" disabled={gravando || !editando.nome.trim()}><Check size={14} aria-hidden /></button>
                          <button type="button" className="btn-secondary" aria-label="Cancelar" title="Cancelar" onClick={() => setEditando(null)} disabled={gravando}><X size={14} aria-hidden /></button>
                        </form>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-semibold)', color: 'var(--text)', minWidth: 0, overflowWrap: 'anywhere' }}>{item.nome}</span>
                          <span style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                            <button type="button" className="btn-ghost" title="Renomear" aria-label={`Renomear ${item.nome}`}
                              onClick={() => { setExcluindo(null); setEditando({ id: item.id, nome: item.nome }) }} disabled={gravando}><Pencil size={13} aria-hidden /></button>
                            <button type="button" className="btn-ghost" title="Excluir" aria-label={`Excluir ${item.nome}`}
                              onClick={() => { setEditando(null); setExcluindo(item.id) }} disabled={gravando}><Trash2 size={13} aria-hidden /></button>
                          </span>
                        </div>
                      )}
                      {excluindo === item.id && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', flex: '1 1 180px' }}>{t.ao_excluir}</span>
                          <span style={{ display: 'flex', gap: 6 }}>
                            <button type="button" className="btn-secondary" onClick={() => setExcluindo(null)} disabled={gravando}>Cancelar</button>
                            <button type="button" className="btn-primary" disabled={gravando}
                              onClick={() => fazer(() => excluirItemDoEstoque(lista, item.id), () => setExcluindo(null))}>Excluir</button>
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            {erro && <p role="alert" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-bold)' }}>{erro}</p>}
          </div>
        </JanelaModal>
      )}
    </>
  )
}
