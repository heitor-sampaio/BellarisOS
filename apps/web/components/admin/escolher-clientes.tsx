'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import { maskPhone } from '@estetica-os/utils'
import { buscarClientesParaCampanha } from '@/actions/notification-campaigns'

export interface ClienteEscolhida { id: string; name: string }

/**
 * "Clientes específicas" do público da campanha (A37 da 15ª simulação,
 * 2026-11-17): a busca por nome ou telefone, e cada achada vira um chip. É o
 * mesmo desenho do "Indicada por" (`campo-indicada-por.tsx`), com várias.
 */
export function EscolherClientes({ escolhidas, aoMudar }: {
  escolhidas: ClienteEscolhida[]
  aoMudar: (lista: ClienteEscolhida[]) => void
}) {
  const [termo, setTermo] = useState('')
  const [achados, setAchados] = useState<{ id: string; nome: string; telefone: string }[]>([])
  const [buscando, setBuscando] = useState(false)
  const [aberto, setAberto] = useState(false)
  const lista = useId()
  const pedido = useRef(0)
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (espera.current) clearTimeout(espera.current) }, [])

  function mudarTermo(valor: string) {
    setTermo(valor)
    setAberto(true)
    if (espera.current) clearTimeout(espera.current)
    const busca = valor.trim()
    const meu = ++pedido.current
    if (busca.length < 2) { setAchados([]); setBuscando(false); return }
    setBuscando(true)
    espera.current = setTimeout(async () => {
      const r = await buscarClientesParaCampanha(busca)
      if (meu !== pedido.current) return
      setAchados(r)
      setBuscando(false)
    }, 250)
  }

  function escolher(c: { id: string; nome: string }) {
    if (!escolhidas.some(e => e.id === c.id)) aoMudar([...escolhidas, { id: c.id, name: c.nome }])
    pedido.current++
    if (espera.current) clearTimeout(espera.current)
    setTermo('')
    setAberto(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {escolhidas.length > 0 && (
        <div data-clientes-escolhidas style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {escolhidas.map(c => (
            <span key={c.id} className="chip-filtro is-ativo" style={{ cursor: 'default', paddingRight: 6 }}>
              {c.name}
              <button type="button" aria-label={`Tirar ${c.name}`} onClick={() => aoMudar(escolhidas.filter(x => x.id !== c.id))}
                style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: 'inherit', lineHeight: 0 }}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <Search size={13} aria-hidden style={{ position: 'absolute', left: 10, top: 'calc(var(--altura-controle) / 2)', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }} />
        <input
          type="text" className="field campo-busca" style={{ paddingLeft: 30 }}
          aria-label="Buscar cliente" role="combobox" aria-expanded={aberto && termo.trim().length >= 2} aria-controls={lista}
          placeholder="Buscar a cliente (nome ou telefone)…"
          value={termo}
          onChange={e => mudarTermo(e.target.value)}
          onFocus={() => setAberto(true)}
          onKeyDown={e => { if (e.key === 'Escape') setAberto(false) }}
        />
        {aberto && termo.trim().length >= 2 && (
          <div id={lista} role="listbox" aria-label="Clientes encontradas" style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-card-sm)', marginTop: 4, boxShadow: 'var(--shadow-popover)',
            maxHeight: 200, overflow: 'auto',
          }}>
            {buscando ? (
              <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)' }}>
                <Loader2 size={12} className="animate-spin" /> Procurando…
              </div>
            ) : achados.length > 0 ? achados.map(c => {
              const ja = escolhidas.some(e => e.id === c.id)
              return (
                <button key={c.id} type="button" role="option" aria-selected={ja} disabled={ja} onClick={() => escolher(c)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none', border: 'none',
                    cursor: ja ? 'default' : 'pointer', borderBottom: '1px solid var(--hairline)', opacity: ja ? 0.6 : 1,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-app)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                  <span style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>{c.nome}</span>
                  {c.telefone && <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', marginLeft: 8 }}>{maskPhone(c.telefone)}</span>}
                  {ja && <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs-sz)', marginLeft: 8 }}>já escolhida</span>}
                </button>
              )
            }) : (
              <p style={{ padding: '10px 14px', fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                Nenhuma cliente com “{termo.trim()}”.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
