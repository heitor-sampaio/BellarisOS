import { describe, it, expect } from 'vitest'
import type { NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'

/**
 * D21 da 31ª simulação (documentos:DC-02; plataforma:AD-04): o "Pedir no portal"
 * marca o documento (`issued_documents.pedido_no_portal_em`, migration
 * 20261209100001), e a Auditoria diz o fato — não "Editou o documento".
 */

const linha = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
  id: 1, criado_em: '2026-11-26T14:00:00.000Z', branch_id: null, client_id: 'c1', tabela: 'issued_documents', operacao: 'editou',
  registro_id: 'd1', colunas: ['pedido_no_portal_em'], antes: {}, depois: {}, ator_user_id: 'u1', ator_nome: 'Marlene', ator_tipo: 'membro',
  incompleto: false, ...x,
})
const nomes: NomesDaAuditoria = { clientes: { c1: 'Joana Lima' }, membros: {}, unidades: {}, procedimentos: {} }

describe('D21: o pedido de assinatura no portal na Auditoria', () => {
  it('diz que pediu a assinatura no portal, e de quem', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    expect(fraseDaAuditoria(linha({}), nomes)).toMatch(/^Pediu a assinatura do documento.* no portal — Joana Lima$/)
  })
  it('a coluna tem rótulo (não conta como "outros campos")', async () => {
    const { CAMPO_DA_AUDITORIA } = await import('@/lib/auditoria/frase')
    expect(CAMPO_DA_AUDITORIA.pedido_no_portal_em).toBe('pedido no portal')
  })
})
