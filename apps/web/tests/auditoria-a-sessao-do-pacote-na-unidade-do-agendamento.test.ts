import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'

/**
 * D12 da 35ª simulação (princípio 3; AD-08, AD-13 — a gravação leva a unidade
 * do FATO, como a conclusão e a desistência na unidade do agendamento): a
 * sessão 1 do pacote vendido em Rio Preto, agendada e atendida em Prudente,
 * saía na Auditoria "Agendou a sessão 1 do pacote … — Cliente" com a unidade
 * Rio Preto. O gatilho de `package_sessions` dá à linha a unidade do PACOTE (a
 * da venda); o fato é o agendamento, e a unidade é a dele — lida agora pelo id
 * que o gatilho guarda desde `20261213500002` (decisão do Claude, 27/11).
 */
let id = 9000
const r = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
  id: id--, criado_em: '2026-11-26T21:06:35.515Z', branch_id: 'bRP', client_id: 'cB', tabela: 'issued_documents', operacao: 'editou',
  registro_id: null, colunas: [], antes: {}, depois: {}, ator_user_id: 'u1', ator_nome: 'Hermínia', ator_tipo: 'membro',
  incompleto: false, ...x,
})
const nomes: NomesDaAuditoria = {
  clientes: { cB: 'Bete' }, membros: {}, unidades: { bRP: 'Rio Preto', bPP: 'Prudente' },
  motivosDoDocumento: { d1: 'Sessão de pacote: os documentos são os do pacote' },
  sessoesDoPacote: { ps1: 'a sessão 1 do pacote 3 peelings' },
  unidadesDosAgendamentos: { ag1: 'bPP' },
}
const docFechado = () => r({
  registro_id: 'd1', colunas: ['closed_at', 'closed_reason', 'status'],
  antes: { status: 'A_GERAR' }, depois: { title: 'Termo do peeling', status: 'CANCELADO' },
})
const sessao = (de: string | null, para: string | null) => r({
  tabela: 'package_sessions', registro_id: 'ps1', colunas: ['appointment_id'], antes: { appointment_id: de }, depois: { appointment_id: para },
})

describe('D12: a sessão do pacote agendada sai na unidade do agendamento', () => {
  it('a gravação com o documento fechado, nas duas ordens', async () => {
    const { gruposDaAuditoria } = await import('@/lib/auditoria/frase')
    for (const linhas of [[docFechado(), sessao(null, 'ag1')], [sessao(null, 'ag1'), docFechado()]]) {
      const [g] = gruposDaAuditoria(linhas, nomes, '/admin/auditoria', null)
      expect(g?.oQue).toBe('Agendou a sessão 1 do pacote 3 peelings — Bete')
      expect(g?.unidade).toBe('Prudente')
    }
  })

  it('a sessão sozinha, e a desmarcada pela unidade do agendamento de antes', async () => {
    const { gruposDaAuditoria } = await import('@/lib/auditoria/frase')
    expect(gruposDaAuditoria([sessao(null, 'ag1')], nomes, '/admin/auditoria', null)[0]?.unidade).toBe('Prudente')
    expect(gruposDaAuditoria([sessao('ag1', null)], nomes, '/admin/auditoria', null)[0]?.unidade).toBe('Prudente')
  })

  it('o filtro por unidade e o CSV seguem a unidade do agendamento', async () => {
    const { gravacoesDaUnidade, linhasDoCsvDaAuditoria } = await import('@/lib/auditoria/frase')
    const linhas = [docFechado(), sessao(null, 'ag1')]
    expect(gravacoesDaUnidade(linhas, nomes, 'bPP')).toHaveLength(2)
    expect(gravacoesDaUnidade(linhas, nomes, 'bRP')).toHaveLength(0)
    const csv = linhasDoCsvDaAuditoria([sessao(null, 'ag1')], nomes)
    expect(csv[0]?.unidade).toBe('Prudente')
  })

  it('sem o agendamento lido, a linha fica como o gatilho a gravou', async () => {
    const { gruposDaAuditoria } = await import('@/lib/auditoria/frase')
    expect(gruposDaAuditoria([sessao(null, 'agX')], nomes, '/admin/auditoria', null)[0]?.unidade).toBe('Rio Preto')
  })

  it('a leitura busca a unidade dos agendamentos das sessões, pela rede', () => {
    const leitura = readFileSync(join(__dirname, '..', 'lib', 'auditoria', 'leitura.ts'), 'utf8')
    expect(leitura).toMatch(/unidadesDosAgendamentos/)
  })
})
