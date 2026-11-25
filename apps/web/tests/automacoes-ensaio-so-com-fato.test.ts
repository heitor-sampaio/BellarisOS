import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MODELOS_DE_AUTOMACAO } from '@/lib/automacoes/modelos'
import { ensaioCabe } from '@/lib/automacoes/ensaio'

/**
 * O ensaio é "um teste com um fato que aconteceu de verdade" (automacoes RX-03),
 * e o gatilho de relógio não tem fato para repetir: o "Ensaiar com o último
 * fato" aparecia na automação de aniversário e sempre recusava. Botão que a
 * pessoa não pode usar, a tela esconde (CLAUDE.md §14); a action segue
 * recusando com { error }.
 */
const fonte = (r: string) => readFileSync(join(__dirname, '..', r), 'utf8')
const grafo = (chave: string) => MODELOS_DE_AUTOMACAO.find(m => m.chave === chave)!.grafo()

describe('o ensaio só aparece com gatilho de fato', () => {
  it('gatilho de relógio: não cabe; gatilho de fato: cabe', () => {
    expect(ensaioCabe(grafo('aniversario'))).toBe(false)
    expect(ensaioCabe(grafo('lembrete-antes-do-agendamento'))).toBe(true)
    expect(ensaioCabe({ nos: [], ligacoes: [] })).toBe(false)
  })
  it('o painel de execuções só mostra o botão quando o ensaio cabe (o grafo gravado, o que a action lê)', () => {
    expect(fonte('components/admin/automacoes/editor.tsx')).toMatch(/ensaioCabe=\{ensaioCabe\(automacao\.grafo\)\}/)
    expect(fonte('components/admin/automacoes/painel-de-execucoes.tsx')).toMatch(/const podeEnsaiar = podeEnsaiarPelaPermissao && ensaioCabe/)
  })
  it('a action decide pela mesma regra e devolve { error }', () => {
    const t = fonte('actions/automacoes.ts')
    expect(t).toMatch(/if \(!ensaioCabe\(grafo\)\) \{\s*return \{ error:/)
  })
})
