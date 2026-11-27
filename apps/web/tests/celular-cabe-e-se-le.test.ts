import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O celular (375 × 812): o que fecha o trabalho fica à vista, a tela cabe e se
 * lê (docs/regras/design.md). Testes de estrutura: o leiaute é do CSS e da
 * marcação, e sem navegador a prova é ler os dois.
 */
const WEB = join(__dirname, '..')
const ler = (rel: string) => readFileSync(join(WEB, rel), 'utf8')
const css = () => readFileSync(join(WEB, '..', '..', 'packages/nucleo/src/estilos/globals.css'), 'utf8')

/** O bloco de um `@media (max-width: Npx) { … }` que contém o trecho. */
function mediaQueContem(fonte: string, largura: number, trecho: string): string {
  const abre = `@media (max-width: ${largura}px)`
  let i = fonte.indexOf(abre)
  while (i !== -1) {
    let prof = 0
    let j = fonte.indexOf('{', i)
    const inicio = j
    for (; j < fonte.length; j++) {
      if (fonte[j] === '{') prof++
      else if (fonte[j] === '}') { prof--; if (prof === 0) break }
    }
    const bloco = fonte.slice(inicio, j + 1)
    if (bloco.includes(trecho)) return bloco
    i = fonte.indexOf(abre, j)
  }
  return ''
}

/** A ação está dentro de um `<div className="acao-presa">` (sem fechar o div antes dela). */
function presa(arquivo: string, rotulo: string) {
  const fonte = ler(arquivo)
  const i = fonte.indexOf(rotulo)
  expect(i, `${arquivo}: o rótulo ${rotulo}`).toBeGreaterThan(-1)
  const abre = fonte.lastIndexOf('className="acao-presa"', i)
  expect(abre, `${arquivo}: ${rotulo} dentro da barra presa`).toBeGreaterThan(-1)
  expect(fonte.slice(abre, i), `${arquivo}: ${rotulo} dentro da barra presa`).not.toContain('</div>')
}

describe('D4: no celular, a ação que fecha o trabalho fica presa no rodapé', () => {
  it('a barra comum: invisível no computador; no celular, presa no fim, com o safe-area, abaixo da topbar e do Copilot', () => {
    const f = css()
    expect(f).toMatch(/\.acao-presa \{ display: contents; \}/)
    const m = mediaQueContem(f, 767, '.acao-presa:not(:empty) {')
    expect(m).toMatch(/\.acao-presa:not\(:empty\) \{[^}]*position: fixed;[^}]*bottom: 0;/)
    expect(m).toMatch(/\.acao-presa:not\(:empty\) \{[^}]*env\(safe-area-inset-bottom, 0px\)/)
    // Abaixo da topbar (40) e do Copilot: como a barra do atendimento.
    expect(m).toMatch(/\.acao-presa:not\(:empty\) \{[^}]*z-index: 30;/)
    // O espaço no fim: da página e do corpo da janela.
    expect(m).toMatch(/main:has\(\.acao-presa:not\(:empty\)\)::after \{[^}]*height: calc\(64px \+ env\(safe-area-inset-bottom, 0px\)\)/)
    expect(m).toMatch(/\.modal-body:has\(\.acao-presa:not\(:empty\)\)::after \{[^}]*height: 64px/)
    // O botão do Copilot sobe acima da barra.
    expect(m).toMatch(/body:has\(\.acao-presa:not\(:empty\)\) \.copilot-botao \{[^}]*bottom: calc\(84px/)
  })
  it('cada tela da lista põe a ação final na barra', () => {
    presa('components/shared/receber-atendimento.tsx', "'Fechar a comanda'")            // "Receber" e "Fechar a comanda" do PDV
    presa('components/shared/fechamento-do-dia-tela.tsx', 'rotuloDoBotaoDeFechar({ reabrindo, pendente })') // "Fechar o dia"
    presa('components/branch/client-profile.tsx', "'Salvar dados'")
    presa('components/admin/procedure-form.tsx', "'Criar procedimento'")
    presa('components/branch/appointment-modal.tsx', "'Confirmar agendamento'")
    presa('components/branch/appointment-sheet.tsx', 'Confirmar cancelamento')
    presa('components/branch/appointment-sheet.tsx', '<CalendarClock size={14} /> Reagendar')
  })
})

describe('D3: a matriz de Cargos se lê no celular', () => {
  it('o nome e a descrição do módulo têm largura própria: sem caber ao lado, o nível desce para baixo', () => {
    const f = ler('components/admin/roles-editor.tsx')
    const linha = f.slice(f.indexOf('<Fala>{MODULE_LABELS[module]}</Fala>') - 500, f.indexOf('<Fala>{MODULE_LABELS[module]}</Fala>'))
    // `flex: 1` (base 0) encolhia o nome até uma palavra por linha, com o seletor por cima.
    expect(linha).not.toMatch(/minWidth: 0, flex: 1 \}/)
    expect(linha).toMatch(/minWidth: 0, flex: '1 1 240px'/)
  })
})

describe('D6: as grades de cartões cabem na tela', () => {
  it('as trilhas são minmax(0, 1fr) e os filhos encolhem (o filho largo não empurra a trilha)', () => {
    const f = css()
    for (const classe of ['rg-3', 'rg-2', 'form-2col', 'form-3col']) {
      const regras = f.split('\n').filter(l => l.includes(`.${classe}`) && l.includes('grid-template-columns'))
      const corpo = f.slice(f.indexOf(`.${classe} {`), f.indexOf('}', f.indexOf(`.${classe} {`)))
      expect(corpo, classe).toMatch(/grid-template-columns: repeat\(\d, minmax\(0, 1fr\)\)/)
      for (const r of regras) expect(r, classe).not.toMatch(/(repeat\(\d, 1fr\)|: 1fr;)/)
      expect(f, classe).toContain(`.${classe} > * { min-width: 0; }`)
    }
  })
})

