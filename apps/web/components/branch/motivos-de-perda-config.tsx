'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { criarMotivoDePerda, alternarMotivoDePerda } from '@/actions/crm-motivos'

export interface MotivoConfiguravel { id: string; nome: string; ativo: boolean }

/**
 * Os motivos de perda da rede, em "Configurar funis" (2026-10-21). Desativar
 * tira da pergunta "Por que perdeu?" sem apagar: o lead já perdido por ele
 * segue com o motivo, e o relatório também.
 */
export function MotivosDePerdaConfig({ motivos }: { motivos: MotivoConfiguravel[] }) {
  const router = useRouter()
  const idNovo = useId()
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, start] = useTransition()

  function adicionar(e: React.FormEvent) {
    e.preventDefault()
    const limpo = nome.trim()
    if (!limpo) return
    setErro(null)
    start(async () => {
      const r = await criarMotivoDePerda(limpo)
      if ('error' in r) { setErro(r.error); return }
      setNome('')
      router.refresh()
    })
  }

  function alternar(id: string, ativo: boolean) {
    setErro(null)
    start(async () => {
      const r = await alternarMotivoDePerda(id, ativo)
      if ('error' in r) { setErro(r.error); return }
      router.refresh()
    })
  }

  return (
    <section style={{ borderTop: '1px solid var(--hairline)', padding: '18px 24px 26px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <h3 style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 800, color: 'var(--text)' }}>Motivos de perda</h3>
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 2 }}>
          Levar a oportunidade a uma etapa de perdido pergunta um destes. Desativar tira da lista sem apagar o histórico.
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {motivos.map(m => (
          <button key={m.id} type="button" disabled={pendente}
            onClick={() => alternar(m.id, !m.ativo)}
            aria-pressed={m.ativo}
            title={m.ativo ? 'Clique para desativar' : 'Clique para reativar'}
            className={m.ativo ? 'chip-filtro is-ativo' : 'chip-filtro'}
            style={m.ativo ? undefined : { textDecoration: 'line-through', color: 'var(--text-faint)' }}>
            {m.nome}
          </button>
        ))}
      </div>

      <form onSubmit={adicionar} style={{ display: 'flex', gap: 8, maxWidth: 420 }}>
        <label htmlFor={idNovo} className="sr-only">Novo motivo</label>
        <input id={idNovo} className="field" value={nome} onChange={e => setNome(e.target.value)}
          placeholder="Novo motivo" maxLength={60} style={{ flex: 1, minWidth: 0 }} />
        <button type="submit" className="btn-primary" disabled={pendente || !nome.trim()} style={{ flexShrink: 0 }}>
          <Plus size={14} /> Adicionar motivo
        </button>
      </form>
      {erro && <p role="alert" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', fontWeight: 700 }}>{erro}</p>}
    </section>
  )
}
