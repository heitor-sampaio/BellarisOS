'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
 *
 * E dois que a tela NÃO escolhe (pedido do Heitor, 2026-10-14):
 * - **O marcador é sempre quadrado**, no único e no múltiplo. Era bolinha no
 *   único, e a barra de filtros misturava os dois desenhos lado a lado.
 * - **O painel flutua por cima de TUDO, inteiro na tela.** Ele é renderizado
 *   fora da tela que o contém (portal no `body`, ou no `<dialog>` aberto —
 *   senão ficaria atrás do modal), em posição fixa medida a partir do gatilho:
 *   abre para a direita se cabe, senão alinha pela borda direita dele; para
 *   baixo, senão para cima. Dentro da coluna da lista de clientes ele era
 *   cortado e a coluna do meio era desenhada por cima; antes disso, o foco na
 *   busca ROLAVA a coluna e empurrava a lista para a esquerda.
 */

/** Onde o painel cabe: abaixo (ou acima) do gatilho, inteiro na tela. */
interface Posicao { left: number; largura: number; top?: number; bottom?: number }
const ALTURA_ESTIMADA = 260
function posicaoDoPainel(gatilho: DOMRect, larguraPainel: number): Posicao {
  const largura = Math.min(larguraPainel, window.innerWidth - 16)
  let left = gatilho.left
  if (left + largura > window.innerWidth - 8) left = Math.max(8, gatilho.right - largura)
  const embaixo = window.innerHeight - gatilho.bottom
  return embaixo < ALTURA_ESTIMADA && gatilho.top > embaixo
    ? { left, largura, bottom: window.innerHeight - gatilho.top + 4 }
    : { left, largura, top: gatilho.bottom + 4 }
}

export interface OpcaoPicker {
  valor:  string
  rotulo: string
}

export function PickerCompacto({
  rotuloBotao, icone, opcoes, selecionadas, multiplo = false,
  textoListaVazia, larguraPainel = 232, disabled = false,
  classeBotao = 'btn-ghost', estiloBotao, mantemAbertoEm = [], rodape, onEscolher,
}: {
  rotuloBotao:      string
  /** Opcional: em barra de FILTRO o rótulo já diz o que é, e quatro ícones
   *  diferentes na mesma linha viram ruído (§13). Fica para onde o ícone é o
   *  próprio assunto — a tag no card do contato, por exemplo. */
  icone?:           React.ReactNode
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
  /** No único, as opções que NÃO fecham o painel ao escolher — a que abre o
   *  rodapé (o "Personalizado" do período, que ainda pede as datas). */
  mantemAbertoEm?:  string[]
  /** Abaixo da lista, no mesmo painel; recebe como fechá-lo. */
  rodape?:          (fechar: () => void) => React.ReactNode
  onEscolher:       (valor: string) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [busca,  setBusca]  = useState('')
  const campoRef = useRef<HTMLInputElement>(null)
  const ancoraRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<Posicao | null>(null)
  const [destino, setDestino] = useState<Element | null>(null)

  function medir() {
    const r = ancoraRef.current?.getBoundingClientRect()
    if (r) setPos(posicaoDoPainel(r, larguraPainel))
  }

  function abrirOuFechar() {
    if (!aberto) {
      medir()
      // Dentro de um modal (<dialog>, camada do topo), o painel vai nele.
      setDestino(ancoraRef.current?.closest('dialog') ?? document.body)
    }
    setAberto(a => !a)
    setBusca('')
    // Sem rolar: focar um campo fora da vista rola o contêiner até ele.
    setTimeout(() => campoRef.current?.focus({ preventScroll: true }), 0)
  }

  // Aberto, o gatilho também MUDA DE LUGAR sem rolagem nenhuma: no múltiplo, o
  // que se marca aparece em volta dele (os nomes escolhidos, acima do botão) e
  // o empurra. Medido de novo quando a escolha ou o rótulo mudam (e só muda se
  // mudou). Sem isto o
  // painel ficava por cima do botão que o abriu, o clique fora caía nele e
  // nada fechava (o "Salvar" da linha bloqueado, 2026-10-19).
  useLayoutEffect(() => {
    if (!aberto) return
    const r = ancoraRef.current?.getBoundingClientRect()
    if (!r) return
    const nova = posicaoDoPainel(r, larguraPainel)
    setPos(p => (p && p.left === nova.left && p.top === nova.top && p.bottom === nova.bottom && p.largura === nova.largura ? p : nova))
  }, [aberto, larguraPainel, selecionadas, rotuloBotao])

  // Aberto, acompanha o gatilho se a página rolar ou a janela mudar.
  useEffect(() => {
    if (!aberto) return
    const acompanhar = () => {
      const r = ancoraRef.current?.getBoundingClientRect()
      if (r) setPos(posicaoDoPainel(r, larguraPainel))
    }
    window.addEventListener('resize', acompanhar)
    window.addEventListener('scroll', acompanhar, true)
    return () => {
      window.removeEventListener('resize', acompanhar)
      window.removeEventListener('scroll', acompanhar, true)
    }
  }, [aberto, larguraPainel])

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
    <div ref={ancoraRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={abrirOuFechar}
        className={classeBotao === 'btn-ghost' ? 'btn-ghost picker-gatilho' : classeBotao}
        style={estiloBotao}
      >
        {icone}
        {rotuloBotao}
      </button>

      {aberto && pos && destino && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-popover)' }} onClick={() => setAberto(false)} />

          <div data-painel-picker style={{
            position: 'fixed', zIndex: 'calc(var(--z-popover) + 1)',
            left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.largura,
            background: 'var(--surface)', boxShadow: 'var(--shadow-popover)',
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
                  className="field campo-busca"
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
                      if (!multiplo && !mantemAbertoEm.includes(o.valor)) setAberto(false)
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
                    <span data-marcador style={{
                      width: 13, height: 13, flexShrink: 0,
                      borderRadius: 4,
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
            {rodape?.(() => setAberto(false))}
          </div>
        </>,
        destino,
      )}
    </div>
  )
}
