'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { criarOrigemDoLead, alternarOrigemDoLead } from '@/actions/crm-origens'

export interface OrigemConfiguravel { id: string; nome: string; ativo: boolean }

/**
 * As origens do lead da clínica, em "Configurar funis" (A14 da 7ª simulação,
 * 2026-11-05; princípio 1). Nasce com as de sempre; a clínica cadastra as
 * dela ("Feira de noivas") e desativa as que não usa — desativar tira da
 * escolha sem apagar: o lead que já tem a origem continua com ela.
 */
export function OrigensDoLeadConfig({ origens }: { origens: OrigemConfiguravel[] }) {
  const router = useRouter()
  const idNova = useId()
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, start] = useTransition()

  function adicionar(e: React.FormEvent) {
    e.preventDefault()
    const limpo = nome.trim()
    if (!limpo) return
    setErro(null)
    start(async () => {
      const r = await criarOrigemDoLead(limpo)
      if ('error' in r) { setErro(r.error); return }
      setNome('')
      router.refresh()
    })
  }

  function alternar(id: string, ativo: boolean) {
    setErro(null)
    start(async () => {
      const r = await alternarOrigemDoLead(id, ativo)
      if ('error' in r) { setErro(r.error); return }
      router.refresh()
    })
  }

  return (
    <section data-origens-do-lead style={{ borderTop: '1px solid var(--hairline)', padding: '18px 24px 26px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <h3 style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 800, color: 'var(--text)' }}>Origens dos leads</h3>
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 2 }}>
          De onde a oportunidade veio — o que o lead, a importação e o Copilot oferecem. Desativar tira da lista sem apagar a origem de quem já tem. O lead do anúncio continua com a origem do anúncio (Meta Ads, Google Ads).
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {origens.map(o => (
          <button key={o.id} type="button" disabled={pendente}
            onClick={() => alternar(o.id, !o.ativo)}
            aria-pressed={o.ativo}
            title={o.ativo ? 'Clique para desativar' : 'Clique para reativar'}
            className={o.ativo ? 'chip-filtro is-ativo' : 'chip-filtro'}
            style={o.ativo ? undefined : { textDecoration: 'line-through', color: 'var(--text-faint)' }}>
            {o.nome}
          </button>
        ))}
      </div>

      <form onSubmit={adicionar} style={{ display: 'flex', gap: 8, maxWidth: 420 }}>
        <label htmlFor={idNova} className="sr-only">Nova origem</label>
        <input id={idNova} className="field" value={nome} onChange={e => setNome(e.target.value)}
          placeholder="Nova origem" maxLength={40} style={{ flex: 1, minWidth: 0 }} />
        <button type="submit" className="btn-primary" disabled={pendente || !nome.trim()} style={{ flexShrink: 0 }}>
          <Plus size={14} /> Adicionar origem
        </button>
      </form>
      {erro && <p role="alert" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', fontWeight: 700 }}>{erro}</p>}
    </section>
  )
}
