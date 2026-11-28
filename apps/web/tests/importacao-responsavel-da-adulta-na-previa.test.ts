import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as normalizar from '@/lib/importacao/normalizar'

/**
 * D6 da 43ª simulação (IM-09: "A prévia e o resultado mostram as recusadas e
 * as que entraram com aviso"; IM-23): a adulta com o responsável legal na
 * planilha só ganhava o aviso "Responsável legal não gravado" no resultado —
 * a regra morava no processamento. A prévia e o servidor usam a MESMA função.
 */
const aviso = (normalizar as Record<string, unknown>).avisoDoResponsavelNaoGravado as
  ((dados: normalizar.DadosDaLinha, nascimento?: string | null, hoje?: Date) => string | null) | undefined
const hoje = new Date('2026-11-28T12:00:00-03:00')

describe('o responsável legal da adulta, na prévia e no resultado (D6 da 43ª)', () => {
  it('a função mora no normalizar, que a prévia e o servidor dividem', () => {
    expect(typeof aviso).toBe('function')
  })
  it('a adulta com o responsável na planilha é avisada; sem o nascimento, também', () => {
    expect(aviso!({ name: 'Zeni', birth_date: '1990-03-10', responsavel_nome: 'Marta' }, undefined, hoje))
      .toBe('Responsável legal não gravado: pela data de nascimento, não é menor de idade (só a menor tem responsável na ficha).')
    expect(aviso!({ name: 'Zeni', responsavel_telefone: '(64) 99123-4567' }, undefined, hoje))
      .toBe('Responsável legal não gravado: sem a data de nascimento, não se sabe se é menor de idade.')
  })
  it('a menor, ou a linha sem responsável, não', () => {
    expect(aviso!({ name: 'Tatiana', birth_date: '2011-03-10', responsavel_nome: 'Marta' }, undefined, hoje)).toBeNull()
    expect(aviso!({ name: 'Ana', birth_date: '1990-03-10' }, undefined, hoje)).toBeNull()
  })
  it('o nascimento que a ficha fica tendo vale mais que o da planilha (o servidor passa o da ficha que já existe)', () => {
    expect(aviso!({ name: 'Tatiana', responsavel_nome: 'Marta' }, '2011-03-10', hoje)).toBeNull()
  })
  it('a prévia e o processamento chamam a função; o texto não mora mais no processamento', () => {
    const raiz = join(__dirname, '..')
    const previa = readFileSync(join(raiz, 'components/branch/importador-de-contatos.tsx'), 'utf8')
    const processar = readFileSync(join(raiz, 'lib/importacao/processar.ts'), 'utf8')
    expect(previa).toContain('avisoDoResponsavelNaoGravado(')
    expect(processar).toContain('avisoDoResponsavelNaoGravado(')
    expect(processar).not.toContain('Responsável legal não gravado')
  })
})