describe('A1: o menu lateral do celular começa embaixo da topbar', () => {
  it('a barra e o véu descem a altura da topbar; o botão do menu fecha o que abriu', () => {
    const m = mediaQueContem(css(), 1023, '.sidebar-scrim { display: block;')
    expect(m).toMatch(/\.main-sidebar \{[^}]*top: calc\(var\(--topbar-h\) \+ env\(safe-area-inset-top, 0px\)\) !important;/)
    expect(m).toMatch(/\.sidebar-scrim \{[^}]*top: calc\(var\(--topbar-h\) \+ env\(safe-area-inset-top, 0px\)\);/)
    const topbar = ler('components/shared/topbar.tsx')
    expect(topbar).toContain("aria-label={isOpen ? 'Fechar menu' : 'Abrir menu'}")
    expect(topbar).toContain('aria-expanded={isOpen}')
  })
})

describe('A2: as abas de Configurações no celular são uma linha que rola de lado', () => {
  it('os grupos não empilham; a linha rola sem barra à mostra, e a aba aberta vem à vista', () => {
    const m = mediaQueContem(css(), 639, '.grupos-de-abas {')
    expect(m).toMatch(/\.grupos-de-abas \{[^}]*flex-wrap: nowrap;[^}]*overflow-x: auto;[^}]*scrollbar-width: none;/)
    expect(m).toMatch(/\.grupo-de-abas-chips \{[^}]*flex-wrap: nowrap;/)
    expect(m).not.toMatch(/\.grupo-de-abas, \.grupo-de-abas-chips \{ width: 100%; \}/)
    expect(ler('app/_shared/configuracoes.tsx')).toMatch(/data-grupos-de-abas className="grupos-de-abas">\s*<AtivoAVista \/>/)
    expect(ler('components/shared/ativo-a-vista.tsx')).toContain('[aria-current="page"]')
  })
})

describe('A3: o "+", o "−" e o "Tirar" da comanda têm tamanho de toque', () => {
  it('os três usam a classe do alvo de toque, sem o padding de 2 px', () => {
    const f = ler('components/shared/pdv/produtos-da-comanda.tsx')
    for (const marca of ['data-menos-um', 'data-mais-um', 'aria-label={`Tirar ${i.nome}`}']) {
      const i = f.indexOf(marca)
      const botao = f.slice(f.lastIndexOf('<button', i), f.indexOf('aria-hidden', i))
      expect(botao, marca).toContain('botao-de-toque')
      expect(botao, marca).not.toContain("padding: '2px 6px'")
    }
    expect(css()).toMatch(/\.botao-de-toque \{[^}]*min-height: var\(--altura-controle\);[^}]*min-width: var\(--altura-controle\);/)
  })
})

describe('A4: os seletores têm a altura do controle', () => {
  it('a busca do PDV é campo de busca (a altura do "Comandas")', () => {
    expect(ler('components/shared/pdv/pdv-tela.tsx')).toMatch(/className="field campo-busca" placeholder="Cliente"/)
  })
  it('no Bloquear, a profissional e a sala são seletor de dados, com a altura do "Bloquear para"', () => {
    const f = ler('components/shared/bloqueio-da-agenda.tsx')
    expect(f).toMatch(/<select className="filtro-select" value=\{profId\}/)
    expect(f).toMatch(/<select className="filtro-select" value=\{salaId\}/)
  })
})

describe('A6 e A7: a comanda no celular', () => {
  it('A7: escolher a comanda leva a ela (a comanda fica embaixo da lista)', () => {
    const f = ler('components/shared/pdv/pdv-tela.tsx')
    expect(f).toContain('scrollIntoView')
    expect(f).toMatch(/className="card pdv-comanda-aberta"/)
    expect(css()).toMatch(/\.pdv-comanda-aberta \{[^}]*scroll-margin-top: calc\(var\(--topbar-h\)/)
  })
  it('A6: no celular, a linha da comanda dá a largura ao nome (colunas e respiro menores)', () => {
    const m = mediaQueContem(css(), 639, '.pdv-linha-da-comanda')
    expect(m).toMatch(/\.pdv-linha-da-comanda \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto auto !important;/)
    expect(ler('components/shared/pdv/pdv-tela.tsx')).toContain('className="pdv-linha-da-comanda"')
    expect(ler('components/shared/pdv/produtos-da-comanda.tsx')).toContain('className="pdv-linha-da-comanda"')
  })
})

describe('A8: o cartão "Próximo atendimento" da Minha agenda', () => {
  it('o rótulo e a linha de baixo usam o token sobre o rosé, e a sombra é a do token', () => {
    const f = ler('components/branch/professional-agenda.tsx')
    const cartao = f.slice(f.indexOf('<DestaqueQueAbre href='), f.indexOf('</DestaqueQueAbre>'))
    expect(cartao).not.toMatch(/rgba\(255,255,255,0\.65\)/)
    expect(cartao).not.toMatch(/0 2px 12px rgba\(195,77,107,\.22\)/)
    expect(cartao).toContain("boxShadow: heroEvent ? 'var(--shadow-brand-card)' : 'none'")
    expect(cartao).toContain('className="destaque-avatar"')
    // No celular (duas colunas), o círculo das iniciais sai e o rótulo cabe.
    expect(mediaQueContem(css(), 767, '.destaque-avatar')).toMatch(/\.destaque-avatar \{ display: none; \}/)
  })
})
