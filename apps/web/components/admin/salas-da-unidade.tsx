'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Pencil, Power, PowerOff, DoorOpen } from 'lucide-react'
import { criarSala, renomearSala, mudarSituacaoDaSala } from '@/actions/salas'

export interface SalaDaUnidade { id: string; name: string; is_active: boolean }

/**
 * As salas da unidade (D5, decisão do Heitor, 2026-10-30), no detalhe da
 * unidade em Configurações → Unidades. Criar, renomear, desativar e reativar:
 * a sala não se apaga, porque os agendamentos de antes apontam para ela.
 * Unidade sem sala agenda como sempre (o campo nem aparece no agendar).
 */
export function SalasDaUnidade({ branchId, salas }: { branchId: string; salas: SalaDaUnidade[] }) {
  const router = useRouter()
  const [gravando, iniciar] = useTransition()
  const [nova, setNova] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [editando, setEditando] = useState<string | null>(null)
  const [novoNome, setNovoNome] = useState('')

  const ordenadas = [...salas].sort((a, b) =>
    Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }))

  function agir(fazer: () => Promise<{ error?: string }>, aviso: string, depois?: () => void) {
    setErro(null)
    iniciar(async () => {
      const r = await fazer()
      if (r.error) { setErro(r.error); return }
      depois?.()
      toast.success(aviso)
      router.refresh()
    })
  }

  return (
    <section data-salas-da-unidade className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14, marginTop: 24 }}>
      <div>
        <h2 className="overline" style={{ marginBottom: 4 }}>Salas</h2>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          A sala se escolhe ao agendar, e uma sala não recebe dois atendimentos ao mesmo tempo. No cadastro do procedimento dá para dizer em quais salas ele é feito.
        </p>
      </div>

      {ordenadas.length === 0 ? (
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>
          Nenhuma sala cadastrada. Sem sala, o agendar não pergunta por ela.
        </p>
      ) : (
        <ul style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 'var(--radius-field-token)', overflow: 'hidden' }}>
          {ordenadas.map((s, i) => (
            <li key={s.id} data-sala={s.name} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', flexWrap: 'wrap',
              borderTop: i ? '1px solid var(--hairline)' : undefined, opacity: s.is_active ? 1 : 0.65,
            }}>
              <DoorOpen size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-hidden />
              {editando === s.id ? (
                <form
                  style={{ display: 'flex', gap: 8, flex: 1, minWidth: 220, flexWrap: 'wrap' }}
                  onSubmit={e => { e.preventDefault(); agir(() => renomearSala(s.id, novoNome), 'Sala renomeada.', () => setEditando(null)) }}
                >
                  <input className="field" style={{ flex: 1, minWidth: 140 }} aria-label={`Novo nome de ${s.name}`} autoFocus
                    value={novoNome} maxLength={60} onChange={e => setNovoNome(e.target.value)} />
                  <button type="submit" className="btn-primary" disabled={gravando}>Salvar nome</button>
                  <button type="button" className="btn-secondary" onClick={() => { setEditando(null); setErro(null) }}>Cancelar</button>
                </form>
              ) : (
                <>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)' }}>{s.name}</span>
                  {!s.is_active && <span className="chip chip-muted">Desativada</span>}
                  {s.is_active && (
                    <button type="button" className="btn-ghost" aria-label={`Renomear ${s.name}`} disabled={gravando}
                      style={{ fontSize: 'var(--text-xs-sz)', gap: 5 }}
                      onClick={() => { setEditando(s.id); setNovoNome(s.name); setErro(null) }}>
                      <Pencil size={13} /> Renomear
                    </button>
                  )}
                  {s.is_active ? (
                    <button type="button" className="btn-ghost" aria-label={`Desativar ${s.name}`} disabled={gravando}
                      style={{ fontSize: 'var(--text-xs-sz)', gap: 5, color: 'var(--text-faint)' }}
                      onClick={() => agir(() => mudarSituacaoDaSala(s.id, false), `${s.name} saiu do agendar.`)}>
                      <PowerOff size={13} /> Desativar
                    </button>
                  ) : (
                    <button type="button" className="btn-ghost" aria-label={`Reativar ${s.name}`} disabled={gravando}
                      style={{ fontSize: 'var(--text-xs-sz)', gap: 5, color: 'var(--success)' }}
                      onClick={() => agir(() => mudarSituacaoDaSala(s.id, true), `${s.name} voltou ao agendar.`)}>
                      <Power size={13} /> Reativar
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <form
        style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}
        onSubmit={e => { e.preventDefault(); agir(() => criarSala(branchId, nova), 'Sala criada.', () => setNova('')) }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 200 }}>
          <label className="overline" htmlFor={`nova-sala-${branchId}`}>Nome da nova sala</label>
          <input id={`nova-sala-${branchId}`} className="field" placeholder="Ex.: Sala 1, Cabine laser"
            value={nova} maxLength={60} onChange={e => setNova(e.target.value)} />
        </div>
        <button type="submit" className="btn-secondary" disabled={gravando || !nova.trim()} style={{ gap: 6 }}>
          <Plus size={14} /> Adicionar sala
        </button>
      </form>

      {erro && (
        <p role="alert" style={{
          color: 'var(--warning)', background: 'var(--warning-soft)', borderRadius: 'var(--radius-field-token)',
          padding: '8px 12px', fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)',
        }}>
          {erro}
        </p>
      )}
    </section>
  )
}
