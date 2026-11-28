import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'

/**
 * A9 da 31ª simulação (princípio 3; plataforma:AD-13, "uma gravação, uma frase
 * do fato"): a Auditoria dizia "Criou a regra de comissão" sete vezes, sem o
 * procedimento, de quem e o valor. O gatilho passa a guardar o procedimento e
 * a pessoa (ids; o nome se lê agora), e a frase diz o valor — que já estava
 * gravado (`type`, `value`), então a gravação de antes também o diz.
 */

const sp = (s: string) => s.replace(/[  ]/g, ' ')
const MIGRATIONS = path.resolve(__dirname, '..', '..', '..', 'supabase', 'migrations')
let id = 7000
const regra = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
  id: id--, criado_em: '2026-11-25T14:00:00.123Z', branch_id: null, client_id: null, tabela: 'commission_rules', operacao: 'criou',
  registro_id: `cr${id}`, colunas: [], antes: {}, depois: {}, ator_user_id: 'u1', ator_nome: 'Marlene', ator_tipo: 'membro',
  incompleto: false, ...x,
})
const nomes: NomesDaAuditoria = {
  clientes: {}, membros: { pM: 'Marcela', pT: 'Tamires' }, unidades: {},
  procedimentos: { prL: 'Limpeza de pele', prD: 'Drenagem' },
}

describe('A9: a regra de comissão diz de quê, de quem e quanto', () => {
  it('a do procedimento, a mesma para todos', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(sp(fraseDoGrupo([regra({ depois: { procedure_id: 'prL', professional_id: null, type: 'PERCENTAGE', value: 30, is_active: true } })], nomes)))
      .toBe('Criou a comissão de Limpeza de pele, a mesma para todos (30%)')
  })
  it('a da pessoa no procedimento, em valor fixo', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(sp(fraseDoGrupo([regra({ depois: { procedure_id: 'prL', professional_id: 'pM', type: 'FIXED_AMOUNT', value: 50 } })], nomes)))
      .toBe('Criou a comissão de Limpeza de pele para Marcela (R$ 50,00)')
  })
  it('o padrão da pessoa', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(sp(fraseDoGrupo([regra({ depois: { procedure_id: null, professional_id: 'pT', type: 'PERCENTAGE', value: 35 } })], nomes)))
      .toBe('Criou a comissão padrão de Tamires (35%)')
  })
  it('a gravação de antes (sem os ids) diz pelo menos o valor', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(sp(fraseDoGrupo([regra({ depois: { type: 'PERCENTAGE', value: 12.5 } })], nomes)))
      .toBe('Criou a regra de comissão (12,5%)')
  })
  it('apagar diz o que saiu', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(sp(fraseDoGrupo([regra({ operacao: 'apagou', antes: { procedure_id: 'prD', professional_id: null, type: 'PERCENTAGE', value: 20 } })], nomes)))
      .toBe('Apagou a comissão de Drenagem, a mesma para todos (20%)')
  })
  it('salvar a comissão do procedimento (apaga e grava de novo) diz o procedimento e o que ficou', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [
      regra({ operacao: 'apagou', antes: { procedure_id: 'prL', professional_id: 'pM', type: 'PERCENTAGE', value: 30 } }),
      regra({ depois: { procedure_id: 'prL', professional_id: 'pM', type: 'FIXED_AMOUNT', value: 50 } }),
      regra({ depois: { procedure_id: 'prL', professional_id: 'pT', type: 'PERCENTAGE', value: 40 } }),
    ]
    expect(sp(fraseDoGrupo(linhas, nomes)))
      // R40, o Heitor, 27/11: "Cada parte com o seu plural (a proposta)".
      .toBe('Criou 2 regras e apagou 1 regra de comissão de Limpeza de pele (Marcela: R$ 50,00; Tamires: 40%)')
  })
  it('salvar as regras da pessoa diz a pessoa e o que ficou', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const linhas = [
      regra({ depois: { procedure_id: null, professional_id: 'pT', type: 'PERCENTAGE', value: 35 } }),
      regra({ depois: { procedure_id: 'prD', professional_id: 'pT', type: 'FIXED_AMOUNT', value: 25 } }),
    ]
    expect(sp(fraseDoGrupo(linhas, nomes)))
      .toBe('Criou 2 regras de comissão de Tamires (padrão: 35%; Drenagem: R$ 25,00)')
  })
})

describe('A9: o gatilho guarda o procedimento e a pessoa, e a leitura lê os nomes', () => {
  it('a migration mais nova do gatilho de commission_rules guarda procedure_id e professional_id', () => {
    const com = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()
      .map(f => readFileSync(path.join(MIGRATIONS, f), 'utf8'))
      .filter(s => /on public\.commission_rules/.test(s) && s.includes('private.auditar('))
    const vale = com[com.length - 1] ?? ''
    for (const t of ['auditoria_ins', 'auditoria_upd', 'auditoria_del']) {
      expect(vale).toMatch(new RegExp(`create trigger ${t}[^;]*on public\\.commission_rules[^;]*'type,is_active,value,procedure_id,professional_id'`))
    }
    expect(vale.trimEnd()).toMatch(/notify pgrst, 'reload schema';$/)
  })
  it('a leitura busca o procedimento e a pessoa da regra', () => {
    const leitura = readFileSync(path.resolve(__dirname, '..', 'lib/auditoria/leitura.ts'), 'utf8')
    expect(leitura).toMatch(/r\.tabela === 'commission_rules'\)\.map\(r => doRegistro\(r, 'professional_id'\)\)/)
    expect(leitura).toMatch(/r\.tabela === 'commission_rules'\)[\s\S]{0,120}procedure_id/)
  })
})
