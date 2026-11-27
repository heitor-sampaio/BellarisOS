import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A nota "Você vê a aba LGPD (vem de Prontuário em Gerenciar)… As outras
 * pedem…" (27ª simulação) explicava a tela, e saiu (A1 da 36ª simulação; o
 * Heitor, 26/11: "isso não é ser intuitivo, é ser explicativo e não isso que eu
 * quero. Ser intuitivo é justamente o contrario, ser facil de usar mesmo sem
 * muitas explicações."; princípio 7). As abas da pessoa já se dizem no topo
 * (`abasDoTopo`) e na barra; a aba pedida que não abre diz por quê.
 */
const fonte = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')
describe('Configurações não explica por que aparecem só aquelas abas [7]', () => {
  it('a tela não mostra a nota', () => {
    const tela = fonte('app/_shared/configuracoes.tsx')
    expect(tela).not.toMatch(/porQueSoEstasAbas/)
    expect(tela).not.toMatch(/data-abas-do-acesso/)
  })

  it('a função da nota saiu', () => {
    expect(fonte('lib/configuracoes/abas-que-faltam.ts')).not.toMatch(/porQueSoEstasAbas|As outras pedem/)
  })
})

describe('o topo das Configurações diz as abas da pessoa', () => {
  // Clientes em Gerenciar abre a LGPD desde a revisão de 24/11 (Q09): a sigla
  // não vira "lgpd" no meio da frase.
  it('em minúsculas, menos a sigla', async () => {
    const { abasDoTopo } = await import('@/lib/configuracoes/abas-que-faltam')
    expect(abasDoTopo(['Tags', 'Importações', 'LGPD'])).toBe('Tags, importações e LGPD da rede')
    expect(abasDoTopo(['Tags', 'Importações'])).toBe('Tags e importações da rede')
    expect(abasDoTopo(['LGPD'])).toBe('LGPD da rede')
    expect(fonte('app/_shared/configuracoes.tsx')).toMatch(/abasDoTopo\(tabs\.map\(t => t\.label\)\)/)
  })
})
