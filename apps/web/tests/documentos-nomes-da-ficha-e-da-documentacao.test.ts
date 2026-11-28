import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const raiz = join(__dirname, '..')
const ler = (arquivo: string) => readFileSync(join(raiz, arquivo), 'utf8')

/**
 * Princípio 7 (o Heitor, 2026-11-26: "Ser intuitivo é justamente o contrario,
 * ser facil de usar mesmo sem muitas explicações."): a tela fica óbvia pelo
 * NOME e pelo que aparece, não por um parágrafo.
 */
describe('A10 da 43ª: a aba Documentos da ficha não tem dois "Documentos"', () => {
  it('os termos são "Documentos para assinatura"; os arquivos da cliente (o RG, o comprovante), "Anexos"', () => {
    expect(ler('components/branch/client-profile.tsx')).toContain('>Documentos para assinatura</h3>')
    const aba = ler('components/branch/client-documents-tab.tsx')
    const cabecalho = aba.slice(aba.indexOf('{/* Header */}'), aba.indexOf('Adicionar documento'))
    expect(cabecalho).toMatch(/>\s*Anexos\s*</)
    expect(cabecalho).not.toMatch(/>\s*Documentos\s*</)
  })
})

describe('A11 da 43ª: a etapa Documentação do plano sem o parágrafo que explica a tela', () => {
  it('o botão já diz o que falta ("Falta assinar: …"), e cada documento tem o "Colher assinatura"', () => {
    const t = ler('components/branch/checkout-wizard.tsx')
    expect(t).toContain('`Falta assinar: ${documentosQueTravam.map(d => d.titulo).join(\', \')}`')
    expect(t).not.toContain('data-exigencia-do-modelo')
    expect(t).not.toContain('textoDaExigenciaDoModelo')
    expect(existsSync(join(raiz, 'lib/checkout/exigencia-do-modelo.ts'))).toBe(false)
  })
})
