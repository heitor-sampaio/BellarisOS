import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'

/**
 * D12 e A30 da 32ª simulação (2026-11-26), a Auditoria (AD-15, AD-23):
 *
 * - D12: abrir Cascavel grava a unidade e, na mesma transação, o "Atende" de
 *   quem é da rede inteira e atende em todas (users, sem unidade). A frase do
 *   grupo caía no registro do membro ("Editou o membro da equipe Nadja (atende
 *   em)") e a linha ficava "Da rede": a criação da unidade sumia — e o filtro
 *   de Cascavel a escondia (a gravação é da unidade do fato). O fato é a
 *   unidade criada, e a gravação é dela.
 * - A30: o "Mudar de unidade" do agendamento dizia "Repassou o agendamento de
 *   X a Fulano (e editou: unidade, sala)", sem a unidade de origem nem a de
 *   destino. O gatilho passa a guardar a unidade (antes → depois), e a frase
 *   diz "Mudou de unidade o agendamento de X: de Chapecó para Passo Fundo".
 */
const sp = (s: string) => s.replace(/[  ]/g, ' ')
const WEB = path.resolve(__dirname, '..')
const MIGRATIONS = path.resolve(WEB, '..', '..', 'supabase', 'migrations')
let id = 7000
const r = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
  id: id--, criado_em: '2026-11-26T06:55:20.236Z', branch_id: null, client_id: null, tabela: 'users', operacao: 'editou',
  registro_id: null, colunas: [], antes: {}, depois: {}, ator_user_id: 'u1', ator_nome: 'Aparecida', ator_tipo: 'membro',
  incompleto: false, ...x,
})
const nomes: NomesDaAuditoria = {
  clientes: { cK: 'Karen Lazzari' }, membros: { mN: 'Nadja', mI: 'Ivanete' },
  unidades: { bCha: 'Ninfeia Chapecó', bPF: 'Ninfeia Passo Fundo', bCas: 'Ninfeia Cascavel' },
}

describe('D12: a unidade criada é o fato da gravação', () => {
  const criada = r({ tabela: 'branches', operacao: 'criou', branch_id: 'bCas', registro_id: 'bCas', depois: { name: 'Ninfeia Cascavel' } })
  const atende = r({ tabela: 'users', operacao: 'editou', registro_id: 'mN', colunas: ['atende_em'] })

  it('"Criou a unidade Ninfeia Cascavel", com quem passou a atender nela', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(sp(fraseDoGrupo([criada, atende], nomes))).toBe('Criou a unidade Ninfeia Cascavel (Nadja passou a atender nela)')
  })

  it('a linha é da unidade criada, e o filtro de Cascavel a traz', async () => {
    const { gruposDaAuditoria, gravacoesDaUnidade } = await import('@/lib/auditoria/frase')
    const [g] = gruposDaAuditoria([criada, atende], nomes, '/admin/auditoria', null)
    expect(g!.unidade).toBe('Ninfeia Cascavel')
    expect(gravacoesDaUnidade([criada, atende], nomes, 'bCas')).toHaveLength(2)
  })
})

describe('A30: a troca de unidade do agendamento diz de onde e para onde', () => {
  const mudou = (antes: Record<string, unknown>) => r({
    tabela: 'appointments', registro_id: 'ap1', client_id: 'cK', branch_id: 'bPF',
    colunas: ['branch_id', 'professional_id', 'room_id'],
    antes: { ...antes, professional_id: 'mN', room_id: 's1' }, depois: { branch_id: 'bPF', professional_id: 'mI', room_id: 's2' },
  })

  it('com a unidade de antes guardada: "de Chapecó para Passo Fundo, com Ivanete"', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    expect(sp(fraseDaAuditoria(mudou({ branch_id: 'bCha' }), nomes)))
      .toBe('Mudou de unidade o agendamento de Karen Lazzari: de Ninfeia Chapecó para Ninfeia Passo Fundo, com Ivanete')
  })

  it('o registro de antes do gatilho (sem a de origem): "para Passo Fundo"', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    expect(sp(fraseDaAuditoria(mudou({}), nomes)))
      .toBe('Mudou de unidade o agendamento de Karen Lazzari: para Ninfeia Passo Fundo, com Ivanete')
  })

  it('na gravação com outros registros, o fato é a troca de unidade', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const outro = r({ tabela: 'commissions', registro_id: 'k1', branch_id: 'bPF', colunas: ['branch_id'] })
    expect(sp(fraseDoGrupo([outro, mudou({ branch_id: 'bCha' })], nomes))).toMatch(/^Mudou de unidade o agendamento de Karen Lazzari/)
  })

  it('o gatilho do agendamento guarda a unidade', () => {
    const sql = readFileSync(path.join(MIGRATIONS, '20261210500002_auditoria_a_unidade_do_agendamento.sql'), 'utf8')
    for (const t of ['auditoria_ins', 'auditoria_upd', 'auditoria_del']) expect(sql).toContain(t)
    expect(sql).toContain("'status,scheduled_at,procedure_id,professional_id,room_id,price,duration_minutes,branch_id'")
    expect(sql.trimEnd()).toMatch(/notify pgrst, 'reload schema';$/)
  })
})
