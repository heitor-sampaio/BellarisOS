'use client'

import { useMemo, useRef, useState } from 'react'
import { Tag as TagIcon, Check, Search } from 'lucide-react'

/**
 * Escolha de tags a partir do que a rede já usa.
 *
 * Duas decisões o definem, e as duas vêm do mesmo problema: tag livre vira
 * bagunça. Ele **não cria tag** — quem atende escolhe entre as existentes,
 * senão a mesma ideia vira "botox", "Botox" e "botox " em três atendimentos e o
 * filtro por tag deixa de servir. E ele é **fechado por padrão**: a lista de uma
 * rede madura tem dezenas de tags, e despejá-las abertas no card empurra para
 * fora da tela o que interessa (telefone, etapa, histórico).
 */
export function TagPicker({
  selecionadas, disponiveis, disabled = false, onChange,
}: {
  selecionadas: string[]
  disponiveis:  string[]
  disabled?:    boolean
  onChange:     (tags: string[]) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [busca,  setBusca]  = useState('')
  const campoRef = useRef<HTMLInputElement>(null)

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const base = q ? disponiveis.filter(t => t.toLowerCase().includes(q)) : disponiveis
    // As marcadas sobem: com trinta tags, desmarcar exige achar de novo o que
    // acabou de ser marcado, e procurar duas vezes a mesma coisa irrita.
    return [...base].sort((a, b) => {
      const sa = selecionadas.includes(a) ? 0 : 1
      const sb = selecionadas.includes(b) ? 0 : 1
      return sa !== sb ? sa - sb : a.localeCompare(b, 'pt-BR')
    })
  }, [busca, disponiveis, selecionadas])

  function alternar(t: string) {
    onChange(selecionadas.includes(t)
      ? selecionadas.filter(x => x !== t)
      : [...selecionadas, t])
  }

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
        className="btn-ghost"
        style={{ fontSize: 11.5, padding: '4px 8px', gap: 5 }}
      >
        <TagIcon size={12} />
        {selecionadas.length > 0 ? 'Editar tags' : 'Adicionar tag'}
      </button>

      {aberto && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} onClick={() => setAberto(false)} />

          <div style={{
            position: 'absolute', top: 30, left: 0, zIndex: 31,
            width: 232, background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 10, padding: 8,
          }}>
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
                placeholder="Buscar tag…"
                style={{ paddingLeft: 25, fontSize: 12, padding: '6px 8px 6px 25px' }}
              />
            </div>

            <div style={{ maxHeight: 190, overflowY: 'auto' }}>
              {lista.length === 0 && (
                <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: '6px 4px', lineHeight: 1.45 }}>
                  {disponiveis.length === 0
                    ? 'A rede ainda não tem tags. Elas são criadas na tela de Oportunidades.'
                    : 'Nenhuma tag com esse nome.'}
                </p>
              )}

              {lista.map(t => {
                const marcada = selecionadas.includes(t)
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => alternar(t)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                      padding: '5px 6px', borderRadius: 6, border: 'none', cursor: 'pointer',
                      background: marcada ? 'var(--brand-soft)' : 'transparent',
                      color: marcada ? 'var(--brand)' : 'var(--text)',
                      fontSize: 12, fontWeight: marcada ? 700 : 500,
                      textAlign: 'left',
                    }}
                  >
                    <span style={{
                      width: 13, height: 13, flexShrink: 0, borderRadius: 4,
                      border: marcada ? 'none' : '1.5px solid var(--border)',
                      background: marcada ? 'var(--brand)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {marcada && <Check size={9} color="#fff" strokeWidth={3.5} />}
                    </span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t}
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
