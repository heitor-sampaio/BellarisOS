'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import { maskPhone } from '@estetica-os/utils'
import { buscarQuemIndicou } from '@/actions/indicacao'

export interface FichaQueIndicou { id: string; nome: string; telefone?: string }

/**
 * "Indicada por" (decisão do Heitor, 2026-11-10): a ligação a OUTRA ficha da
 * clínica, escolhida pela busca do nome ou do telefone — no Novo cliente, no
 * Agendar com cliente nova e na ficha (aba Dados). Não é texto livre: é por ela
 * que o prêmio por indicação (Fidelidade) chega a quem indicou. O id vai no
 * campo escondido `nome` (para os formulários) e em `aoMudar`.
 */
export function CampoIndicadaPor({ nome = 'indicada_por', inicial = null, excetoId = null, aoMudar, desabilitado = false }: {
  nome?: string
  inicial?: FichaQueIndicou | null
  /** A própria ficha (na aba Dados): não se indica a si mesma. */
  excetoId?: string | null
  aoMudar?: (ficha: FichaQueIndicou | null) => void
  desabilitado?: boolean
}) {
  const [escolhida, setEscolhida] = useState<FichaQueIndicou | null>(inicial)
  const [termo, setTermo] = useState('')
  const [achados, setAchados] = useState<FichaQueIndicou[]>([])
  const [buscando, setBuscando] = useState(false)
  const [aberto, setAberto] = useState(false)
  const lista = useId()
  const pedido = useRef(0)
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (espera.current) clearTimeout(espera.current) }, [])

  /** A busca sai 250 ms depois da última tecla; só a resposta do último pedido vale. */
  function mudarTermo(valor: string) {
    setTermo(valor)
    setAberto(true)
    if (espera.current) clearTimeout(espera.current)
    const busca = valor.trim()
    const meu = ++pedido.current
    if (busca.length < 2) { setAchados([]); setBuscando(false); return }
    setBuscando(true)
    espera.current = setTimeout(async () => {
      const r = await buscarQuemIndicou(busca, excetoId)
      if (meu !== pedido.current) return
      setAchados(r)
      setBuscando(false)
    }, 250)
  }

  function escolher(f: FichaQueIndicou | null) {
    setEscolhida(f)
    pedido.current++
    if (espera.current) clearTimeout(espera.current)
    setTermo('')
    setAberto(false)
    aoMudar?.(f)
  }

  return (
    <div style={{ position: 'relative' }}>
      <input type="hidden" name={nome} value={escolhida?.id ?? ''} />
      {escolhida ? (
        <div data-indicada-por-escolhida style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          padding: '9px 12px', background: 'var(--brand-soft)', border: '1.5px solid var(--brand-soft-border)',
          borderRadius: 'var(--radius-field-token)',
        }}>
          <span style={{ minWidth: 0 }}>
            <span style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-sm-sz)', color: 'var(--brand)' }}>{escolhida.nome}</span>
            {escolhida.telefone && (
              <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', marginLeft: 8 }}>{maskPhone(escolhida.telefone)}</span>
            )}
          </span>
          {!desabilitado && (
            <button type="button" aria-label="Tirar quem indicou" onClick={() => escolher(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand)', lineHeight: 0 }}>
              <X size={14} />
            </button>
          )}
        </div>
      ) : (
        <>
          <Search size={13} aria-hidden style={{ position: 'absolute', left: 10, top: 'calc(var(--altura-controle) / 2)', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }} />
          <input
            type="text" className="field campo-busca" style={{ paddingLeft: 30 }}
            aria-label="Indicada por" role="combobox" aria-expanded={aberto && termo.trim().length >= 2} aria-controls={lista}
            placeholder="Buscar a ficha de quem indicou (nome ou telefone)…"
            value={termo} disabled={desabilitado}
            onChange={e => mudarTermo(e.target.value)}
            onFocus={() => setAberto(true)}
            onKeyDown={e => { if (e.key === 'Escape') setAberto(false) }}
          />
          {aberto && termo.trim().length >= 2 && (
            <div id={lista} role="listbox" aria-label="Fichas encontradas" style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-card-sm)', marginTop: 4, boxShadow: 'var(--shadow-popover)',
              maxHeight: 200, overflow: 'auto',
            }}>
              {buscando ? (
                <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)' }}>
                  <Loader2 size={12} className="animate-spin" /> Procurando…
                </div>
              ) : achados.length > 0 ? achados.map(f => (
                <button key={f.id} type="button" role="option" aria-selected={false} onClick={() => escolher(f)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none', border: 'none',
                    cursor: 'pointer', borderBottom: '1px solid var(--hairline)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-app)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                  <span style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>{f.nome}</span>
                  {f.telefone && <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', marginLeft: 8 }}>{maskPhone(f.telefone)}</span>}
                </button>
              )) : (
                <p style={{ padding: '10px 14px', fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                  Nenhuma ficha com “{termo.trim()}”. Quem indicou precisa ter ficha na clínica: cadastre-a primeiro.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
