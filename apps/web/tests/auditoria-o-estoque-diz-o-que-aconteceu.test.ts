import { describe, it, expect } from 'vitest'
import type { NomesDaAuditoria, RegistroDaAuditoria } from '@/lib/auditoria/tipos'

/**
 * D9 da 31ª simulação (plataforma.md, Auditoria; princípio 3): a Auditoria do
 * estoque não dizia o que aconteceu. A transferência, a perda e o inventário
 * saíam "Editou o lote (quantidade)" (o lote gravado junto vinha primeiro), e o
 * produto novo com estoque inicial era só "Deu entrada", na unidade "Da rede".
 * As migrations 20261209600001/2 (o agente do estoque) fazem a transferência
 * gravar o custo nas duas pernas e o gatilho guardar o motivo da perda e o
 * saldo depois do movimento.
 */

let id = 9000
const r = (x: Partial<RegistroDaAuditoria>): RegistroDaAuditoria => ({
  id: id--, criado_em: '2026-11-26T01:30:00.123Z', branch_id: null, client_id: null, tabela: 'stock_movements', operacao: 'criou',
  registro_id: `x${id}`, colunas: [], antes: {}, depois: {}, ator_user_id: 'u1', ator_nome: 'Tarsila', ator_tipo: 'membro',
  incompleto: false, ...x,
})
const nomes: NomesDaAuditoria = {
  clientes: {}, membros: {}, unidades: { bB: 'Blumenau', bI: 'Itajaí' }, procedimentos: {},
  produtos: { pA: 'Alginato', pS: 'Sérum C' }, medidasDosProdutos: { pA: 'g' },
}
const lote = (x: Partial<RegistroDaAuditoria> = {}) =>
  r({ tabela: 'product_batches', operacao: 'editou', colunas: ['quantity'], antes: { quantity: 3 }, depois: { quantity: 2 }, ...x })

describe('D9: a Auditoria do estoque diz o que aconteceu', () => {
  it('(a) a transferência com o lote e o custo gravados junto é "Transferiu", não "Editou o lote"', async () => {
    const { fraseDoGrupo } = await import('@/lib/auditoria/frase')
    const saida = r({ branch_id: 'bB', registro_id: 'smO', depois: { type: 'TRANSFER_OUT', quantity: -1000, product_id: 'pA', unit_cost: 0.11 } })
    const entrada = r({ branch_id: 'bI', registro_id: 'smI', depois: { type: 'TRANSFER_IN', quantity: 1000, product_id: 'pA', unit_cost: 0.11 } })
    const linhas = [
      lote(),
      saida,
      entrada,
      // O gatilho do lote acerta o custo do movimento criado na mesma gravação: não é "Corrigiu o custo".
      r({ operacao: 'editou', registro_id: 'smI', colunas: ['unit_cost'], antes: { unit_cost: null, product_id: 'pA' }, depois: { unit_cost: 0.11, product_id: 'pA' } }),
      r({ tabela: 'product_batches', operacao: 'criou', depois: { quantity: 1 } }),
    ]
    expect(fraseDoGrupo(linhas, nomes)).toBe('Transferiu 1.000 g de Alginato de Blumenau para Itajaí')
  })

  it('(b, c) a perda com o lote gravado junto diz a perda e o motivo', async () => {
    const { fraseDoGrupo, fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    const perda = r({ branch_id: 'bB', depois: { type: 'LOSS', quantity: -2, product_id: 'pS', motivo_da_perda: 'Vencido', balance_after: 4 } })
    expect(fraseDoGrupo([lote(), perda], nomes)).toBe('Registrou a perda de 2 Sérum C (Vencido)')
    // A chave da lista de antes se lê pelo rótulo; sem motivo, como antes.
    expect(fraseDaAuditoria(r({ depois: { type: 'LOSS', quantity: -1, product_id: 'pS', motivo_da_perda: 'QUEBROU' } }), nomes))
      .toBe('Registrou a perda de 1 Sérum C (Quebrou)')
    expect(fraseDaAuditoria(r({ depois: { type: 'LOSS', quantity: -1, product_id: 'pS' } }), nomes)).toBe('Registrou a perda de 1 Sérum C')
  })

  it('(b, c) o inventário diz de quanto para quanto', async () => {
    const { fraseDoGrupo, fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    const ajuste = r({ branch_id: 'bB', depois: { type: 'MANUAL_ADJUSTMENT', quantity: -20, product_id: 'pA', balance_after: 950, motivo_da_perda: 'INVENTARIO' } })
    expect(fraseDoGrupo([lote(), ajuste], nomes)).toBe('Ajustou o estoque de Alginato (inventário): de 970 para 950 g')
    // A gravação de antes (sem o saldo) diz o que dizia.
    expect(fraseDaAuditoria(r({ depois: { type: 'MANUAL_ADJUSTMENT', quantity: -20, product_id: 'pA' } }), nomes))
      .toBe('Ajustou o estoque: 20 g de Alginato')
    // A correção de cadastro segue dizendo o motivo.
    expect(fraseDaAuditoria(r({ depois: { type: 'MANUAL_ADJUSTMENT', quantity: 5, product_id: 'pS', correcao_de_cadastro: true, balance_after: 9 } }), nomes))
      .toBe('Ajustou o estoque (correção de cadastro): 5 Sérum C')
  })

  it('(d) o produto novo com estoque inicial diz o cadastro, o estoque e a unidade — não "Da rede"', async () => {
    const { fraseDoGrupo, gruposDaAuditoria } = await import('@/lib/auditoria/frase')
    const linhas = [
      r({ tabela: 'products', registro_id: 'pN', depois: { name: 'Máscara de argila' } }),
      r({ branch_id: 'bI', depois: { type: 'PURCHASE', quantity: 6, product_id: 'pN', balance_after: 6 } }),
      r({ tabela: 'product_batches', operacao: 'criou', depois: { quantity: 6 } }),
    ]
    expect(fraseDoGrupo(linhas, nomes)).toBe('Cadastrou o produto Máscara de argila com o estoque inicial de 6 em Itajaí')
    const [g] = gruposDaAuditoria(linhas, nomes, '/admin/auditoria', null)
    expect(g!.unidade).toBe('Itajaí')
  })

  it('(e) a entrada com o custo do produto editado segue "Deu entrada"; a correção sozinha segue "Corrigiu o custo"', async () => {
    const { fraseDoGrupo, fraseDaAuditoria } = await import('@/lib/auditoria/frase')
    const linhas = [
      r({ tabela: 'products', operacao: 'editou', registro_id: 'pS', colunas: ['cost_price'], depois: { name: 'Sérum C' } }),
      r({ branch_id: 'bB', depois: { type: 'PURCHASE', quantity: 5, product_id: 'pS' } }),
    ]
    expect(fraseDoGrupo(linhas, nomes)).toBe('Deu entrada em 5 Sérum C')
    expect(fraseDaAuditoria(r({ operacao: 'editou', colunas: ['unit_cost'], antes: { unit_cost: 1, product_id: 'pS' }, depois: { unit_cost: 2, product_id: 'pS' } }), nomes))
      .toMatch(/^Corrigiu o custo do lote de Sérum C/)
  })
})
