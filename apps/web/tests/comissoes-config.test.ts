import { describe, it, expect } from 'vitest'
import {
  configDaLinha, CONFIG_PADRAO, EntradaDaConfigDeComissao, EntradaDasTaxas, EntradaDasRegras,
  EntradaDaComissaoDoProcedimento, rotuloDaComissaoDoProcedimento,
  TAXA_DO_PROCEDIMENTO, taxaDoProcedimento, descontaTaxaDaEscolha, rotuloDaTaxaDoProcedimento,
  regraAplicavel, rotuloDaRegra, linhasDaComissao, precoDaSessaoDePacote, rotuloDaBase,
  type RegraDeComissao, type TaxaDePagamento,
} from '@/lib/comissoes/config'
import * as nodeFs from 'node:fs'
import * as nodePath from 'node:path'
import { estadoInicialDaComissao, entradaDaComissao } from '@/components/admin/comissao-do-procedimento'

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
    expect(configDaLinha({ modo: 'INTEGRAL', desconta_insumos: true, desconta_taxa: true, base_com_pontos: 'VALOR_PAGO', periodo: 'SEMANAL', produto_pct: '7.50', produto_modo: 'POR_PRODUTO', plano_pct: '5' }))
      .toEqual({ modo: 'INTEGRAL', desconta_insumos: true, desconta_taxa: true, base_com_pontos: 'VALOR_PAGO', periodo: 'SEMANAL', produto_pct: 7.5, produto_modo: 'POR_PRODUTO', plano_pct: 5 })
  })
  it('o modo é um só: o pagamento integral (H4, 2026-11-01)', () => {
    expect(CONFIG_PADRAO.modo).toBe('INTEGRAL')
    // Uma linha antiga, de antes da regra, também lê o modo que vale.
    expect(configDaLinha({ modo: 'ATENDIMENTO' }).modo).toBe('INTEGRAL')
    expect(configDaLinha({ modo: 'PAGAMENTO' }).modo).toBe('INTEGRAL')
    // A entrada não aceita mais "no atendimento" nem "proporcional ao pago".
    expect(EntradaDaConfigDeComissao.safeParse({ ...CONFIG_PADRAO, modo: 'ATENDIMENTO' }).success).toBe(false)
    expect(EntradaDaConfigDeComissao.safeParse({ ...CONFIG_PADRAO, modo: 'PAGAMENTO' }).success).toBe(false)
    const semModo: Partial<typeof CONFIG_PADRAO> = { ...CONFIG_PADRAO }
    delete semModo.modo
    expect(EntradaDaConfigDeComissao.parse(semModo).modo).toBe('INTEGRAL')
  })
  it('a entrada recusa campo faltando', () => {
    expect(EntradaDaConfigDeComissao.safeParse({ modo: 'INTEGRAL' }).success).toBe(false)
    expect(EntradaDaConfigDeComissao.safeParse(CONFIG_PADRAO).success).toBe(true)
  })
})

