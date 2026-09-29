import { describe, it, expect } from 'vitest'
import {
  configDaLinha, CONFIG_PADRAO, EntradaDaConfigDeComissao, EntradaDasTaxas, EntradaDasRegras,
  regraAplicavel, rotuloDaRegra, linhasDaComissao, precoDaSessaoDePacote,
  type RegraDeComissao, type TaxaDePagamento,
} from '@/lib/comissoes/config'

// O VALOR da comissão e a taxa da maquininha são conta do banco
// (`comissao_alvo`, `comissao_taxa_pct`) — provados em e2e/comissoes-calculo.

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

describe('taxas da maquininha — a entrada', () => {
  const taxas: TaxaDePagamento[] = [
    { metodo: 'PIX', parcelas: 1, taxa_pct: 0.99 },
    { metodo: 'CREDIT_CARD', parcelas: 1, taxa_pct: 3 },
    { metodo: 'CREDIT_CARD', parcelas: 6, taxa_pct: 8 },
  ]
  it('recusa parcelas fora do crédito, repetida e acima de 100%', () => {
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

describe('linhas de um atendimento', () => {
  const padrao: RegraDeComissao = { procedure_id: null, tipo: 'PERCENTAGE', valor: 30 }
  const excecao: RegraDeComissao = { procedure_id: 'p-botox', tipo: 'FIXED_AMOUNT', valor: 80 }

  it('sessão de plano: uma linha por procedimento, cada um com a SUA regra e o SEU preço', () => {
    expect(linhasDaComissao([
      { procedure_id: 'p-botox', preco: 900 },
      { procedure_id: 'p-limpeza', preco: 200 },
    ], [padrao, excecao], 'PLANO', 'plano-1')).toEqual([
      { procedure_id: 'p-botox', origem: 'PLANO', treatment_plan_id: 'plano-1', regra_tipo: 'FIXED_AMOUNT', regra_valor: 80, preco: 900 },
      { procedure_id: 'p-limpeza', origem: 'PLANO', treatment_plan_id: 'plano-1', regra_tipo: 'PERCENTAGE', regra_valor: 30, preco: 200 },
    ])
  })
  it('procedimento sem regra não gera linha', () => {
    expect(linhasDaComissao([{ procedure_id: 'p-limpeza', preco: 200 }], [excecao], 'AVULSO', null)).toEqual([])
  })
  it('avulso e pacote não levam o plano', () => {
    const [l] = linhasDaComissao([{ procedure_id: 'p', preco: 99.999 }], [padrao], 'PACOTE', 'plano-x')
    expect(l).toMatchObject({ origem: 'PACOTE', treatment_plan_id: null, preco: 100 })
  })
  it('sessão de pacote: preço ÷ sessões, em centavos', () => {
    expect(precoDaSessaoDePacote(400, 5)).toBe(80)
    expect(precoDaSessaoDePacote(1000, 3)).toBe(333.33)
    expect(precoDaSessaoDePacote(400, 0)).toBe(0)
  })
})
