import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'

/**
 * A Auditoria diz o FATO da gravação (plataforma:AD-13, AD-16 e AD-21: "uma
 * gravação, uma frase do fato"; o de → para):
 *
 * - D10: o recebimento sem linha de comissão (de quem atende sem comissão) é
 *   uma gravação de UMA linha só — o lançamento criado já pago —, e a frase
 *   caía em "Criou a receita Serviços (R$ 280,00)" em vez de "Recebeu R$ 280,00
 *   (Dinheiro)", como a de várias linhas (decisão do Claude, 25/11);
 * - A16: o bloqueio da agenda saía "Criou o bloqueio da agenda", sem o
 *   horário, o motivo e de quem (ou de qual sala);
 * - A17: a promoção a Admin da rede e a troca das unidades do membro saíam
 *   "Editou o membro da equipe X (cargo e unidade)", sem o de → para.
 */

const sp = (s: string) => s.replace(/[  ]/g, ' ')
const WEB = path.resolve(__dirname, '..')
const MIGRATIONS = path.resolve(WEB, '..', '..', 'supabase', 'migrations')
let id = 9000
const r = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
  id: id--, criado_em: '2026-11-25T14:00:00.123Z', branch_id: 'bA', client_id: null, tabela: 'financial_transactions', operacao: 'criou',
  registro_id: null, colunas: [], antes: {}, depois: {}, ator_user_id: 'u1', ator_nome: 'Marlene', ator_tipo: 'membro',
  incompleto: false, ...x,
})
const nomes: NomesDaAuditoria = {
  clientes: { cG: 'Georgina Holanda' }, membros: { pP: 'Dra. Paula', mF: 'Fabiana' }, unidades: { bA: 'Moinhos', bB: 'Batel', bC: 'Savassi' },
  fusos: { bA: 'America/Sao_Paulo' },
  salas: { s1: 'Cabine 1' },
  cargosDosMembros: { rR: { nome: 'Recepção', adminDaRede: false }, rF: { nome: 'Financeiro', adminDaRede: false }, rA: { nome: 'Admin da rede', adminDaRede: true } },
}

describe('D10: o recebimento de uma linha só é "Recebeu", como o de várias', () => {
  it('o lançamento criado já pago, sozinho na gravação: "Recebeu R$ 280,00 (Dinheiro) — Georgina"', async () => {
    const { fraseDoGrupo, gruposDaAuditoria } = await import('@/lib/auditoria/frase')
    const so = r({ client_id: 'cG', registro_id: 'f1', depois: {
      type: 'INCOME', amount: 280, is_paid: true, paid_at: '2026-11-25T14:00:00Z', category: 'Serviços', payment_method: 'CASH' } })
    expect(sp(fraseDoGrupo([so], nomes))).toBe('Recebeu R$ 280,00 (Dinheiro) — Georgina Holanda')
    // A linha da tela também (a gravação de um registro só usa a frase do grupo).
    const [g] = gruposDaAuditoria([so], nomes, '/admin/auditoria', null)
    expect(sp(g!.oQue)).toBe('Recebeu R$ 280,00 (Dinheiro) — Georgina Holanda')
  })

  it('a receita criada em aberto segue "Criou a receita", e a despesa paga segue pela descrição', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(sp(fraseDoGrupo([r({ depois: { type: 'INCOME', amount: 89, is_paid: false, category: 'Serviços' } })], nomes)))
      .toBe('Criou a receita Serviços (R$ 89,00)')
    expect(sp(fraseDoGrupo([r({ depois: { type: 'EXPENSE', amount: 480, is_paid: true, paid_at: '2026-11-25T14:00:00Z',
      category: 'Energia', description: 'Conta de energia', payment_method: 'PIX' } })], nomes)))
      .toBe('Criou a despesa Conta de energia, em Energia (R$ 480,00)')
  })
})

