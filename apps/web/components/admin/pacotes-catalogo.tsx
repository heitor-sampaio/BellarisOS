'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus } from 'lucide-react'
import { formatBRL } from '@estetica-os/utils'
import { salvarPacote } from '@/actions/pacotes'

/**
 * O catálogo de pacotes da rede (Procedimentos → Pacotes): o procedimento, o
 * número de sessões, o preço e a validade. Vender é na ficha do cliente; o que
 * já foi vendido guarda o preço e as sessões da venda — mudar aqui vale para as
 * próximas.
 */

export interface PacoteDoCatalogo {
  id: string; name: string; price: number; totalSessions: number; validityDays: number | null
  isActive: boolean; procedureId: string; procedureName: string
}

interface Rascunho { id?: string; name: string; procedureId: string; sessoes: string; preco: string; validade: string; ativo: boolean }

const vazio = (procedureId: string): Rascunho => ({ name: '', procedureId, sessoes: '5', preco: '', validade: '', ativo: true })
const numero = (t: string) => { const s = t.trim(); return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s) }

export function PacotesCatalogo({ pacotes, procedimentos, podeEditar }: {
  pacotes: PacoteDoCatalogo[]
  procedimentos: { id: string; name: string }[]
  podeEditar: boolean
}) {
  const [editando, setEditando] = useState<Rascunho | null>(null)

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-label="Pacotes">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          {pacotes.length === 1 ? '1 pacote' : `${pacotes.length} pacotes`}
        </p>
        {podeEditar && !editando && procedimentos.length > 0 && (
          <button type="button" className="btn-secondary" onClick={() => setEditando(vazio(procedimentos[0]!.id))}>
            <Plus size={15} aria-hidden /> Novo pacote
          </button>
        )}
      </div>

      {editando && !editando.id && (
        <Formulario inicial={editando} procedimentos={procedimentos} aoTerminar={() => setEditando(null)} />
      )}

      {pacotes.length === 0 && !editando && (
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>Nenhum pacote cadastrado.</p>
      )}

      {pacotes.map(p => editando?.id === p.id ? (
        <Formulario key={p.id} inicial={editando} procedimentos={procedimentos} aoTerminar={() => setEditando(null)} />
      ) : (
        <div key={p.id} data-pacote={p.id}
          style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--hairline)', paddingTop: 10 }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)' }}>{p.name}</p>
            <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
              {p.totalSessions} sessões de {p.procedureName}{p.validityDays ? ` · válido por ${p.validityDays} dias` : ' · sem validade'}
            </p>
          </div>
          <strong style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>{formatBRL(p.price)}</strong>
          <span className={p.isActive ? 'chip chip-success' : 'chip chip-muted'}>{p.isActive ? 'Ativo' : 'Inativo'}</span>
          {podeEditar && (
            <button type="button" className="btn-ghost" aria-label={`Editar ${p.name}`} onClick={() => setEditando({
              id: p.id, name: p.name, procedureId: p.procedureId, sessoes: String(p.totalSessions),
              preco: String(p.price).replace('.', ','), validade: p.validityDays ? String(p.validityDays) : '', ativo: p.isActive,
            })}>
              <Pencil size={15} />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function Formulario({ inicial, procedimentos, aoTerminar }: {
  inicial: Rascunho; procedimentos: { id: string; name: string }[]; aoTerminar: () => void
}) {
  const router = useRouter()
  const [r, setR] = useState(inicial)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, iniciar] = useTransition()
  const mudar = (parte: Partial<Rascunho>) => setR(atual => ({ ...atual, ...parte }))

  function salvar() {
    setErro(null)
    const preco = numero(r.preco)
    const sessoes = Number(r.sessoes)
    if (!Number.isFinite(preco) || preco < 0 || !r.preco.trim()) { setErro('Informe o preço do pacote.'); return }
    iniciar(async () => {
      const res = await salvarPacote({
        id: r.id, name: r.name, procedure_id: r.procedureId, total_sessions: sessoes, price: preco,
        validity_days: r.validade.trim() ? Number(r.validade) : null, is_active: r.ativo,
      })
      if (res.error) { setErro(res.error); return }
      aoTerminar()
      router.refresh()
    })
  }

  const rotulo = { fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' } as const
  return (
    <div role="group" aria-label={r.id ? 'Editar pacote' : 'Novo pacote'}
      style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, borderRadius: 'var(--radius-field-token)', background: 'var(--bg-app)', border: '1px solid var(--border)' }}>
      <div className="form-2col">
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1 / -1' }}>
          <span style={rotulo}>Nome</span>
          <input className="field" aria-label="Nome do pacote" value={r.name} onChange={e => mudar({ name: e.target.value })} placeholder="Ex.: 5 sessões de drenagem" />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={rotulo}>Procedimento</span>
          <select className="field" aria-label="Procedimento do pacote" value={r.procedureId} onChange={e => mudar({ procedureId: e.target.value })}>
            {procedimentos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={rotulo}>Sessões</span>
          <input className="field" type="number" min={2} max={100} aria-label="Sessões do pacote" value={r.sessoes} onChange={e => mudar({ sessoes: e.target.value })} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={rotulo}>Preço (R$)</span>
          <input className="field" inputMode="decimal" aria-label="Preço do pacote" value={r.preco} onChange={e => mudar({ preco: e.target.value })} placeholder="0,00" />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={rotulo}>Validade em dias (vazio = sem validade)</span>
          <input className="field" type="number" min={1} aria-label="Validade do pacote" value={r.validade} onChange={e => mudar({ validade: e.target.value })} />
        </label>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
        <input type="checkbox" checked={r.ativo} onChange={e => mudar({ ativo: e.target.checked })} style={{ accentColor: 'var(--brand)', width: 16, height: 16 }} />
        <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>À venda</span>
      </label>
      {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn-secondary" onClick={aoTerminar} disabled={salvando}>Cancelar</button>
        <button type="button" className="btn-primary" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar pacote'}</button>
      </div>
    </div>
  )
}
