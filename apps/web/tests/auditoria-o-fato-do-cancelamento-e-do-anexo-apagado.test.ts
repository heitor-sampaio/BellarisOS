import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'

/**
 * A5, A10 e A20 da 35ª simulação (princípio 3; AD-08, "a gravação se lê pelo
 * FATO"; decisão do Claude, 27/11):
 * - A5: o cancelamento do plano saía "Cancelou o agendamento … (Plano
 *   cancelado)", com o plano e os R$ 860 em crédito só dentro de "Ver as 5
 *   mudanças". O fato é o plano cancelado, com o motivo (lido agora, como o do
 *   agendamento) e o que voltou.
 * - A10: "Cancelou o pacote…" sem o motivo e sem o usado lançado de novo; e
 *   cancelar a sessão do pré-pago saía "Estornou um pagamento".
 * - A20: o anexo apagado saía "Editou o documento da cliente"; e uma gravação
 *   das 21:37 aparecia abaixo das de 21:34 (a geração do documento juntada à
 *   gravação que o criou dava a hora dela à linha). A ordem é pela hora.
 */
const sp = (s: string | undefined) => (s ?? '').replace(/[  ]/g, ' ')
let id = 8000
const r = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
  id: id--, criado_em: '2026-11-26T21:34:00.000Z', branch_id: 'bA', client_id: 'cA', tabela: 'appointments', operacao: 'editou',
  registro_id: null, colunas: [], antes: {}, depois: {}, ator_user_id: 'u1', ator_nome: 'Adalgisa', ator_tipo: 'membro',
  incompleto: false, ...x,
})
const nomes: NomesDaAuditoria = {
  clientes: { cA: 'Amélia Souza' }, membros: {}, unidades: { bA: 'Centro', bB: 'Bairro' },
  pacotesDaCliente: { cp1: '5 peelings' },
  motivosDaVendaCancelada: { tp1: 'Mudou de cidade', cp1: 'Desistiu', su1: 'Não pôde vir' },
  sessoesDoPrePago: { su1: 'a sessão 2 do pré-pago de Limpeza de pele' },
  motivosDoCancelamento: { ag1: 'Plano cancelado: Mudou de cidade' },
  categoriasDosAnexos: { an1: 'laudo' },
}

const agCancelado = () => r({ registro_id: 'ag1', colunas: ['status', 'cancelled_at', 'cancellation_reason'], antes: { status: 'SCHEDULED' }, depois: { status: 'CANCELLED' } })
const planoCancelado = () => r({
  tabela: 'treatment_plans', registro_id: 'tp1', branch_id: 'bB',
  colunas: ['status', 'updated_at', 'cancelado_em', 'cancelado_por', 'cancelamento_motivo', 'valor_cancelado', 'cancelamento'],
  antes: { name: 'Rejuvenescimento', status: 'ACCEPTED' }, depois: { name: 'Rejuvenescimento', status: 'CANCELLED' },
})
const credito = (valor: number) => r({ tabela: 'internal_credits', operacao: 'criou', depois: { amount: valor } })
const estorno = (valor: number) => r({ tabela: 'financial_transactions', operacao: 'criou', depois: { category: 'Estorno', amount: valor, type: 'EXPENSE', paid_at: '2026-11-26T21:34:00Z' } })
const pacoteCancelado = () => r({ tabela: 'client_packages', registro_id: 'cp1', colunas: ['cancelado_em', 'cancelado_por', 'cancelamento_motivo', 'valor_cancelado', 'cancelamento'] })

describe('A5: o cancelamento do plano é o fato da gravação', () => {
  it('com o crédito interno: o plano, o motivo e o crédito na linha, e a unidade do plano', async () => {
    const { gruposDaAuditoria } = await import('@/lib/auditoria/frase')
    const [g] = gruposDaAuditoria([agCancelado(), credito(860), planoCancelado(), agCancelado()], nomes, '/admin/auditoria', null)
    expect(sp(g?.oQue)).toBe('Cancelou o plano Rejuvenescimento (motivo: Mudou de cidade) e devolveu R$ 860,00 em crédito interno — Amélia Souza')
    expect(g?.unidade).toBe('Bairro')
  })
  it('com o estorno', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    expect(sp(fraseDoGrupo([estorno(300), planoCancelado()], nomes)))
      .toBe('Cancelou o plano Rejuvenescimento (motivo: Mudou de cidade) e estornou R$ 300,00 — Amélia Souza')
  })
})