describe('A16: o bloqueio da agenda diz de quem, o horário e o motivo', () => {
  const bloqueio = (x: Partial<RegistroDaAuditoria>) => r({ tabela: 'agenda_bloqueios', registro_id: 'bl1', ...x })

  it('o bloqueio de quem atende, num dia', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const f = fraseDoGrupo([bloqueio({ depois: { professional_id: 'pP', inicio: '2026-11-26T17:00:00+00:00', fim: '2026-11-26T19:00:00+00:00', motivo: 'Curso' } })], nomes)
    expect(sp(f)).toBe('Bloqueou a agenda de Dra. Paula em 26/11/2026, das 14:00 às 16:00 (motivo: Curso)')
  })

  it('o bloqueio da sala, em mais de um dia', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const f = fraseDoGrupo([bloqueio({ depois: { room_id: 's1', inicio: '2026-11-26T11:00:00+00:00', fim: '2026-11-27T21:00:00+00:00', motivo: 'Reforma' } })], nomes)
    expect(sp(f)).toBe('Bloqueou a sala Cabine 1 de 26/11/2026 08:00 a 27/11/2026 18:00 (motivo: Reforma)')
  })

  it('o bloqueio tirado, e o de antes do gatilho guardar de quem', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(sp(fraseDoGrupo([bloqueio({ operacao: 'apagou', antes: { professional_id: 'pP', inicio: '2026-11-26T17:00:00+00:00', fim: '2026-11-26T19:00:00+00:00', motivo: 'Curso' } })], nomes)))
      .toBe('Tirou o bloqueio da agenda de Dra. Paula em 26/11/2026, das 14:00 às 16:00 (motivo: Curso)')
    expect(sp(fraseDoGrupo([bloqueio({ depois: { inicio: '2026-11-26T17:00:00+00:00', fim: '2026-11-26T19:00:00+00:00', motivo: 'Curso' } })], nomes)))
      .toBe('Bloqueou a agenda em 26/11/2026, das 14:00 às 16:00 (motivo: Curso)')
  })

  it('o gatilho passa a guardar de quem é o bloqueio (quem atende ou a sala)', () => {
    const sql = ultimaMigrationCom('on public.agenda_bloqueios')
    expect(sql).toMatch(/agenda_bloqueios[\s\S]*private\.auditar\('normal', '', '[^']*professional_id[^']*room_id[^']*'/)
    expect(sql.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
})

describe('A17: o cargo e as unidades do membro dizem o de → para', () => {
  const membro = (x: Partial<RegistroDaAuditoria>) => r({ tabela: 'users', operacao: 'editou', registro_id: 'mF', branch_id: null, ...x })

  it('a promoção a Admin da rede', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const f = fraseDoGrupo([membro({ colunas: ['branch_id', 'outras_unidades', 'role_id'],
      antes: { role_id: 'rR', branch_id: 'bA', outras_unidades: ['bB'] }, depois: { role_id: 'rA', branch_id: null, outras_unidades: [] } })], nomes)
    expect(sp(f)).toBe('Promoveu Fabiana a Admin da rede (cargo: Recepção → Admin da rede; unidade principal: Moinhos → a rede inteira; outras unidades: Batel → nenhuma)')
  })

  it('a troca do cargo e das unidades de quem não é Admin', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(sp(fraseDoGrupo([membro({ colunas: ['role_id'], antes: { role_id: 'rR' }, depois: { role_id: 'rF' } })], nomes)))
      .toBe('Editou o membro da equipe Fabiana (cargo: Recepção → Financeiro)')
    expect(sp(fraseDoGrupo([membro({ colunas: ['outras_unidades'], antes: { outras_unidades: [] }, depois: { outras_unidades: ['bB', 'bC'] } })], nomes)))
      .toBe('Editou o membro da equipe Fabiana (outras unidades: nenhuma → Batel e Savassi)')
    expect(sp(fraseDoGrupo([membro({ colunas: ['branch_id', 'horario'], antes: { branch_id: null }, depois: { branch_id: 'bA' } })], nomes)))
      .toBe('Editou o membro da equipe Fabiana (unidade principal: a rede inteira → Moinhos; horário de trabalho)')
  })

  it('o registro de antes do gatilho guardar as outras unidades diz só o nome', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(sp(fraseDoGrupo([membro({ colunas: ['outras_unidades'] })], nomes)))
      .toBe('Editou o membro da equipe Fabiana (outras unidades)')
  })

  it('o gatilho passa a guardar as outras unidades', () => {
    const sql = ultimaMigrationCom('on public.users')
    expect(sql).toMatch(/private\.auditar\('normal', '', 'is_active,role_id,branch_id,outras_unidades'/)
  })

  it('a leitura traz o nome do cargo, a sala e quem atende no bloqueio', () => {
    const leitura = readFileSync(path.join(WEB, 'lib', 'auditoria', 'leitura.ts'), 'utf8')
    expect(leitura).toContain('cargosDosMembros')
    expect(leitura).toContain('salas:')
    expect(leitura).toMatch(/agenda_bloqueios/)
  })
})

/** A migration mais nova que mexe no gatilho da tabela (a que vale). */
function ultimaMigrationCom(trecho: string): string {
  const com = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()
    .map(f => readFileSync(path.join(MIGRATIONS, f), 'utf8')).filter(s => s.includes(trecho) && s.includes('private.auditar('))
  return com[com.length - 1] ?? ''
}
