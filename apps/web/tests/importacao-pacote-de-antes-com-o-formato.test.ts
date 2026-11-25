import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pacoteDeAntesLegivel, FORMATO_DO_PACOTE_DE_ANTES } from '@/lib/importacao/pacote-legivel'

/**
 * A tela das Importações mostra o formato do "Pacote de antes" com as colunas
 * opcionais (crm-inbox:IM-22, o princípio 7; A22 da 29ª): o formato em
 * destaque dizia só "procedimento; total; usadas", e a amostra da prévia dizia
 * "1 pacote de antes" — a validade (e o valor) lidos não apareciam.
 */
const hoje = new Date('2026-11-25T15:00:00Z')

describe('o pacote de antes na tela das Importações', () => {
  it('o formato traz as cinco partes, com as opcionais marcadas', () => {
    expect(FORMATO_DO_PACOTE_DE_ANTES).toBe('procedimento; total; usadas; valor de referência; validade')
  })
  it('a amostra diz o que foi lido, inclusive a validade e o valor', () => {
    expect(pacoteDeAntesLegivel({ procedimentoId: 'p', total: 10, usadas: 7, valor: 1500, validade: '2027-12-31' }, 'Limpeza de pele', hoje))
      .toBe('Limpeza de pele: 7 de 10 sessões usadas · R$ 1.500,00 · validade 31/12/2027')
  })
  it('sem as opcionais, a amostra diz que faltam', () => {
    expect(pacoteDeAntesLegivel({ procedimentoId: 'p', total: 5, usadas: 1, valor: null, validade: null }, 'Peeling', hoje))
      .toBe('Peeling: 1 de 5 sessões usadas · sem valor de referência · sem validade')
  })
  it('a validade passada diz que o pacote já vem vencido', () => {
    expect(pacoteDeAntesLegivel({ procedimentoId: 'p', total: 4, usadas: 2, valor: 400, validade: '2025-01-10' }, 'Drenagem', hoje))
      .toBe('Drenagem: 2 de 4 sessões usadas · R$ 400,00 · vencido em 10/01/2025')
  })
  it('a tela usa os dois', () => {
    const t = readFileSync(join(__dirname, '..', 'components/branch/importador-de-contatos.tsx'), 'utf8')
    expect(t).toContain('FORMATO_DO_PACOTE_DE_ANTES')
    expect(t).toContain('pacoteDeAntesLegivel(')
  })
})
