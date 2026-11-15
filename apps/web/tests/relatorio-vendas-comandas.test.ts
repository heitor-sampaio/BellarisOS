import { describe, it, expect } from 'vitest'
import {
  TIPOS_DE_VENDA, ROTULO_DO_TIPO, FORA_DO_TOTAL, CABECALHO_DO_CSV_DE_VENDAS, colunasDoCsvDeVendas, comandaDaVenda,
  type Venda,
} from '@/lib/metrics/vendas-comum'

/**
 * RL1 (a revisão do Heitor, 2026-11-13: "rl1 ok"): a aba Vendas lista as
 * COMANDAS do PDV — cada venda, do que for (atendimento avulso, pacote, plano,
 * produto, crédito), com o filtro por tipo e o CSV junto. O número vem de
 * `lib/metrics/` (metrics_vendas).
 */
describe('RL1: a aba Vendas é a das comandas do PDV', () => {
  it('os tipos: atendimento avulso, pacote, pré-pago, plano, produto e crédito', () => {
    expect([...TIPOS_DE_VENDA]).toEqual(['PROCEDIMENTO', 'PACOTE', 'PRE_PAGO', 'PLANO', 'PRODUTO', 'CREDITO'])
    expect(ROTULO_DO_TIPO.PROCEDIMENTO).toBe('Atendimento avulso')
    expect(ROTULO_DO_TIPO.CREDITO).toBe('Crédito interno')
  })

  it('o crédito aparece na lista e fica FORA do Total vendido (o que se paga com ele é a venda — senão o mesmo dinheiro seria duas)', () => {
    expect([...FORA_DO_TOTAL]).toEqual(['CREDITO'])
  })

  it('cada linha diz a comanda dela; a venda de antes do PDV não tem', () => {
    expect(comandaDaVenda({ comanda: 12 })).toBe('Nº 12')
    expect(comandaDaVenda({ comanda: null })).toBe('—')
  })

  it('o CSV leva a comanda', () => {
    expect(CABECALHO_DO_CSV_DE_VENDAS).toBe('Data;Comanda;Tipo;Descrição;Cliente;Profissional;Unidade;Valor')
    const v: Venda = {
      id: 'x', tipo: 'CREDITO', data: '2026-11-14T15:00:00Z', descricao: 'Crédito interno', quantidade: 1,
      clienteId: null, cliente: 'Ana', profissional: null, branchId: 'b', valor: 300, comanda: 7,
    }
    expect(colunasDoCsvDeVendas(v, { fuso: 'America/Sao_Paulo', unidade: 'Centro' }))
      .toEqual(['14/11/2026', '7', 'Crédito interno', 'Crédito interno', 'Ana', '', 'Centro', '300,00'])
  })
})
