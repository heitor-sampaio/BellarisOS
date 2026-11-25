import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deQuemEAExecucao } from '@/lib/automacoes/sobre-da-execucao'

/**
 * As linhas de execução das automações dizem de quem é cada uma (A18 da 29ª,
 * o princípio 7). O nome vinha só de `contexto.cliente`, que o fluxo preenche
 * ao ler a cliente — o lembrete que ainda espera (ou que só mandou a mensagem)
 * não o tinha, e a linha saía sem nome. Sem ele no contexto, o nome sai da
 * cliente do fato: a do evento (`clienteId`), ou a do agendamento dele.
 */
describe('de quem é a execução', () => {
  it('o nome que o fluxo já leu vale', () => {
    expect(deQuemEAExecucao({ cliente: { nome: 'Natércia' }, evento: { entidade: 'agendamento', entidadeId: 'a1', dados: { clienteId: 'c1' } } }))
      .toEqual({ nome: 'Natércia', clienteId: null, agendamentoId: null })
    expect(deQuemEAExecucao({ lead: { nome: 'Lia' } })).toEqual({ nome: 'Lia', clienteId: null, agendamentoId: null })
  })
  it('sem nome: a cliente do fato', () => {
    expect(deQuemEAExecucao({ evento: { entidade: 'agendamento', entidadeId: 'a1', dados: { clienteId: 'c1' } } }))
      .toEqual({ nome: null, clienteId: 'c1', agendamentoId: null })
    expect(deQuemEAExecucao({ evento: { entidade: 'cliente', entidadeId: 'c2', dados: {} } }))
      .toEqual({ nome: null, clienteId: 'c2', agendamentoId: null })
  })
  it('sem a cliente no fato: a do agendamento', () => {
    expect(deQuemEAExecucao({ evento: { entidade: 'agendamento', entidadeId: 'a1', dados: {} } }))
      .toEqual({ nome: null, clienteId: null, agendamentoId: 'a1' })
  })
  it('sem nada', () => {
    expect(deQuemEAExecucao(null)).toEqual({ nome: null, clienteId: null, agendamentoId: null })
  })
  it('a lista das execuções completa o nome pelo servidor, na rede da sessão', () => {
    const t = readFileSync(join(__dirname, '..', 'actions/automacoes.ts'), 'utf8')
    expect(t).toContain('deQuemEAExecucao(')
    expect(t).toMatch(/from\('clients'\)\.select\('id, name'\)\.eq\('tenant_id', ctx\.tenantId!\)/)
  })
})
