'use client'

import { useId, useRef, useState } from 'react'
import { Info } from 'lucide-react'

/**
 * A dica: o "i" que guarda a explicação (J-55/J-56, 2026-10-30) — e o lugar de
 * TODA explicação do sistema desde 2026-11-16 (o Heitor: "pode tirar esse monte
 * de aviso e explicação, se quiser manter bota em um tooltipzinho que só
 * aparece se passar o mouse em cima… faz esse ajuste pra todo sistema"). A
 * tela mostra o número, o estado e o caminho para agir; o "como se calcula" e
 * o "por que" moram aqui (docs/regras/design.md, "A explicação mora na dica").
 *
 * Mora no núcleo: o app da rede (`@/components/shared/dica` reexporta), o
 * sistema e o suporte usam a mesma.
 *
 * Abre ao PASSAR O MOUSE e fecha ao sair; no toque (o celular não tem
 * "passar o mouse"), abre e fecha no toque; o clique do mouse a deixa fixa até
 * sair do botão; no teclado, Enter ou espaço (Esc fecha). O conteúdo só entra
 * no documento com a dica aberta: fechada, ela não muda o texto do rótulo em
 * que mora (o teste que lê o rótulo exato, o leitor de tela). O painel flutua
 * (`--shadow-popover`) e, perto da borda direita, abre para a esquerda.
 *
 * O gatilho é um `span` com `role="button"`, não um `<button>`: dentro de um
 * `<fieldset disabled>` (a tela só de leitura — o Gerente da plataforma, a
 * ficha de quem só vê) o `<button>` fica desligado e a dica não abria no
 * clique, no toque nem no teclado. Explicar não é editar: a dica abre sempre.
 * Os specs a acham por `[data-dica-botao]` ou pelo nome (`getByRole('button')`).
 * O nome não é `aria-label` (2026-11-17): vem do `::after` de `.dica-nome`, que
 * não casa com o `getByLabel` do campo vizinho nem entra no texto do rótulo.
 */
export function Dica({ rotulo, children, largura = 280 }: {
  /** O nome acessível do botão: "Como se chega ao resultado". */
  rotulo: string
  /** A explicação. */
  children: React.ReactNode
  /** A largura do painel, em px (cabe na tela do celular de qualquer jeito). */
  largura?: number
}) {
  const [sobre, setSobre] = useState(false)
  const [fixa, setFixa] = useState(false)
  const [paraEsquerda, setParaEsquerda] = useState(false)
  const botao = useRef<HTMLSpanElement>(null)
  const id = useId()
  const aberta = sobre || fixa

  function medir() {
    const r = botao.current?.getBoundingClientRect()
    if (r) setParaEsquerda(r.left + largura > window.innerWidth - 16)
  }

  return (
    <span
      data-dica
      style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle' }}
      onPointerEnter={e => { if (e.pointerType === 'mouse') { medir(); setSobre(true) } }}
      onPointerLeave={e => { if (e.pointerType === 'mouse') { setSobre(false); setFixa(false) } }}
    >
      <span
        ref={botao}
        data-dica-botao
        role="button"
        tabIndex={0}
        // O nome vem do ::after (.dica-nome, no globals.css), não do aria-label:
        // ao lado de um campo, "Sobre: Fuso horário" contém o rótulo dele, e o
        // getByLabel('Fuso horário') achava os dois. O conteúdo gerado entra no nome
        // acessível (leitor de tela, getByRole), não no getByLabel nem no texto.
        className="dica-nome"
        data-rotulo={rotulo}
        aria-expanded={aberta}
        aria-describedby={aberta ? id : undefined}
        onClick={e => { e.stopPropagation(); e.preventDefault(); medir(); setFixa(v => !v) }}
        onBlur={() => setFixa(false)}
        onKeyDown={e => {
          if (e.key === 'Escape') { setFixa(false); setSobre(false) }
          else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); medir(); setFixa(v => !v) }
        }}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          padding: 2, cursor: 'help', borderRadius: 'var(--radius-field-token)',
          // A cor do rótulo em que mora: no cartão rosé, o branco dele.
          color: 'currentColor', opacity: aberta ? 1 : 0.6, lineHeight: 0,
        }}
      >
        <Info size={13} aria-hidden />
      </span>
      {aberta && <span
        id={id}
        role="tooltip"
        style={{
          display: 'block',
          position: 'absolute', top: 'calc(100% + 6px)', zIndex: 30,
          ...(paraEsquerda ? { right: 0 } : { left: 0 }),
          width: `min(${largura}px, calc(100vw - 32px))`,
          padding: '10px 12px', borderRadius: 'var(--radius-field-token)',
          background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-popover)',
          fontSize: 'var(--text-xs-sz)', fontWeight: 500, lineHeight: 1.45, color: 'var(--text-muted)',
          textTransform: 'none', letterSpacing: 'normal', whiteSpace: 'normal', textAlign: 'left',
        }}
      >
        {children}
      </span>}
    </span>
  )
}