describe('A10: o pacote diz o motivo e o usado lançado de novo; a sessão do pré-pago é o fato', () => {
  it('o pacote com o motivo, o estorno e o usado lançado de novo', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const usado = r({ tabela: 'financial_transactions', operacao: 'criou', registro_id: 'ftN',
      depois: { type: 'INCOME', category: 'Pacote', amount: 100, payment_method: 'PIX', paid_at: '2026-11-26T21:34:00Z', is_paid: true } })
    expect(sp(fraseDoGrupo([usado, estorno(400), pacoteCancelado()], nomes)))
      .toBe('Cancelou o pacote 5 peelings (motivo: Desistiu) e estornou R$ 400,00, e lançou o usado de novo (R$ 100,00, Pix) — Amélia Souza')
  })
  it('a sessão do pré-pago cancelada não é "Estornou um pagamento"', async () => {
    const { fraseDoGrupo, fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    const sessao = r({ tabela: 'procedure_sale_units', registro_id: 'su1', colunas: ['status', 'cancelled_at', 'cancelled_by', 'cancel_reason', 'cancelamento'],
      antes: { status: 'AVAILABLE' }, depois: { status: 'CANCELLED' } })
    expect(sp(fraseDoGrupo([estorno(200), sessao], nomes)))
      .toBe('Cancelou a sessão 2 do pré-pago de Limpeza de pele (motivo: Não pôde vir) e estornou R$ 200,00 — Amélia Souza')
    expect(sp(fraseDaAuditoria(sessao, nomes))).toBe('Cancelou a sessão 2 do pré-pago de Limpeza de pele (motivo: Não pôde vir) — Amélia Souza')
  })
})

describe('A20: o anexo apagado e a ordem pela hora', () => {
  it('apagar o anexo clínico é "Apagou", com a categoria', async () => {
    const { fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    const apagado = r({ tabela: 'client_documents', registro_id: 'an1', colunas: ['apagado_em', 'apagado_por', 'apagado_por_nome'] })
    expect(sp(fraseDaAuditoria(apagado, nomes))).toBe('Apagou um anexo clínico (laudo) — Amélia Souza')
  })
  it('a gravação com a geração juntada leva a hora dela, e as gravações vão pela hora', async () => {
    const { gruposDaAuditoria } = await import('@/lib/auditoria/frase')
    const as34 = '2026-11-26T21:34:00.000Z', as37 = '2026-11-26T21:37:00.000Z', as36 = '2026-11-26T21:36:00.000Z'
    // A ordem de leitura (o id, da maior para a menor): a geração das 21:37, outra gravação das 21:36, e o documento criado às 21:34.
    const geracao = r({ id: 3, criado_em: as37, tabela: 'issued_documents', registro_id: 'd9', colunas: ['rendered_at', 'content_hash'], depois: { title: 'Termo' } })
    const outra = r({ id: 2, criado_em: as36, tabela: 'clients', registro_id: 'cA', branch_id: null, colunas: ['phone'] })
    const criado = r({ id: 1, criado_em: as34, tabela: 'issued_documents', operacao: 'criou', registro_id: 'd9', depois: { title: 'Termo' } })
    const grupos = gruposDaAuditoria([geracao, outra, criado], nomes, '/admin/auditoria', null, 'America/Sao_Paulo')
    expect(grupos).toHaveLength(2)
    // A gravação do documento (com a geração dentro) é das 21:34, e fica abaixo da das 21:36.
    expect(grupos.map(g => g.quando)).toEqual([...grupos.map(g => g.quando)].sort().reverse())
    expect(grupos[1]?.detalhes.length).toBe(2)
  })
  it('a leitura busca o motivo do plano, do pacote e da sessão do pré-pago, e a categoria do anexo apagado', () => {
    const leitura = readFileSync(join(__dirname, '..', 'lib', 'auditoria', 'leitura.ts'), 'utf8')
    expect(leitura).toMatch(/motivosDaVendaCancelada/)
    expect(leitura).toMatch(/sessoesDoPrePago/)
    const anexos = readFileSync(join(__dirname, '..', 'lib', 'auditoria', 'nomes-dos-anexos-e-devolucoes.ts'), 'utf8')
    expect(anexos).toMatch(/apagado_em/)
  })
})
