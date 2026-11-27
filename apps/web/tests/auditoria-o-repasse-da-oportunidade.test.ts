import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'

/**
 * A5 da 36ª simulação (AD-13, a frase diz o fato; por analogia com AD-15,
 * "Repassou o agendamento de X a Fulano" — decisão do Claude, 27/11): o
 * repasse da oportunidade (ao desativar, ou a troca do responsável no CRM)
 * saía "Editou a oportunidade X (responsável)", sem dizer para quem. O gatilho
 * de `leads` não guardava o responsável (os valores eram `status,stage_id,
 * funnel_id`); passa a guardar o `owner_id` (só o id; o nome se lê agora). A
 * gravação de antes, sem o valor, segue como estava.
 */
let id = 9500
const r = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
  id: id--, criado_em: '2026-11-27T02:08:32.671Z', branch_id: null, client_id: null, tabela: 'leads', operacao: 'editou',
  registro_id: 'l1', colunas: ['owner_id'], antes: {}, depois: {}, ator_user_id: 'u1', ator_nome: 'Dona', ator_tipo: 'membro',
  incompleto: false, ...x,
})
const nomes: NomesDaAuditoria = {
  clientes: {}, membros: { m1: 'Rosimeire', m2: 'Edvaldo' }, unidades: {}, oportunidades: { l1: 'Camila Duarte' },
}

describe('o repasse da oportunidade diz para quem', () => {
  it('"Repassou a oportunidade de Camila Duarte a Rosimeire"', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    expect(fraseDaAuditoria(r({ antes: { owner_id: 'm2' }, depois: { owner_id: 'm1' } }), nomes))
      .toBe('Repassou a oportunidade de Camila Duarte a Rosimeire')
  })

  it('sem responsável: "Deixou a oportunidade de Camila Duarte sem responsável"', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    expect(fraseDaAuditoria(r({ antes: { owner_id: 'm2' }, depois: { owner_id: null } }), nomes))
      .toBe('Deixou a oportunidade de Camila Duarte sem responsável')
  })

  it('sozinha na gravação (o repasse de cada oportunidade é uma gravação), a mesma frase', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(fraseDoGrupo([r({ antes: { owner_id: 'm2' }, depois: { owner_id: 'm1' } })], nomes))
      .toBe('Repassou a oportunidade de Camila Duarte a Rosimeire')
  })

  it('a gravação de antes do gatilho guardar o responsável segue como estava', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    expect(fraseDaAuditoria(r({}), nomes)).toBe('Editou a oportunidade Camila Duarte (responsável)')
  })

  it('a leitura busca o nome de quem recebeu', () => {
    const fonte = readFileSync(path.join(__dirname, '..', 'lib/auditoria/leitura.ts'), 'utf8')
    expect(fonte).toMatch(/r\.tabela === 'leads'\)\.map\(r => doRegistro\(r, 'owner_id'\)\)/)
  })

  // E a etapa: a coluna é `crm_stage_id` (`stage_id` e `funnel_id` não existem em `leads`), e sem ela o
  // "de A para B" da AD-21 nunca saía — a frase já lê `crm_stage_id` (`lib/auditoria/frase.ts`).
  it('o gatilho de leads passa a guardar o responsável e a etapa (a migration da faixa R)', () => {
    const pasta = path.join(__dirname, '..', '..', '..', 'supabase', 'migrations')
    const arquivo = readdirSync(pasta).find(f => /^2026121540\d{4}_auditoria_o_responsavel_da_oportunidade\.sql$/.test(f))
    expect(arquivo, 'a migration da faixa R').toBeTruthy()
    const sql = readFileSync(path.join(pasta, arquivo!), 'utf8')
    for (const op of ['ins', 'upd', 'del']) {
      expect(sql).toMatch(new RegExp(`create trigger auditoria_${op}[\\s\\S]*?on public\\.leads[\\s\\S]*?private\\.auditar\\('normal', '', 'status,crm_stage_id,owner_id', '', ''\\)`))
    }
    expect(sql.trimEnd()).toMatch(/notify pgrst, 'reload schema';$/)
  })
})
