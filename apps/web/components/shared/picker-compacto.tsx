'use client'

import { useMemo, useRef, useState } from 'react'
import { Check, Search } from 'lucide-react'

/**
 * Escolha compacta a partir de uma lista fechada.
 *
 * Nasceu do seletor de tags e virou genérico quando a origem pediu o mesmo
 * tratamento. Dois princípios, que valem para os dois casos:
 *
 * - **Fechado por padrão.** O card é consultado durante o atendimento; despejar
 *   catálogos abertos empurra telefone, etapa e histórico para fora da tela.
 * - **Lista fechada.** Ninguém digita valor novo por aqui. Valor livre no meio
 *   do atendimento vira "botox", "Botox" e "botox " em três dias, e todo filtro
 *   construído sobre esse campo deixa de servir.
 */

export interface OpcaoPicker {
  valor:  string
  rotulo: string
}

export function PickerCompacto({
  rotuloBotao, icone, opcoes, selecionadas, multiplo = false,
  textoListaVazia, larguraPainel = 232, disabled = false,
  classeBotao = 'btn-ghost', estiloBotao, onEscolher,
}: {
  rotuloBotao:      string
  icone:            React.ReactNode
  opcoes:           OpcaoPicker[]
  selecionadas:     string[]
  /** Múltiplo mantém o painel aberto e sobe o que já está marcado. */
  multiplo?:        boolean
  textoListaVazia:  string
  larguraPainel?:   number
  disabled?:        boolean
  /** Para o gatilho combinar com a barra onde ele vive (filtros, card…). */
  classeBotao?:     string
  estiloBotao?:     React.CSSProperties
  onEscolher:       (valor: string) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [busca,  setBusca]  = useState('')
  const campoRef = useRef<HTMLInputElement>(null)

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const base = q
      ? opcoes.filter(o => o.rotulo.toLowerCase().includes(q))
      : opcoes
    if (!multiplo) return base

    // No múltiplo as marcadas sobem: com trinta opções, desmarcar exigiria
    // achar de novo o que acabou de ser marcado. No único não há o que subir —
    // e mexer na ordem de uma lista curta e conhecida só atrapalha.
    return [...base].sort((a, b) => {
      const sa = selecionadas.includes(a.valor) ? 0 : 1
      const sb = selecionadas.includes(b.valor) ? 0 : 1
      return sa !== sb ? sa - sb : a.rotulo.localeCompare(b.rotulo, 'pt-BR')
    })
  }, [busca, opcoes, selecionadas, multiplo])

  if (disabled) return null

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => {
          setAberto(a => !a)
          setBusca('')
          setTimeout(() => campoRef.current?.focus(), 0)
        }}
        className={classeBotao}
        style={estiloBotao ?? { fontSize: 'var(--text-xs-sz)', padding: '4px 8px', gap: 5 }}
      >
        {icone}
        {rotuloBotao}
      </button>

      {aberto && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} onClick={() => setAberto(false)} />

          <div style={{
            position: 'absolute', top: 30, left: 0, zIndex: 31,
            width: larguraPainel, background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 10, padding: 8,
          }}>
            {/* Busca só quando há o que garimpar: em cinco opções ela é ruído. */}
            {opcoes.length > 7 && (
              <div style={{ position: 'relative', marginBottom: 6 }}>
                <Search
                  size={12}
                  style={{
                    position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                    color: 'var(--text-faint)', pointerEvents: 'none',
                  }}
                />
                <input
                  ref={campoRef}
                  className="field"
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar…"
                  style={{ fontSize: 'var(--text-sm-sz)', padding: '6px 8px 6px 25px' }}
                />
              </div>
            )}

            <div style={{ maxHeight: 190, overflowY: 'auto' }}>
              {lista.length === 0 && (
                <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)', margin: '6px 4px', lineHeight: 1.45 }}>
                  {opcoes.length === 0 ? textoListaVazia : 'Nada com esse nome.'}
                </p>
              )}

              {lista.map(o => {
                const marcada = selecionadas.includes(o.valor)
                return (
                  <button
                    key={o.valor}
                    type="button"
                    onClick={() => {
                      onEscolher(o.valor)
                      if (!multiplo) setAberto(false)
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                      padding: '5px 6px', borderRadius: 6, border: 'none', cursor: 'pointer',
                      background: marcada ? 'var(--brand-soft)' : 'transparent',
                      color: marcada ? 'var(--brand)' : 'var(--text)',
                      fontSize: 'var(--text-sm-sz)', fontWeight: marcada ? 700 : 500,
                      textAlign: 'left',
                    }}
                  >
                    <span style={{
                      width: 13, height: 13, flexShrink: 0,
                      borderRadius: multiplo ? 4 : 99,
                      border: marcada ? 'none' : '1.5px solid var(--border)',
                      background: marcada ? 'var(--brand)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {marcada && <Check size={9} color="var(--surface)" strokeWidth={3.5} />}
                    </span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {o.rotulo}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
