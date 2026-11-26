import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { avisoDaGeralParaAsAdmins } from '@/lib/comissoes/config'

const ler = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
const sp = (s: string | null) => (s ?? '').replace(/ /g, ' ')

/**
 * CA-04 (comissoes.md; princípio 3): "Quando a regra geral nova de um
 * procedimento muda o que uma Admin da rede ganha, a janela avisa antes de
 * salvar: 'A mesma para todos: 20%. Vale também para a Dra. Ana (Admin da
 * rede), que hoje recebe 40% pelo padrão dela.' Isso vale no chip e no
 * cadastro do procedimento." D12 da 31ª: o texto não existia no código. A
 * frase não flexiona o gênero (a equipe não tem gênero gravado).
 */
const lucia = { id: 'u1', nome: 'Lúcia Prado', padrao: { procedure_id: null, tipo: 'PERCENTAGE' as const, valor: 50 }, admin: true }
const marcela = { id: 'u2', nome: 'Marcela', padrao: { procedure_id: null, tipo: 'PERCENTAGE' as const, valor: 25 }, admin: false }

describe('a comissão "a mesma para todos" avisa quando muda o que uma Admin da rede ganha (CA-04)', () => {
  it('pelo padrão dela', () => {
    expect(sp(avisoDaGeralParaAsAdmins({ tipo: 'PERCENTAGE', valor: 30 }, { geral: null, porProfissional: [], profissionais: [lucia, marcela] })))
      .toBe('A mesma para todos: 30%. Vale também para Lúcia Prado (Admin da rede), que hoje recebe 50% pelo padrão.')
  })
  it('pelo valor próprio no procedimento', () => {
    expect(sp(avisoDaGeralParaAsAdmins({ tipo: 'PERCENTAGE', valor: 30 }, {
      geral: null, porProfissional: [{ professional_id: 'u1', tipo: 'FIXED_AMOUNT', valor: 60 }], profissionais: [lucia],
    }))).toBe('A mesma para todos: 30%. Vale também para Lúcia Prado (Admin da rede), que hoje recebe R$ 60,00 fixo pelo valor próprio neste procedimento.')
  })
  it('sem padrão nem valor próprio', () => {
    expect(sp(avisoDaGeralParaAsAdmins({ tipo: 'FIXED_AMOUNT', valor: 40 }, {
      geral: null, porProfissional: [], profissionais: [{ ...lucia, padrao: null }],
    }))).toBe('A mesma para todos: R$ 40,00 fixo. Vale também para Lúcia Prado (Admin da rede), que hoje não recebe comissão neste procedimento.')
  })
  it('o que ela ganha não muda: nada a dizer', () => {
    expect(avisoDaGeralParaAsAdmins({ tipo: 'PERCENTAGE', valor: 50 }, { geral: null, porProfissional: [], profissionais: [lucia, marcela] })).toBeNull()
    expect(avisoDaGeralParaAsAdmins({ tipo: 'PERCENTAGE', valor: 30 }, {
      geral: { tipo: 'PERCENTAGE', valor: 30 }, porProfissional: [], profissionais: [lucia],
    })).toBeNull()
  })
  it('a geral de agora é o que ela ganha hoje', () => {
    expect(sp(avisoDaGeralParaAsAdmins({ tipo: 'PERCENTAGE', valor: 20 }, {
      geral: { tipo: 'PERCENTAGE', valor: 30 }, porProfissional: [], profissionais: [lucia],
    }))).toBe('A mesma para todos: 20%. Vale também para Lúcia Prado (Admin da rede), que hoje recebe 30% pela comissão geral deste procedimento.')
  })
  it('quem não é Admin da rede não entra no aviso', () => {
    expect(avisoDaGeralParaAsAdmins({ tipo: 'PERCENTAGE', valor: 30 }, { geral: null, porProfissional: [], profissionais: [marcela] })).toBeNull()
  })
  it('o editor (o chip e o cadastro do procedimento) mostra o aviso, e a leitura marca quem é Admin da rede', () => {
    expect(ler('components/admin/comissao-do-procedimento.tsx')).toContain('data-aviso-da-admin')
    expect(ler('components/admin/comissao-do-procedimento.tsx')).toContain('avisoDaGeralParaAsAdmins(')
    expect(ler('lib/comissoes/leitura.ts')).toContain('adminsDaRede(')
  })
})
