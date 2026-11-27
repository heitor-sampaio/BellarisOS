import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppModule } from '@estetica-os/types'
import { chipDaComissao } from '@/lib/comissoes/chip-do-membro'

/**
 * A21 da 37ª simulação (princípio 3: o resumo é o que vale; texto das linhas:
 * decisão do Claude, 27/11):
 * - "O que essa pessoa vai ver" não dizia o "Dispensar documentos" (documentos.md:
 *   MANAGE só DISPENSA um documento obrigatório da cliente, com motivo) nem o que a
 *   pessoa faz com os injetáveis (atendimento.md: planejar e registrar a aplicação
 *   pedem o Atendimento em Gerenciar E o Prontuário em Ver; ver, o Prontuário em Ver).
 * - A linha "Venda:" da Equipe sem a comissão de venda da rede explicava a tela
 *   ("(sem ela, nenhuma: a rede não tem)"): o Heitor, 26/11, "isso não é ser
 *   intuitivo, é ser explicativo e não isso que eu quero".
 * - Vocabulário (o Heitor, 13/11: "não quero mais tu falando nomes de cargos como
 *   se fossem cargos fixos"): o resumo fala da PESSOA ("Se a pessoa atende").
 */
const fonte = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')

describe('A21: o resumo diz o "Dispensar documentos"', () => {
  it('com o módulo: dispensa o documento obrigatório, com motivo', async () => {
    const { dispensaNoResumo } = await import('@/lib/permissions-copy')
    expect(dispensaNoResumo({ documents: 'MANAGE' })).toBe('Dispensa um documento obrigatório da cliente, com o motivo.')
  })
  it('sem o módulo, ou fora do plano: nada', async () => {
    const { dispensaNoResumo } = await import('@/lib/permissions-copy')
    expect(dispensaNoResumo({ documents: 'NONE' })).toBeNull()
    expect(dispensaNoResumo({})).toBeNull()
    expect(dispensaNoResumo({ documents: 'MANAGE' }, ['documents'] as AppModule[])).toBeNull()
  })
})

describe('A21: o resumo diz o que a pessoa faz com os injetáveis', () => {
  it('Atendimento em Gerenciar e Prontuário em Ver: planeja e registra', async () => {
    const { injetaveisNoResumo } = await import('@/lib/permissions-copy')
    expect(injetaveisNoResumo({ atendimento: 'MANAGE', medical_records: 'VIEW' })).toBe('Planeja os injetáveis e registra a aplicação.')
    expect(injetaveisNoResumo({ atendimento: 'MANAGE', medical_records: 'MANAGE' })).toBe('Planeja os injetáveis e registra a aplicação.')
  })
  it('Atendimento em Gerenciar sem o Prontuário: o que falta', async () => {
    const { injetaveisNoResumo } = await import('@/lib/permissions-copy')
    expect(injetaveisNoResumo({ atendimento: 'MANAGE', medical_records: 'NONE' })).toBe('Os injetáveis pedem também o Prontuário em “Ver”.')
  })
  it('só o Prontuário em Ver: vê os injetáveis', async () => {
    const { injetaveisNoResumo } = await import('@/lib/permissions-copy')
    expect(injetaveisNoResumo({ atendimento: 'VIEW', medical_records: 'VIEW' })).toBe('Vê os injetáveis, sem planejar nem registrar.')
    expect(injetaveisNoResumo({ atendimento: 'NONE', medical_records: 'MANAGE' })).toBe('Vê os injetáveis, sem planejar nem registrar.')
  })
  it('sem nenhum dos dois, ou o Prontuário fora do plano: nada', async () => {
    const { injetaveisNoResumo } = await import('@/lib/permissions-copy')
    expect(injetaveisNoResumo({ atendimento: 'NONE', medical_records: 'NONE' })).toBeNull()
    expect(injetaveisNoResumo({ atendimento: 'MANAGE', medical_records: 'VIEW' }, ['medical_records'] as AppModule[])).toBeNull()
  })
  it('a prévia do cargo mostra as duas linhas', () => {
    const tela = fonte('components/admin/roles-editor.tsx')
    expect(tela).toMatch(/dispensaNoResumo\(levels, foraDoPlano\)/)
    expect(tela).toMatch(/data-resumo-dispensa/)
    expect(tela).toMatch(/injetaveisNoResumo\(levels, foraDoPlano\)/)
    expect(tela).toMatch(/data-resumo-injetaveis/)
  })
})

describe('A21: a linha "Venda:" da Equipe sem a da rede não explica', () => {
  it('"Venda: a do pacote ou produto vendido"', () => {
    expect(chipDaComissao({ padrao: null, excecoes: 0, vendaPct: null, atende: false, vendaDaRede: { plano: null, produto: null } }))
      .toBe('Venda: a do pacote ou produto vendido')
  })
})

describe('Vocabulário: o resumo fala da pessoa', () => {
  it('"Se a pessoa atende", nunca "Se ela atende"', async () => {
    const { vistasPessoaisNoResumo } = await import('@/lib/permissions-copy')
    for (const niveis of [{ agenda: 'NONE', financial: 'NONE' }, { agenda: 'NONE', financial: 'VIEW' }, { agenda: 'VIEW', financial: 'NONE' }]) {
      const t = vistasPessoaisNoResumo(niveis, [])!
      expect(t).toMatch(/^Se a pessoa atende/)
      expect(t).not.toMatch(/Se ela atende/)
    }
  })
})
