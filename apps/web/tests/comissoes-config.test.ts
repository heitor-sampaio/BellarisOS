import { describe, it, expect } from 'vitest'
import {
  configDaLinha, CONFIG_PADRAO, EntradaDaConfigDeComissao, EntradaDasTaxas, EntradaDasRegras,
  taxaDoRecebimento, regraAplicavel, valorDaRegra, rotuloDaRegra,
  type RegraDeComissao, type TaxaDePagamento,
} from '@/lib/comissoes/config'

describe('configDaLinha', () => {
  it('rede que nunca salvou fica com os padrões', () => {
    expect(configDaLinha(null)).toEqual(CONFIG_PADRAO)
    expect(configDaLinha({})).toEqual(CONFIG_PADRAO)
  })
  it('valor desconhecido no banco não vira modo inventado', () => {
    expect(configDaLinha({ modo: 'OUTRO', periodo: 'ANUAL', base_com_pontos: 'X' })).toEqual(CONFIG_PADRAO)
  })
  it('lê o que foi salvo', () => {
    expect(configDaLinha({ modo: 'PAGAMENTO', desconta_insumos: true, desconta_taxa: true, base_com_pontos: 'VALOR_PAGO', periodo: 'SEMANAL' }))
      .toEqual({ modo: 'PAGAMENTO', desconta_insumos: true, desconta_taxa: true, base_com_pontos: 'VALOR_PAGO', periodo: 'SEMANAL' })
  })
  it('a entrada recusa campo faltando', () => {
    expect(EntradaDaConfigDeComissao.safeParse({ modo: 'ATENDIMENTO' }).success).toBe(false)
    expect(EntradaDaConfigDeComissao.safeParse(CONFIG_PADRAO).success).toBe(true)
  })
})

describe('taxas da maquininha', () => {
  const taxas: TaxaDePagamento[] = [
    { metodo: 'PIX', parcelas: 1, taxa_pct: 0.99 },
    { metodo: 'DEBIT_CARD', parcelas: 1, taxa_pct: 1.5 },
    { metodo: 'CREDIT_CARD', parcelas: 1, taxa_pct: 3 },
    { metodo: 'CREDIT_CARD', parcelas: 3, taxa_pct: 5 },
    { metodo: 'CREDIT_CARD', parcelas: 6, taxa_pct: 8 },
  ]
  it('usa a do meio', () => {
    expect(taxaDoRecebimento(taxas, 'PIX')).toBe(0.99)
    expect(taxaDoRecebimento(taxas, 'DEBIT_CARD')).toBe(1.5)
  })
  it('dinheiro e crédito interno não têm taxa', () => {
    expect(taxaDoRecebimento(taxas, 'CASH')).toBe(0)
    expect(taxaDoRecebimento(taxas, 'INTERNAL_CREDIT')).toBe(0)
    expect(taxaDoRecebimento(taxas, null)).toBe(0)
  })
  it('crédito sem a taxa exata usa a da maior parcela abaixo', () => {
    expect(taxaDoRecebimento(taxas, 'CREDIT_CARD', 1)).toBe(3)
    expect(taxaDoRecebimento(taxas, 'CREDIT_CARD', 2)).toBe(3)
    expect(taxaDoRecebimento(taxas, 'CREDIT_CARD', 3)).toBe(5)
    expect(taxaDoRecebimento(taxas, 'CREDIT_CARD', 5)).toBe(5)
    expect(taxaDoRecebimento(taxas, 'CREDIT_CARD', 12)).toBe(8)
  })
  it('crédito só com taxa parcelada acima: nada abaixo, zero', () => {
    expect(taxaDoRecebimento([{ metodo: 'CREDIT_CARD', parcelas: 3, taxa_pct: 5 }], 'CREDIT_CARD', 2)).toBe(0)
  })
  it('a entrada recusa parcelas fora do crédito, repetida e acima de 100%', () => {
    expect(EntradaDasTaxas.safeParse([{ metodo: 'PIX', parcelas: 2, taxa_pct: 1 }]).success).toBe(false)
    expect(EntradaDasTaxas.safeParse([{ metodo: 'PIX', parcelas: 1, taxa_pct: 1 }, { metodo: 'PIX', parcelas: 1, taxa_pct: 2 }]).success).toBe(false)
    expect(EntradaDasTaxas.safeParse([{ metodo: 'DEBIT_CARD', parcelas: 1, taxa_pct: 101 }]).success).toBe(false)
    expect(EntradaDasTaxas.safeParse(taxas).success).toBe(true)
  })
  it('a tabela cheia cabe (Pix, débito e crédito de 1 a 12)', () => {
    const cheia = [
      { metodo: 'PIX', parcelas: 1, taxa_pct: 1 }, { metodo: 'DEBIT_CARD', parcelas: 1, taxa_pct: 1 },
      ...Array.from({ length: 12 }, (_, i) => ({ metodo: 'CREDIT_CARD', parcelas: i + 1, taxa_pct: 2 + i / 2 })),
    ]
    expect(EntradaDasTaxas.safeParse(cheia).success).toBe(true)
  })
})

