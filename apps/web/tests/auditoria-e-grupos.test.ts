import { describe, it, expect } from 'vitest'
import { fraseDaAuditoria, linkDaAuditoria } from '@/lib/auditoria/frase'
import type { RegistroDaAuditoria } from '@/lib/auditoria/tipos'
import { ABAS_DE_CONFIGURACAO, GRUPOS_DE_ABAS, abasEmGrupos } from '@/lib/configuracoes/abas'

const base: RegistroDaAuditoria = {
  id: 1, criado_em: '2026-11-16T12:00:00Z', branch_id: null, client_id: null, tabela: 'tags', operacao: 'criou',
  registro_id: '00000000-0000-0000-0000-000000000001', colunas: [], antes: {}, depois: { nome: 'VIP' },
  ator_user_id: null, ator_nome: 'Ana', ator_tipo: 'membro', incompleto: false,
}
const nomes = { clientes: { c1: 'Bia' }, membros: {}, unidades: {} }

describe('a frase da auditoria (CF3a)', () => {
  it('diz o que foi feito, com o nome guardado', () => {
    expect(fraseDaAuditoria(base, nomes)).toBe('Criou a tag VIP')
  })

  it('a abertura do prontuário diz de quem, com o nome lido agora', () => {
    expect(fraseDaAuditoria({ ...base, tabela: 'prontuario_acessos', operacao: 'abriu', client_id: 'c1', depois: {} }, nomes))
      .toBe('Abriu o prontuário de Bia')
  })

  it('a edição da evolução diz o campo, não o texto', () => {
    const f = fraseDaAuditoria({ ...base, tabela: 'medical_record_entries', operacao: 'editou', client_id: 'c1', colunas: ['notes'], depois: {} }, nomes)
    expect(f).toBe('Editou a evolução do prontuário — Bia (anotações)')
  })

  it('o link vai à ficha da cliente no portal de quem lê', () => {
    const r = { ...base, client_id: 'c1' }
    expect(linkDaAuditoria(r, '/admin/auditoria', null)).toBe('/admin/clients/c1')
    expect(linkDaAuditoria(r, '/centro/auditoria', 'centro')).toBe('/centro/clients/c1')
  })
})

describe('as abas de Configurações em grupos (CF1)', () => {
  it('toda aba está em exatamente um grupo, e o Eventos saiu', () => {
    const nosGrupos = GRUPOS_DE_ABAS.flatMap(g => g.abas)
    expect([...nosGrupos].sort()).toEqual(ABAS_DE_CONFIGURACAO.map(a => a.key).sort())
    expect(new Set(nosGrupos).size).toBe(nosGrupos.length)
    expect(ABAS_DE_CONFIGURACAO.map(a => a.key as string)).not.toContain('eventos')
  })

  it('o grupo sem aba visível some', () => {
    expect(abasEmGrupos([{ key: 'tags' }, { key: 'importacoes' }]).map(g => g.label)).toEqual(['Clientes'])
  })
})
