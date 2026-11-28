import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Os números da importação com o separador de milhar (A1 e D13 da 40ª
 * simulação; princípio 3, o número da tela é o que vale): a planilha de 1.250
 * linhas saía "Importar 1235 linhas" e "1235 novos · 0 completados · 15
 * recusadas", enquanto o resto do sistema escreve "1.235".
 */

const ler = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8')

describe('a importação escreve os números com milhar', () => {
  it('o botão: "Importar 1.235 linhas" (todas novas) e as partes também', async () => {
    const { textoDoBotaoDeImportar } = await import('@/lib/importacao/o-que-entra')
    expect(textoDoBotaoDeImportar({ destino: 'clientes', prontas: 1235, juntamNaPlanilha: 0, completam: 0 })).toBe('Importar 1.235 linhas')
    expect(textoDoBotaoDeImportar({ destino: 'clientes', prontas: 1235, juntamNaPlanilha: 0, completam: 1200 }))
      .toBe('Importar 1.235 linhas: 35 fichas novas, 1.200 completam quem já existe')
    expect(textoDoBotaoDeImportar({ destino: 'contatos', prontas: 2000, juntamNaPlanilha: 1000, completam: 0 }))
      .toBe('Importar 2.000 linhas: 1.000 contatos novos, 1.000 linhas juntam com outra')
  })

  it('o placar: "1.235 novos · 0 completados · 15 recusadas"', async () => {
    const { placarDaImportacao } = await import('@/lib/importacao/o-que-entra')
    expect(placarDaImportacao({ novas: 1235, completadas: 0, semMudanca: 0, comAviso: 0, recusadas: 15, oportunidades: 0 }))
      .toBe('1.235 novos · 0 completados · 15 recusadas')
    expect(placarDaImportacao({ novas: 1230, completadas: 0, semMudanca: 1000, comAviso: 1001, recusadas: 1500, oportunidades: 1200 }))
      .toBe('1.230 novos · 0 completados · 1.000 sem mudança · 1.500 recusadas · 1.200 oportunidades · das 2.230 que entraram, 1.001 com aviso')
  })

  it('a tela: as contagens da prévia e o andamento ("1.250 de 1.250 linhas") com milhar', () => {
    const f = ler('components/branch/importador-de-contatos.tsx')
    // O `plural` da tela formata o número; o andamento não escreve o número cru.
    expect(f).toMatch(/const plural = \(n: number, um: string, varios: string\) => `\$\{n\.toLocaleString\('pt-BR'\)\}/)
    expect(f).not.toContain('{a.processadas} de ')
    expect(f).not.toContain('(faltam {faltam} de {linhasProntas.length})')
    expect(f).not.toContain('E mais {linhas.length - 50}')
  })
})
