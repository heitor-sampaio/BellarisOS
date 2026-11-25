import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'

/**
 * plataforma:AD-25: o registro clínico sem unidade própria (a evolução, a
 * anotação, o termo, o mapa, a aplicação) leva a unidade da gravação — na
 * tela, no detalhe e no CSV. Gravado SOZINHO (a anotação da Rosane no
 * atendimento concluído, a aplicação de injetável), a gravação não tem outra
 * linha que dê a unidade, e a Auditoria dizia "Da rede". A unidade é a do
 * atendimento do registro (ou a do mapa), lida agora pela rede da sessão
 * (`nomes.unidadesDosClinicos`), como os nomes — nunca o conteúdo.
 */

let id = 9500
const r = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
  id: id--, criado_em: '2026-11-25T14:00:00.000Z', branch_id: null, client_id: 'cV', tabela: 'prontuario_anotacoes', operacao: 'criou',
  registro_id: 'an1', colunas: ['texto'], antes: {}, depois: {}, ator_user_id: 'u1', ator_nome: 'Rosane', ator_tipo: 'membro',
  incompleto: false, ...x,
})
const nomes: NomesDaAuditoria = {
  clientes: { cV: 'Vilma' }, membros: {}, unidades: { bA: 'Lantana Centro', bB: 'Lantana Sul' },
  unidadesDosClinicos: { an1: 'bA', ap1: 'bB' },
}

describe('o registro clínico gravado sozinho leva a unidade do atendimento dele', () => {
  it('a anotação do prontuário, sozinha: a unidade do atendimento, não "Da rede"', async () => {
    const { gruposDaAuditoria } = await import('@/lib/auditoria/frase')
    const [g] = gruposDaAuditoria([r({})], nomes, '/admin/auditoria', null)
    expect(g!.unidade).toBe('Lantana Centro')
    expect(g!.detalhes[0]!.unidade).toBe('Lantana Centro')
  })

  it('a aplicação de injetável, sozinha', async () => {
    const { gruposDaAuditoria } = await import('@/lib/auditoria/frase')
    const [g] = gruposDaAuditoria([r({ tabela: 'injectable_applications', registro_id: 'ap1' })], nomes, '/admin/auditoria', null)
    expect(g!.unidade).toBe('Lantana Sul')
  })

  it('no CSV também', async () => {
    const { linhasDoCsvDaAuditoria } = await import('@/lib/auditoria/frase')
    const [l] = linhasDoCsvDaAuditoria([r({})], nomes)
    expect(l!.unidade).toBe('Lantana Centro')
  })

  it('e o filtro pela unidade a acha', async () => {
    const { gravacoesDaUnidade } = await import('@/lib/auditoria/frase')
    expect(gravacoesDaUnidade([r({})], nomes, 'bA')).toHaveLength(1)
    expect(gravacoesDaUnidade([r({})], nomes, 'bB')).toHaveLength(0)
  })

  it('sem a unidade lida (o prontuário da cliente, que não é de unidade), segue "Da rede"', async () => {
    const { gruposDaAuditoria } = await import('@/lib/auditoria/frase')
    const [g] = gruposDaAuditoria([r({ tabela: 'medical_records', registro_id: 'mr1' })], nomes, '/admin/auditoria', null)
    expect(g!.unidade).toBe('Da rede')
  })

  it('a leitura busca a unidade dos registros clínicos sem unidade (só o id do atendimento ou do mapa, nunca o texto)', () => {
    const fonte = readFileSync(path.join(__dirname, '..', 'lib', 'auditoria', 'leitura.ts'), 'utf8')
    expect(fonte).toContain('unidadesDosRegistrosClinicos')
  })
})
