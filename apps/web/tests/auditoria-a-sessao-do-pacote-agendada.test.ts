import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'

/**
 * A21 da 34ª simulação (princípio 3; AD-08, "a gravação se lê pelo FATO"): a
 * cliente agendou pelo app a sessão 1 do pacote, e a Auditoria disse "Cancelou
 * o documento Termo do microagulhamento (motivo: Sessão de pacote: os
 * documentos são os do pacote) — Cliente". Ligar o agendamento à sessão do
 * pacote fecha, no banco (`documentos_da_sessao_de_pacote`), o termo que o
 * agendamento tinha gerado — os documentos são os do pacote. Quem agiu está
 * certo (é quem ligou: no caso, a própria cliente, pelo app; o agendamento da
 * mesma hora também é dela); o fato não é "cancelou o documento": é a sessão
 * do pacote agendada. O documento fechado fica no detalhe da gravação.
 */
let id = 7000
const r = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
  id: id--, criado_em: '2026-11-26T21:06:35.515Z', branch_id: 'bA', client_id: 'cJ', tabela: 'issued_documents', operacao: 'editou',
  registro_id: null, colunas: [], antes: {}, depois: {}, ator_user_id: null, ator_nome: 'Joana Prado', ator_tipo: 'cliente',
  incompleto: false, ...x,
})
const nomes: NomesDaAuditoria = {
  clientes: { cJ: 'Joana Prado' }, membros: {}, unidades: { bA: 'Centro' },
  motivosDoDocumento: { d1: 'Sessão de pacote: os documentos são os do pacote', d2: 'Pacote cancelado' },
  sessoesDoPacote: { ps1: 'a sessão 1 do pacote 3 microagulhamentos' },
}
const docFechado = (reg = 'd1') => r({
  registro_id: reg, colunas: ['closed_at', 'closed_reason', 'status'],
  antes: { status: 'A_GERAR' }, depois: { title: 'Termo do microagulhamento', status: 'CANCELADO' },
})
// A gravação de antes desta rodada não guarda o agendamento (só o nome da coluna).
const sessaoLigada = () => r({ tabela: 'package_sessions', registro_id: 'ps1', colunas: ['appointment_id'] })
// Desde a migration 20261213500002, o gatilho guarda o id do agendamento, antes e depois.
const sessaoComValor = (de: string | null, para: string | null) => r({
  tabela: 'package_sessions', registro_id: 'ps1', colunas: ['appointment_id'], antes: { appointment_id: de }, depois: { appointment_id: para },
})

describe('A21: a sessão do pacote agendada é o fato da gravação', () => {
  it('a gravação diz que agendou a sessão do pacote, não que cancelou o documento (nas duas ordens)', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(fraseDoGrupo([docFechado(), sessaoLigada()], nomes)).toBe('Agendou a sessão 1 do pacote 3 microagulhamentos — Joana Prado')
    expect(fraseDoGrupo([sessaoLigada(), docFechado()], nomes)).toBe('Agendou a sessão 1 do pacote 3 microagulhamentos — Joana Prado')
    expect(fraseDoGrupo([docFechado(), sessaoComValor(null, 'ag1')], nomes)).toBe('Agendou a sessão 1 do pacote 3 microagulhamentos — Joana Prado')
  })

  it('a sessão ligada sozinha, com o agendamento guardado: agendou ou desmarcou', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    expect(fraseDaAuditoria(sessaoComValor(null, 'ag1'), nomes)).toBe('Agendou a sessão 1 do pacote 3 microagulhamentos — Joana Prado')
    expect(fraseDaAuditoria(sessaoComValor('ag1', 'ag2'), nomes)).toBe('Agendou a sessão 1 do pacote 3 microagulhamentos — Joana Prado')
    expect(fraseDaAuditoria(sessaoComValor('ag1', null), nomes)).toBe('Desmarcou a sessão 1 do pacote 3 microagulhamentos — Joana Prado')
  })

  it('o gatilho de package_sessions guarda o agendamento (o id, sem dado pessoal)', () => {
    const PASTA = join(__dirname, '..', '..', '..', 'supabase', 'migrations')
    const com = readdirSync(PASTA).filter(f => f.endsWith('.sql')).sort()
      .map(f => readFileSync(join(PASTA, f), 'utf8'))
      .filter(s => /on public\.package_sessions/.test(s) && s.includes('private.auditar('))
    const vale = com[com.length - 1] ?? ''
    for (const t of ['auditoria_ins', 'auditoria_upd', 'auditoria_del']) {
      expect(vale).toMatch(new RegExp(`create trigger ${t}[^;]*on public\\.package_sessions[^;]*private\\.auditar\\('normal', '', 'status,appointment_id', 'client_packages:client_package_id', ''\\)`))
    }
    expect(vale.trimEnd()).toMatch(/notify pgrst, 'reload schema';$/)
  })

  it('quem agiu segue sendo quem gravou, e o documento fechado fica no detalhe', async () => {
    const { gruposDaAuditoria } = await import('@/lib/auditoria/frase')
    const [g] = gruposDaAuditoria([docFechado(), sessaoLigada()], nomes, '/admin/auditoria', null)
    expect(g?.quem).toBe('Joana Prado')
    expect(g?.detalhes.map(d => d.oQue)).toContain(
      'Cancelou o documento Termo do microagulhamento (motivo: Sessão de pacote: os documentos são os do pacote) — Joana Prado')
  })

  it('o documento cancelado por outro motivo segue "Cancelou o documento"', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    expect(fraseDaAuditoria(docFechado('d2'), nomes)).toBe('Cancelou o documento Termo do microagulhamento (motivo: Pacote cancelado) — Joana Prado')
  })

  it('a leitura busca a sessão do pacote também quando a gravação só a liga ao agendamento', () => {
    const leitura = readFileSync(join(__dirname, '..', 'lib', 'auditoria', 'leitura.ts'), 'utf8')
    expect(leitura).toMatch(/const sessoes = ids\(r => r\.tabela === 'package_sessions' && r\.operacao === 'editou' && \(r\.colunas\.includes\('status'\) \|\| r\.colunas\.includes\('appointment_id'\)\)\)/)
  })
})
