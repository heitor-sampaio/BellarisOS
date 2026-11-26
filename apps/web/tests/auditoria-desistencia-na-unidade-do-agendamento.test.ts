import { describe, it, expect } from 'vitest'
import type { NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'

/**
 * plataforma:AD-13 ("o início e a conclusão do atendimento (na unidade do
 * agendamento)") e AD-25 ("O registro clínico sem unidade própria … leva a
 * unidade da gravação"). A desistência no meio (`desistir_do_atendimento`)
 * grava, numa transação: a comanda, o agendamento cancelado, o prontuário e a
 * evolução com a intercorrência (sem unidade), o lote e o movimento do
 * insumo. A frase era a do agendamento ("Cancelou o agendamento…"), mas a
 * linha dava a unidade pelo primeiro registro com cliente — a evolução, sem
 * unidade —, e a coluna dizia "Da rede". A ordem é a da leitura (id
 * decrescente), como a produção a guardou.
 */
let id = 9900
const r = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
  id: id--, criado_em: '2026-11-26T15:12:06.693Z', branch_id: null, client_id: null, tabela: 'appointments', operacao: 'editou',
  registro_id: null, colunas: [], antes: {}, depois: {}, ator_user_id: 'u1', ator_nome: 'Valquíria', ator_tipo: 'membro',
  incompleto: false, ...x,
})
const nomes: NomesDaAuditoria = {
  clientes: { cA: 'Ana' }, membros: {}, unidades: { bT: 'Gloxínia Tabatinga' },
}
const desistencia = () => [
  r({ tabela: 'stock_movements', operacao: 'criou', branch_id: 'bT', registro_id: 'sm1', depois: { type: 'PROCEDURE_USAGE', quantity: -2 } }),
  r({ tabela: 'product_batches', operacao: 'editou', branch_id: 'bT', registro_id: 'lt1', colunas: ['quantity'] }),
  r({ tabela: 'medical_record_entries', operacao: 'criou', client_id: 'cA', registro_id: 'ev1' }),
  r({ tabela: 'medical_records', operacao: 'criou', client_id: 'cA', registro_id: 'mr1' }),
  r({ tabela: 'appointments', operacao: 'editou', branch_id: 'bT', client_id: 'cA', registro_id: 'ag1',
    colunas: ['cancellation_reason', 'cancelled_at', 'status'], antes: { status: 'IN_PROGRESS' }, depois: { status: 'CANCELLED' } }),
  r({ tabela: 'comandas', operacao: 'editou', branch_id: 'bT', client_id: 'cA', registro_id: 'co1', colunas: ['cancelada_em', 'cancelada_motivo'] }),
]

describe('a desistência no meio do atendimento sai na unidade do agendamento', () => {
  it('a linha da gravação: a unidade do agendamento, não "Da rede"', async () => {
    const { gruposDaAuditoria } = await import('@/lib/auditoria/frase')
    const [g] = gruposDaAuditoria(desistencia(), nomes, '/admin/auditoria', null)
    expect(g!.oQue).toMatch(/^Cancelou o agendamento/)
    expect(g!.unidade).toBe('Gloxínia Tabatinga')
  })

  it('a evolução e o prontuário gravados junto levam a unidade da gravação no detalhe', async () => {
    const { gruposDaAuditoria } = await import('@/lib/auditoria/frase')
    const [g] = gruposDaAuditoria(desistencia(), nomes, '/admin/auditoria', null)
    expect(g!.detalhes.every(d => d.unidade === 'Gloxínia Tabatinga')).toBe(true)
  })

  it('e o filtro pela unidade a acha', async () => {
    const { gravacoesDaUnidade } = await import('@/lib/auditoria/frase')
    expect(gravacoesDaUnidade(desistencia(), nomes, 'bT')).toHaveLength(6)
  })
})