describe('taxas da maquininha — a entrada', () => {
  const taxas: TaxaDePagamento[] = [
    { metodo: 'PIX', parcelas: 1, taxa_pct: 0.99 },
    { metodo: 'CREDIT_CARD', parcelas: 1, taxa_pct: 3 },
    { metodo: 'CREDIT_CARD', parcelas: 6, taxa_pct: 8 },
  ]
  // F16-3 (o Heitor: 'não é pra recusar nada'): acima de 100% passa; negativa e acima do limite do registro, não.
  it('recusa parcelas fora do crédito, repetida, negativa e acima do limite do registro', () => {
    expect(EntradaDasTaxas.safeParse([{ metodo: 'PIX', parcelas: 2, taxa_pct: 1 }]).success).toBe(false)
    expect(EntradaDasTaxas.safeParse([{ metodo: 'PIX', parcelas: 1, taxa_pct: 1 }, { metodo: 'PIX', parcelas: 1, taxa_pct: 2 }]).success).toBe(false)
    expect(EntradaDasTaxas.safeParse([{ metodo: 'DEBIT_CARD', parcelas: 1, taxa_pct: 101 }]).success, 'acima de 100%, passa').toBe(true)
    expect(EntradaDasTaxas.safeParse([{ metodo: 'DEBIT_CARD', parcelas: 1, taxa_pct: -1 }]).success).toBe(false)
    expect(EntradaDasTaxas.safeParse([{ metodo: 'DEBIT_CARD', parcelas: 1, taxa_pct: 1000 }]).success).toBe(false)
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

describe('comissão do procedimento (2026-10-15): a geral, a mesma para todos', () => {
  const padrao: RegraDeComissao = { procedure_id: null, tipo: 'PERCENTAGE', valor: 30 }
  const excecao: RegraDeComissao = { procedure_id: 'p-botox', tipo: 'FIXED_AMOUNT', valor: 80 }
  const gerais = new Map([['p-botox', { tipo: 'PERCENTAGE' as const, valor: 25 }], ['p-fios', { tipo: 'FIXED_AMOUNT' as const, valor: 0 }]])

  it('a geral do procedimento vence a exceção e o padrão do profissional', () => {
    expect(regraAplicavel([padrao, excecao], 'p-botox', gerais)).toEqual({ procedure_id: 'p-botox', tipo: 'PERCENTAGE', valor: 25 })
    expect(regraAplicavel([padrao], 'p-fios', gerais)).toEqual({ procedure_id: 'p-fios', tipo: 'FIXED_AMOUNT', valor: 0 })
  })
  it('vale para quem não tem regra nenhuma', () => {
    expect(regraAplicavel([], 'p-botox', gerais)).toEqual({ procedure_id: 'p-botox', tipo: 'PERCENTAGE', valor: 25 })
  })
  it('procedimento sem geral segue a exceção, senão o padrão', () => {
    expect(regraAplicavel([padrao, excecao], 'p-limpeza', gerais)).toBe(padrao)
    expect(regraAplicavel([padrao], null, gerais)).toBe(padrao)
  })
  it('as linhas do atendimento usam a geral', () => {
    expect(linhasDaComissao([{ procedure_id: 'p-botox', preco: 900 }, { procedure_id: 'p-limpeza', preco: 200 }], [], 'PLANO', 'pl', gerais))
      .toEqual([{ procedure_id: 'p-botox', origem: 'PLANO', treatment_plan_id: 'pl', regra_tipo: 'PERCENTAGE', regra_valor: 25, preco: 900 }])
  })
  it('a entrada: a mesma para todos OU uma por profissional, sem repetir', () => {
    const a = '00000000-0000-4000-8000-000000000001'
    expect(EntradaDaComissaoDoProcedimento.safeParse({ modo: 'GERAL', geral: { tipo: 'PERCENTAGE', valor: 25 } }).success).toBe(true)
    expect(EntradaDaComissaoDoProcedimento.safeParse({ modo: 'GERAL', geral: { tipo: 'PERCENTAGE', valor: 125 } }).success).toBe(false)
    expect(EntradaDaComissaoDoProcedimento.safeParse({ modo: 'POR_PROFISSIONAL', profissionais: [
      { professional_id: a, tipo: 'FIXED_AMOUNT', valor: 50 },
    ] }).success).toBe(true)
    expect(EntradaDaComissaoDoProcedimento.safeParse({ modo: 'POR_PROFISSIONAL', profissionais: [
      { professional_id: a, tipo: 'FIXED_AMOUNT', valor: 50 }, { professional_id: a, tipo: 'PERCENTAGE', valor: 5 },
    ] }).success).toBe(false)
  })
  it('o rótulo do chip', () => {
    expect(rotuloDaComissaoDoProcedimento({ tipo: 'PERCENTAGE', valor: 25 }, 0)).toBe('25% para todos')
    expect(rotuloDaComissaoDoProcedimento(null, 2)).toBe('Por profissional · 2')
    expect(rotuloDaComissaoDoProcedimento(null, 0)).toBe('Padrão de cada um')
  })
})

// J-46 (simulação de 2026-10-30): a dona achou que a comissão descontava a
// taxa e o insumo; o padrão é a base cheia, e a tela tem de dizer.
describe('rotuloDaBase', () => {
  it('sem nada descontado, a base é cheia — e diz isso', () => {
    expect(rotuloDaBase({ desconta_taxa: false, desconta_insumos: false })).toBe('base cheia (sem taxa nem insumo descontados)')
  })
  it('diz o que sai da base', () => {
    expect(rotuloDaBase({ desconta_taxa: true, desconta_insumos: false })).toBe('base sem a taxa da maquininha')
    expect(rotuloDaBase({ desconta_taxa: false, desconta_insumos: true })).toBe('base sem o custo dos insumos')
    expect(rotuloDaBase({ desconta_taxa: true, desconta_insumos: true })).toBe('base sem a taxa da maquininha e sem os insumos')
  })
})

// A10 da 7ª simulação: "Base cheia (sem taxa nem insumo descontados)" não dizia
// se os pontos saem da base, e a Tânia lia R$ 480 (40% de 1.200) sobre R$ 1.180
// pagos. Com a regra dos pontos (`base_com_pontos`), a frase diz o que vale.
describe('rotuloDaBase com os pontos (A10)', () => {
  it('sobre o preço: a base é cheia, e os pontos não saem dela', () => {
    expect(rotuloDaBase({ desconta_taxa: false, desconta_insumos: false, base_com_pontos: 'PRECO' }))
      .toBe('base cheia (sem taxa nem insumo descontados; os pontos e o voucher usados não saem dela)')
  })
  it('sobre o valor pago: os pontos saem da base', () => {
    expect(rotuloDaBase({ desconta_taxa: false, desconta_insumos: false, base_com_pontos: 'VALOR_PAGO' }))
      .toBe('base sem os pontos e o voucher usados (sem taxa nem insumo descontados)')
    expect(rotuloDaBase({ desconta_taxa: true, desconta_insumos: false, base_com_pontos: 'VALOR_PAGO' }))
      .toBe('base sem a taxa da maquininha e sem os pontos e o voucher usados')
  })
  it('com a taxa descontada e sobre o preço, diz que os pontos ficam', () => {
    expect(rotuloDaBase({ desconta_taxa: true, desconta_insumos: true, base_com_pontos: 'PRECO' }))
      .toBe('base sem a taxa da maquininha e sem os insumos (os pontos e o voucher usados não saem dela)')
  })
})

describe('Descontar a taxa da maquininha por procedimento (o Heitor, 18/11, ao item 11: "ok")', () => {
  const WEB = nodePath.join(__dirname, "..")
  const MIGRATIONS = nodePath.join(WEB, "..", "..", "supabase", "migrations")
  const ler = (caminho: string) => nodeFs.readFileSync(nodePath.join(WEB, caminho), "utf8")
  const sp = (s: string | null | undefined) => s?.replace(/\s/g, " ") ?? null
  const migrations = () => nodeFs.readdirSync(MIGRATIONS).filter(f => f.endsWith(".sql")).sort()
  /** A migration mais nova que mexe no que o trecho diz. */
  const ultimaCom = (trecho: string) => {
    const achou = migrations().filter(f => nodeFs.readFileSync(nodePath.join(MIGRATIONS, f), "utf8").includes(trecho))
    return achou.length ? { nome: achou.at(-1)!, sql: nodeFs.readFileSync(nodePath.join(MIGRATIONS, achou.at(-1)!), "utf8") } : null
  }

  // ─── "Descontar a taxa da maquininha" por procedimento (o Heitor, 18/11: "ok") ──
  // O Heitor, 18/11, ao item 11: "ok".
  describe('Como a rede, Desconta a taxa ou Não desconta', () => {
    it('três escolhas, e "Como a rede" é o padrão (o nulo)', () => {
      expect(TAXA_DO_PROCEDIMENTO.map(o => o.label)).toEqual(['Como a rede', 'Desconta a taxa', 'Não desconta'])
      expect([taxaDoProcedimento(null), taxaDoProcedimento(true), taxaDoProcedimento(false)]).toEqual(['REDE', 'SIM', 'NAO'])
      expect([descontaTaxaDaEscolha('REDE'), descontaTaxaDaEscolha('SIM'), descontaTaxaDaEscolha('NAO')]).toEqual([null, true, false])
    })
    it('"Como a rede" diz o que a rede faz hoje', () => {
      expect(rotuloDaTaxaDoProcedimento('REDE', true)).toBe('Como a rede: hoje a comissão sai da base sem a taxa da maquininha.')
      expect(rotuloDaTaxaDoProcedimento('REDE', false)).toBe('Como a rede: hoje a comissão sai da base cheia, sem descontar a taxa.')
      expect(rotuloDaTaxaDoProcedimento('SIM', false)).toBe('Neste procedimento a comissão sai da base sem a taxa da maquininha, seja qual for a regra da rede.')
      expect(rotuloDaTaxaDoProcedimento('NAO', true)).toBe('Neste procedimento a comissão sai da base cheia, seja qual for a regra da rede.')
    })
    it('a entrada leva a escolha, e recusa o que não é uma das três', () => {
      expect(EntradaDaComissaoDoProcedimento.safeParse({ modo: 'GERAL', geral: { tipo: 'PERCENTAGE', valor: 10 }, descontaTaxa: 'NAO' }).success).toBe(true)
      expect(EntradaDaComissaoDoProcedimento.safeParse({ modo: 'POR_PROFISSIONAL', profissionais: [], descontaTaxa: 'SIM' }).success).toBe(true)
      expect(EntradaDaComissaoDoProcedimento.safeParse({ modo: 'POR_PROFISSIONAL', profissionais: [], descontaTaxa: 'TALVEZ' }).success).toBe(false)
      const dados = { geral: { tipo: 'PERCENTAGE' as const, valor: 10 }, porProfissional: [], profissionais: [], descontaTaxa: false, redeDescontaTaxa: true }
      const e = estadoInicialDaComissao(dados)
      expect(e.taxa).toBe('NAO')
      const r = entradaDaComissao({ ...e, taxa: 'SIM' }, [])
      expect('entrada' in r && r.entrada.descontaTaxa).toBe('SIM')
      expect(estadoInicialDaComissao({ ...dados, descontaTaxa: null }).taxa).toBe('REDE')
    })
    it('a gravação passa a escolha à função do banco, e a tela lê a do procedimento e a da rede', () => {
      expect(ler('lib/comissoes/gravacao.ts')).toMatch(/p_desconta_taxa:\s*entrada\.descontaTaxa \?\? null/)
      expect(ler('app/_shared/catalogo-de-procedimentos.tsx')).toMatch(/desconta_taxa/)
      expect(ler('components/admin/comissao-do-procedimento.tsx')).toMatch(/ariaLabel="Descontar a taxa da maquininha neste procedimento"/)
    })
    it('o banco retrata a escolha na linha do atendimento, e a função grava só pela Admin (a action)', () => {
      const m = ultimaCom('p_desconta_taxa')
      expect(m, 'nenhuma migration grava a escolha do procedimento').not.toBeNull()
      expect(m!.nome >= '20261130100001').toBe(true)
      const s = sp(m!.sql)!
      expect(s).toMatch(/alter table public\.procedures add column if not exists desconta_taxa boolean/)
      expect(s).toMatch(/before insert on public\.commission_lines/)
      expect(s).toMatch(/new\.procedure_id is not null and new\.appointment_id is not null/)
      expect(s).toMatch(/drop function if exists public\.comissao_do_procedimento_definir\(uuid, uuid, jsonb, jsonb, uuid\)/)
      expect(s).toMatch(/revoke execute on function public\.comissao_do_procedimento_definir\(uuid, uuid, jsonb, jsonb, uuid, text\) from public, anon, authenticated/)
      expect(m!.sql).toContain('create or replace function pg_temp.trocar_no_corpo')
      expect(m!.sql.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
    })
    it('comissoes.md diz a regra e cita o "ok"', () => {
      const t = sp(nodeFs.readFileSync(nodePath.join(WEB, '..', '..', 'docs', 'regras', 'comissoes.md'), 'utf8'))!
      expect(t).toMatch(/taxa da maquininha por procedimento[^]*o Heitor, 18\/11, ao item 11: "ok"/)
    })
  })
})