describe('regras por profissional', () => {
  const padrao: RegraDeComissao = { procedure_id: null, tipo: 'PERCENTAGE', valor: 30 }
  const excecao: RegraDeComissao = { procedure_id: 'p-botox', tipo: 'FIXED_AMOUNT', valor: 80 }

  it('a exceção do procedimento vence o padrão', () => {
    expect(regraAplicavel([padrao, excecao], 'p-botox')).toBe(excecao)
  })
  it('procedimento sem exceção cai no padrão', () => {
    expect(regraAplicavel([padrao, excecao], 'p-limpeza')).toBe(padrao)
    expect(regraAplicavel([padrao, excecao], null)).toBe(padrao)
  })
  it('sem padrão e sem exceção: nenhuma regra (não gera comissão)', () => {
    expect(regraAplicavel([excecao], 'p-limpeza')).toBeNull()
    expect(regraAplicavel([], 'p-botox')).toBeNull()
  })
  it('valor em centavos exatos', () => {
    expect(valorDaRegra({ tipo: 'PERCENTAGE', valor: 30 }, 250)).toBe(75)
    expect(valorDaRegra({ tipo: 'PERCENTAGE', valor: 12.5 }, 99.9)).toBe(12.49)
    expect(valorDaRegra({ tipo: 'FIXED_AMOUNT', valor: 80 }, 1000)).toBe(80)
  })
  it('rótulo', () => {
    expect(rotuloDaRegra(null)).toBe('Sem comissão')
    expect(rotuloDaRegra({ tipo: 'PERCENTAGE', valor: 12.5 })).toBe('12,5%')
    expect(rotuloDaRegra({ tipo: 'FIXED_AMOUNT', valor: 80 })).toBe('R$ 80,00 fixo')
  })
  it('a entrada recusa percentual acima de 100 e exceção repetida', () => {
    const uuid = '00000000-0000-4000-8000-000000000001'
    expect(EntradaDasRegras.safeParse({ padrao: { tipo: 'PERCENTAGE', valor: 120 }, excecoes: [] }).success).toBe(false)
    expect(EntradaDasRegras.safeParse({ padrao: null, excecoes: [
      { procedure_id: uuid, tipo: 'PERCENTAGE', valor: 10 }, { procedure_id: uuid, tipo: 'FIXED_AMOUNT', valor: 10 },
    ] }).success).toBe(false)
    expect(EntradaDasRegras.safeParse({ padrao: { tipo: 'FIXED_AMOUNT', valor: 150 }, excecoes: [
      { procedure_id: uuid, tipo: 'PERCENTAGE', valor: 40 },
    ] }).success).toBe(true)
  })
})
