import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { EVENTOS } from '@estetica-os/types'

/**
 * O catálogo corresponde à realidade?
 *
 * Existe porque a forma de drift mais provável aqui é também a mais cruel:
 * um nome no catálogo sem nenhum emissor no código. A automação é montada na
 * tela, salva sem erro, e simplesmente **nunca dispara** — sem mensagem, sem
 * log, sem nada que indique onde procurar.
 *
 * O teste varre o código atrás de `EVENTOS.<CHAVE>` em vez da string literal,
 * porque é assim que a emissão acontece (o TypeScript barra o literal solto).
 */

const RAIZ = join(__dirname, '..')
const PASTAS = ['actions', 'lib', 'app']
const IGNORAR = new Set(['node_modules', '.next', 'dist'])

function arquivos(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (IGNORAR.has(nome)) continue
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) arquivos(caminho, saida)
    else if (/\.tsx?$/.test(nome)) saida.push(caminho)
  }
  return saida
}

const fonte = PASTAS
  .flatMap(p => arquivos(join(RAIZ, p)))
  // O próprio catálogo e este teste não contam como emissor.
  .filter(f => !f.includes('tests'))
  .map(f => readFileSync(f, 'utf8'))
  .join('\n')

describe('catálogo de eventos', () => {
  it.each(Object.entries(EVENTOS))(
    '%s tem quem o emita',
    (chave, nome) => {
      const usado = fonte.includes(`EVENTOS.${chave}`)
      expect(usado, `${nome} está no catálogo e ninguém emite — a automação seria montada e nunca dispararia`).toBe(true)
    },
  )

  it('nome segue a convenção entidade.verbo_no_passado', () => {
    for (const nome of Object.values(EVENTOS)) {
      expect(nome, `${nome} fora do padrão`).toMatch(/^[a-z_]+\.[a-z_]+$/)
    }
  })

  it('não há nome repetido com chaves diferentes', () => {
    const nomes = Object.values(EVENTOS)
    expect(new Set(nomes).size).toBe(nomes.length)
  })
})
