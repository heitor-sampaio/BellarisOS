import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A dica abre também na tela só de leitura (2026-11-16). Dentro de um
 * `<fieldset disabled>` (o GERENTE da plataforma, a ficha de quem só vê), um
 * `<button>` fica desligado: a dica não abria no clique, no toque nem no
 * teclado. O gatilho é um `span role="button"` com `tabIndex`, e o app da rede
 * usa a MESMA dica do núcleo (não uma cópia que volte a ser `<button>`).
 * A prova na tela: e2e/dicas-plataforma.spec.ts ("quem só vê…").
 */
const RAIZ = join(__dirname, '..', '..', '..')
// O código sem os comentários (o comentário da dica explica o porquê e cita o <button>).
const ler = (...p: string[]) => readFileSync(join(RAIZ, ...p), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('a dica', () => {
  it('o gatilho não é <button> (o fieldset disabled o desligaria)', () => {
    const fonte = ler('packages', 'nucleo', 'src', 'components', 'dica.tsx')
    expect(fonte).not.toMatch(/<button\b/)
    expect(fonte).toMatch(/role="button"/)
    expect(fonte).toMatch(/tabIndex=\{0\}/)
    expect(fonte).toMatch(/e\.key === 'Enter'/)
  })

  // O nome da dica vem de um ::after do CSS (2026-11-17), não do aria-label: o
  // getByLabel('Fuso horário') achava o seletor E a dica "Sobre: Fuso horário" —
  // a dica ao lado de um campo sempre tinha o rótulo dele no nome. O conteúdo
  // gerado entra no nome acessível (o leitor de tela lê, o getByRole acha), mas
  // não no getByLabel nem no textContent do rótulo em que a dica mora.
  it('o nome não é aria-label: vem do ::after (.dica-nome), fora do getByLabel', () => {
    const fonte = ler('packages', 'nucleo', 'src', 'components', 'dica.tsx')
    expect(fonte).not.toMatch(/aria-label=/)
    expect(fonte).toMatch(/data-rotulo=\{rotulo\}/)
    expect(fonte).toMatch(/className="dica-nome"/)
    const css = ler('packages', 'nucleo', 'src', 'estilos', 'globals.css')
    expect(css).toMatch(/\.dica-nome::after\s*\{[^}]*content:\s*attr\(data-rotulo\)/)
  })

  it('o app da rede reexporta a do núcleo', () => {
    const web = ler('apps', 'web', 'components', 'shared', 'dica.tsx')
    expect(web).toMatch(/from '@estetica-os\/nucleo\/components\/dica'/)
    expect(web).not.toMatch(/<button\b|useState/)
  })
})
