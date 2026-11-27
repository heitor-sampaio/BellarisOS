import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * D5 da 37ª simulação (DE-14: "A sessão não emite documento próprio"; PA-08,
 * DT-01). O agendamento da sessão de pacote nascia avulso, o gatilho do INSERT
 * emitia os documentos do procedimento, e a ligação ao pacote (o UPDATE em
 * package_sessions, no pedido seguinte) os cancelava: a cliente ganhava
 * documentos cancelados e a contagem da tela Documentos inflava.
 *
 * Agora a sessão de pacote nasce JÁ ligada, numa transação só
 * (`agendamento_criar_na_sessao_de_pacote`), e o gatilho do INSERT sabe que é
 * sessão de pacote: não emite nada (nada nasce para morrer).
 */

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations')
const migration = () => {
  const nome = readdirSync(MIGRATIONS).find(n => /^202612163\d{5}_.*sessao_de_pacote.*\.sql$/.test(n))
  expect(nome, 'a migration da área D com a sessão de pacote').toBeTruthy()
  return readFileSync(path.join(MIGRATIONS, nome!), 'utf8')
}

describe('a sessão de pacote não emite documento', () => {
  it('a migration cria a função que agenda e liga numa transação, e o INSERT da sessão de pacote não emite', () => {
    const sql = migration()
    expect(sql).toMatch(/create or replace function public\.agendamento_criar_na_sessao_de_pacote\(p_agendamento jsonb, p_sessao uuid\)/)
    expect(sql).toMatch(/set_config\('bellaris\.sessao_de_pacote'/)
    // O gatilho do INSERT confere a marca antes de emitir (troca no corpo VIVO).
    expect(sql).toMatch(/private\.documentos_no_agendamento\(\)/)
    expect(sql).toMatch(/current_setting\('bellaris\.sessao_de_pacote', true\)/)
    // A ligação perdida desfaz o agendamento (a transação inteira).
    expect(sql).toMatch(/update public\.package_sessions/)
    expect(sql).toMatch(/raise exception 'CREDITO_JA_USADO'/)
    // Função nova: só o servidor.
    expect(sql).toMatch(/revoke all on function public\.agendamento_criar_na_sessao_de_pacote\(jsonb, uuid\) from public, anon, authenticated/)
    expect(sql).toMatch(/grant execute on function public\.agendamento_criar_na_sessao_de_pacote\(jsonb, uuid\) to service_role/)
    expect(sql.trimEnd()).toMatch(/notify pgrst, 'reload schema';$/)
  })

  it('o app agenda a sessão de pacote pela função, e o crédito perdido volta como "já usado"', async () => {
    const { inserirAgendamentoDaSessaoDePacote } = await import('@/lib/documentos/sessao-de-pacote')
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: 'ag-1', error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'CREDITO_JA_USADO' } })
      .mockResolvedValueOnce({ data: null, error: { message: 'outro erro' } })
    const admin = { rpc } as never
    const linha = { branch_id: 'b', client_id: 'c', status: 'SCHEDULED' }

    expect(await inserirAgendamentoDaSessaoDePacote(admin, linha, 'sessao-1')).toEqual({ id: 'ag-1' })
    expect(rpc).toHaveBeenCalledWith('agendamento_criar_na_sessao_de_pacote', { p_agendamento: linha, p_sessao: 'sessao-1' })
    expect(await inserirAgendamentoDaSessaoDePacote(admin, linha, 'sessao-1')).toEqual({ jaUsado: true })
    expect(await inserirAgendamentoDaSessaoDePacote(admin, linha, 'sessao-1')).toEqual({ error: 'Erro ao criar agendamento: outro erro' })
  })

  it('o núcleo do agendamento grava a sessão de pacote pela função (e não insere avulso para ligar depois)', () => {
    const core = readFileSync(path.resolve(__dirname, '../lib/appointments/core.ts'), 'utf8')
    const i = core.indexOf('export async function createAppointmentCore(')
    const corpo = core.slice(i, core.indexOf('\nexport ', i + 10))
    expect(corpo).toMatch(/input\.credito\?\.tipo === 'PACOTE'[\s\S]*?inserirAgendamentoDaSessaoDePacote\(admin, linha, input\.credito\.id\)/)
    // O pacote não passa pelo ligarCredito depois do insert.
    expect(corpo).toMatch(/input\.credito && input\.credito\.tipo !== 'PACOTE' && !\(await ligarCredito\(/)
  })
})
