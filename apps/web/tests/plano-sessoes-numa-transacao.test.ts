import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { planoFechado, RECUSA_DO_PLANO_FECHADO } from '@/lib/plano-de-tratamento/fechado'

/**
 * A20d da 25ª simulação (CLAUDE.md §14: "Escrever no banco fora de transação
 * quando duas gravações precisam valer juntas (padrão: o app calcula, uma
 * função grava)").
 *
 * `gravarSessoes` apagava as sessões do plano e inseria as novas, uma a uma, em
 * chamadas separadas: a segunda que falhasse deixava o plano sem sessões (ou
 * com metade delas). Agora o app confere e monta, e `plano_gravar_sessoes`
 * apaga e insere numa transação só.
 */
const WEB = join(__dirname, '..')
const MIGRATION = join(WEB, '../../supabase/migrations/20261124950001_plano_gravar_sessoes_numa_transacao.sql')

function corpoDe(nome: string): string {
  const src = readFileSync(join(WEB, 'actions/treatment-plans.ts'), 'utf8').replace(/\r\n/g, '\n')
  const ini = src.indexOf(`async function ${nome}(`)
  expect(ini, `${nome} existe`).toBeGreaterThan(-1)
  const fim = src.indexOf('\n}\n', ini)
  return src.slice(ini, fim)
}
const corpoDeGravarSessoes = () => corpoDe('gravarSessoes')
const lerMigration = () => readFileSync(MIGRATION, 'utf8').replace(/\r\n/g, '\n')

describe('A20d: as sessões do plano se gravam numa transação só', () => {
  it('gravarSessoes não apaga nem insere sessões direto: chama a função do banco', () => {
    const corpo = corpoDeGravarSessoes()
    expect(corpo).not.toMatch(/\.from\('treatment_plan_sessions'\)/)
    expect(corpo).not.toMatch(/\.from\('treatment_plan_session_procedures'\)/)
    expect(corpo).toMatch(/\.rpc\('plano_gravar_sessoes'/)
  })

  it('as travas de sempre vêm antes da gravação', () => {
    const corpo = corpoDeGravarSessoes()
    const rpc = corpo.indexOf(".rpc('plano_gravar_sessoes'")
    expect(corpo.indexOf('recusaDaSessaoVazia(')).toBeLessThan(rpc)
    expect(corpo.indexOf('recusaDosProcedimentosDoPlano(')).toBeLessThan(rpc)
  })

  it('a migration cria a função fechada ao servidor, conferindo a rede e o status', () => {
    expect(existsSync(MIGRATION), 'a migration existe').toBe(true)
    const sql = lerMigration()
    expect(sql).toMatch(/create or replace function public\.plano_gravar_sessoes\(p_tenant uuid, p_plano uuid, p_sessoes jsonb, p_cabecalho jsonb\)/)
    expect(sql).toMatch(/security definer/)
    expect(sql).toMatch(/set search_path = ''/)
    expect(sql).toMatch(/revoke all on function public\.plano_gravar_sessoes\(uuid, uuid, jsonb, jsonb\) from public, anon, authenticated;/)
    expect(sql).toMatch(/grant execute on function public\.plano_gravar_sessoes\(uuid, uuid, jsonb, jsonb\) to service_role;/)
    // A rede do plano (pela unidade) e o plano fechado.
    expect(sql).toMatch(/is distinct from p_tenant/)
    expect(sql).toMatch(/'ACCEPTED', 'COMPLETED', 'CANCELLED', 'REJECTED'/)
    expect(sql).toMatch(/delete from public\.treatment_plan_sessions/)
    expect(sql).toMatch(/insert into public\.treatment_plan_session_procedures/)
    expect(sql.trimEnd()).toMatch(/notify pgrst, 'reload schema';$/)
  })
})

/**
 * O cabeçalho do plano, na mesma leva: o rascunho da avaliação (`saveTreatmentPlan`)
 * fazia o upsert em `treatment_plans` com `status: 'DRAFT'` SEM conferir o status —
 * o plano aceito, concluído ou cancelado voltava a rascunho (vendas-financeiro.md: "O
 * plano cancelado é um retrato, só de leitura"); e o editor (`salvarPlanoDoCliente`)
 * gravava as observações e o desconto antes das sessões, em outra chamada (§14).
 */
describe('A20d: o cabeçalho do plano vai junto, e o plano fechado não volta a rascunho', () => {
  it('fechado é o aceito, o concluído, o cancelado e o recusado', () => {
    for (const st of ['ACCEPTED', 'COMPLETED', 'CANCELLED', 'REJECTED']) expect(planoFechado(st)).toBe(true)
    for (const st of ['DRAFT', 'PROPOSED', null, undefined]) expect(planoFechado(st)).toBe(false)
    expect(RECUSA_DO_PLANO_FECHADO).toBe('Este plano já foi fechado e não pode mais ser alterado.')
  })

  for (const nome of ['saveTreatmentPlanInterno', 'salvarPlanoDoClienteInterno']) {
    it(`${nome}: nenhum upsert/update de treatment_plans fora da função`, () => {
      const corpo = corpoDe(nome)
      expect(corpo).not.toMatch(/\.from\('treatment_plans'\)\s*\.(upsert|update|insert)\(/)
      expect(corpo).toMatch(/await gravarSessoes\(/)
    })
    it(`${nome}: recusa o plano fechado antes de gravar`, () => {
      const corpo = corpoDe(nome)
      const recusa = corpo.indexOf('planoFechado(')
      expect(recusa).toBeGreaterThan(-1)
      expect(recusa).toBeLessThan(corpo.indexOf('await gravarSessoes('))
    })
  }

  it('gravarSessoes leva o cabeçalho à função', () => {
    expect(corpoDeGravarSessoes()).toMatch(/p_cabecalho:/)
  })

  it('a função grava o cabeçalho com o plano travado, e confere o status lá dentro', () => {
    const sql = lerMigration()
    expect(sql).toMatch(/for update/)
    expect(sql).toMatch(/insert into public\.treatment_plans/)
    expect(sql).toMatch(/update public\.treatment_plans/)
    expect(sql).toMatch(/p_cabecalho \? 'notas'/)
    expect(sql).toMatch(/p_cabecalho \? 'combinado'/)
  })
})
