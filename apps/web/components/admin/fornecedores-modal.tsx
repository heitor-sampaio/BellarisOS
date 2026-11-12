'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Truck, Plus, Pencil, Archive, ArchiveRestore, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { JanelaModal } from '@/components/shared/janela-modal'
import { criarFornecedor, renomearFornecedor, arquivarFornecedor } from '@/actions/stock'

type Fornecedor = { id: string; nome: string; arquivado: boolean }

/**
 * Fornecedores — o cadastro da rede (C76, D4 do levantamento das regras:
 * "funciona igual a categoria"). Fica ao lado das Categorias no Estoque da
 * rede: novo, renomear, arquivar e trazer de volta. O arquivado sai das opções
 * e continua no que já foi gravado (o Histórico mostra o nome da entrada).
 */
export function FornecedoresModal({ fornecedores }: { fornecedores: Fornecedor[] }) {
  const router = useRouter()
  const [aberta, setAberta] = useState(false)
  const [novo, setNovo] = useState('')
  const [editando, setEditando] = useState<{ id: string; nome: string } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [gravando, iniciar] = useTransition()
  const ativos = fornecedores.filter(f => !f.arquivado)
  const arquivados = fornecedores.filter(f => f.arquivado)

  function fazer(acao: () => Promise<{ error?: string }>, depois?: () => void) {
    setErro(null)
    iniciar(async () => {
      const r = await acao()
      if (r.error) { setErro(r.error); return }
      depois?.()
      router.refresh()
    })
  }

  const linha = (f: Fornecedor) => (
    <div key={f.id} data-fornecedor={f.nome} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      padding: '7px 10px', background: 'var(--bg-app)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-field-token)',
    }}>
      {editando?.id === f.id ? (
        <form style={{ display: 'flex', gap: 6, flex: 1 }} onSubmit={e => {
          e.preventDefault()
          fazer(() => renomearFornecedor(f.id, editando.nome), () => { setEditando(null); toast.success('Fornecedor renomeado.') })
        }}>
          <input className="field" aria-label={`Novo nome de ${f.nome}`} value={editando.nome} maxLength={120} autoFocus
            onChange={e => setEditando({ id: f.id, nome: e.target.value })} disabled={gravando} />
          <button type="submit" className="btn-primary" disabled={gravando || !editando.nome.trim()} title="Salvar"><Check size={14} /></button>
          <button type="button" className="btn-secondary" onClick={() => setEditando(null)} disabled={gravando} title="Cancelar"><X size={14} /></button>
        </form>
      ) : (
        <>
          <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 600, color: f.arquivado ? 'var(--text-faint)' : 'var(--text)' }}>{f.nome}</span>
          <span style={{ display: 'flex', gap: 2 }}>
            {!f.arquivado && (
              <button type="button" className="btn-ghost" title="Renomear" aria-label={`Renomear ${f.nome}`}
                onClick={() => setEditando({ id: f.id, nome: f.nome })} disabled={gravando}><Pencil size={13} /></button>
            )}
            <button type="button" className="btn-ghost" disabled={gravando}
              title={f.arquivado ? 'Trazer de volta' : 'Arquivar'} aria-label={`${f.arquivado ? 'Trazer de volta' : 'Arquivar'} ${f.nome}`}
              onClick={() => fazer(() => arquivarFornecedor(f.id, !f.arquivado))}>
              {f.arquivado ? <ArchiveRestore size={13} /> : <Archive size={13} />}
            </button>
          </span>
        </>
      )}
    </div>
  )

  return (
    <>
      <button type="button" className="btn-secondary" style={{ gap: 6 }} onClick={() => setAberta(true)}>
        <Truck size={14} /> Fornecedores
        {ativos.length > 0 && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: 18, height: 18, borderRadius: 99, background: 'var(--brand-soft)', color: 'var(--brand)',
            fontSize: 'var(--text-overline)', fontWeight: 700, padding: '0 4px',
          }}>{ativos.length}</span>
        )}
      </button>
      {aberta && (
        <JanelaModal rotulo="Fornecedores" largura={440} travado={gravando} onFechar={() => { setAberta(false); setErro(null); setEditando(null) }}>
          <div style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>Fornecedores</h2>
              <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 2 }}>
                A lista que a Entrada, o estoque inicial e o cadastro do produto oferecem. Quem registra uma entrada também
                cadastra um novo ali mesmo.
              </p>
            </div>
            {ativos.length === 0
              ? <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>Nenhum fornecedor cadastrado ainda.</p>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{ativos.map(linha)}</div>}
            {arquivados.length > 0 && (
              <details>
                <summary style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', cursor: 'pointer' }}>
                  Arquivados ({arquivados.length})
                </summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>{arquivados.map(linha)}</div>
              </details>
            )}
            <form style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--hairline)', paddingTop: 14 }}
              onSubmit={e => {
                e.preventDefault()
                fazer(() => criarFornecedor(novo), () => setNovo(''))
              }}>
              <label htmlFor="novo-fornecedor" className="field-label">Novo fornecedor</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input id="novo-fornecedor" className="field" maxLength={120} value={novo} onChange={e => setNovo(e.target.value)}
                  placeholder="Ex.: Distribuidora Sul" autoComplete="off" disabled={gravando} />
                <button type="submit" className="btn-primary" disabled={gravando || !novo.trim()} style={{ flexShrink: 0, gap: 5 }}>
                  <Plus size={14} /> Adicionar
                </button>
              </div>
            </form>
            {erro && <p role="alert" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--danger)', fontWeight: 700 }}>{erro}</p>}
          </div>
        </JanelaModal>
      )}
    </>
  )
}
