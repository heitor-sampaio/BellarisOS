import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * A varredura de conformidade de 18/11 — vendas, PDV, financeiro, taxas da
 * maquininha, indicadores e o dinheiro pelo Copilot. Cada bloco cita a regra
 * (`docs/regras/…`) que o código não cumpria. O que é do banco tem a prova em
 * `e2e/financeiro-varredura-18-taxas.spec.ts`; aqui, as travas do código e as
 * contas puras.
 */

const raiz = path.join(__dirname, '..')
const fonte = (f: string) => readFileSync(path.join(raiz, f), 'utf8')
const regra = (f: string) => readFileSync(path.join(raiz, '..', '..', 'docs', 'regras', f), 'utf8')
const migracoes = path.join(raiz, '..', '..', 'supabase', 'migrations')
/** As migrations da faixa desta leva (20261124600001…20261124699999), juntas. */
const migracoesDaLeva = () => readdirSync(migracoes)
  .filter(f => f >= '20261124600001' && f < '20261124700000')
  .map(f => readFileSync(path.join(migracoes, f), 'utf8')).join('\n')
const corpoDe = (texto: string, de: string, ate?: string) => {
  const i = texto.indexOf(de)
  expect(i, `achar "${de}"`).toBeGreaterThanOrEqual(0)
  const j = ate ? texto.indexOf(ate, i + de.length) : -1
  return texto.slice(i, j > i ? j : undefined)
}

// VF-01 — vendas-financeiro.md §9.6 (C75): "Com mais de uma ativa, o cartão não
// segue sem ela … Todos os caminhos". O pagamento novo do usado (cancelar o
// pacote, o plano, a unidade pré-paga, devolver parte da venda, estornar a
// venda de crédito) não perguntava a maquininha: o banco punha a primeira.
describe('VF-01: o pagamento novo do usado pede a maquininha', () => {
  it('a escolha da tela leva a maquininha à action (só no cartão)', async () => {
    const { escolhaParaAAcao, ESCOLHA_INICIAL } = await import('@/components/shared/escolha-da-devolucao')
    const parcial = { metodo: 'CREDIT_CARD', vezes: null, valor: 300, volta: 100, fica: 200, cartao: true } as never
    const base = { ...ESCOLHA_INICIAL, destino: 'ESTORNO' as const, comoEstornar: 'INTEIRO' as const }
    const noDebito = escolhaParaAAcao(100, parcial, { ...base, novoMetodo: 'DEBIT_CARD', novaMaquininha: 'maq-2' } as never)
    expect(noDebito.novo).toMatchObject({ metodo: 'DEBIT_CARD', maquininha: 'maq-2' })
    const noPix = escolhaParaAAcao(100, parcial, { ...base, novoMetodo: 'PIX', novaMaquininha: 'maq-2' } as never)
    expect(noPix.novo?.maquininha ?? null).toBeNull()
  })

  it('o pagamento do usado vai ao banco com a maquininha, e a recusa confere débito e crédito', async () => {
    const { pagamentoDoUsadoParaOBanco } = await import('@/lib/financeiro/pagamento-do-usado')
    expect(pagamentoDoUsadoParaOBanco({ metodo: 'DEBIT_CARD', vezes: 1, bandeira: 'VISA', maquininha: 'maq-2' }))
      .toEqual({ metodo: 'DEBIT_CARD', vezes: 1, bandeira: 'VISA', maquininha: 'maq-2' })
    expect(pagamentoDoUsadoParaOBanco({ metodo: 'CREDIT_CARD', vezes: 3, bandeira: null, maquininha: null }))
      .toEqual({ metodo: 'CREDIT_CARD', vezes: 3, bandeira: null, maquininha: null })
    expect(pagamentoDoUsadoParaOBanco({ metodo: 'PIX', vezes: 4, bandeira: 'VISA', maquininha: 'maq-2' }))
      .toEqual({ metodo: 'PIX', vezes: 1, bandeira: null, maquininha: null })
    expect(pagamentoDoUsadoParaOBanco(null)).toBeNull()
  })

  it('as cinco actions passam pela mesma recusa e mandam a maquininha', () => {
    for (const [arquivo, de, ate] of [
      ['actions/pacotes.ts', 'export async function cancelarPacote', undefined],
      ['actions/treatment-plans.ts', 'export async function cancelarPlano', '\nexport async function'],
      ['actions/pre-pago.ts', 'export async function cancelarUnidadePrePaga', undefined],
      ['actions/devolucao-de-produto.ts', 'export async function devolverParteDaVenda', undefined],
      ['actions/credito-interno.ts', 'export async function estornarVendaDeCredito', '\nexport async function'],
    ] as const) {
      const corpo = corpoDe(fonte(arquivo), de, ate)
      expect(corpo, arquivo).toMatch(/recusaDoPagamentoDoUsado\(/)
      expect(corpo, arquivo).toMatch(/pagamentoDoUsadoParaOBanco\(/)
      expect(corpo, arquivo).not.toMatch(/novo\.metodo === 'CREDIT_CARD'\)\s*\{\s*const recusa = await recusaDasVezesDaRede/)
    }
  })

  it('o banco grava a maquininha escolhida nas quatro funções do usado', () => {
    const sql = migracoesDaLeva()
    for (const fn of ['procedimento_cancelar_unidade_devolvendo', 'private.cancelamento_dinheiro', 'credito_estornar_venda', 'produto_devolver_itens']) {
      expect(sql, fn).toContain(fn)
    }
    expect(sql).toMatch(/p_novo ->> 'maquininha'/)
  })
})

// VF-02 — C36 (vendas-financeiro.md): cancelar a unidade pré-paga devolve
// dinheiro, é do Financeiro em Gerenciar (sem "só os meus", C35). O botão e a
// prévia apareciam a quem recebe — a action recusava depois.
describe('VF-02: o "Cancelar" do pré-pago aparece a quem a action aceita', () => {
  it('a ficha usa a mesma régua do cancelar o pacote, e as páginas passam podeEstornar', () => {
    expect(fonte('components/branch/client-profile.tsx')).toMatch(/<ProcedimentosPagos vendas=\{prePagos\} podeCancelar=\{podeCancelarPacote\}/)
    for (const p of ['app/[slug]/clients/[id]/page.tsx', 'app/admin/clients/[id]/page.tsx']) {
      expect(fonte(p), p).toMatch(/podeCancelarPacote=\{podeEstornar\(ctx\)\}/)
    }
  })
  it('a prévia confere o mesmo que a action', () => {
    const corpo = corpoDe(fonte('actions/pre-pago.ts'), 'export async function previaDoCancelamentoDaUnidade', '\nexport ')
    expect(corpo).toMatch(/podeEstornar\(ctx\)/)
    expect(corpo).not.toMatch(/podeReceber\(ctx\)/)
  })
})

// VF-03 — D6 (vendas-financeiro.md): o dinheiro da unidade inteira vê quem
// recebe ou o Financeiro de TODOS. O "só os meus" lia o dinheiro na gaveta.
describe('VF-03: o dinheiro na gaveta é de podeVerFechamento', () => {
  it('sem o atalho do Financeiro em Ver', () => {
    const corpo = corpoDe(fonte('actions/fechamento.ts'), 'export async function dinheiroNaGavetaDeHoje', '\nexport ')
    expect(corpo).toMatch(/if \(!podeVerFechamento\(ctx\)\) return null/)
    expect(corpo).not.toMatch(/can\(ctx, 'financial', 'VIEW'\)/)
  })
})

// VF-04 — vendas-financeiro.md: "Quem recebe é podeReceber em todo caminho do
// recebimento"; o banner do plano aparece a quem recebe. A action do check-in
// pedia o PDV: quem tem o Financeiro em Gerenciar via o botão e era barrado.
// VF2-04 — CLAUDE.md §14: duas gravações juntas, uma transação. A bandeira e a
// maquininha iam num UPDATE depois de `plano_receber`.
describe('VF-04 e VF2-04: o recebimento do plano no atendimento', () => {
  const corpo = () => corpoDe(fonte('actions/treatment-plans.ts'), 'async function receberDoPlanoInterno', '\nexport ')
  it('recebe quem podeReceber', () => {
    expect(corpo()).toMatch(/if \(!podeReceber\(ctx\)\) throw semAcesso\(\)/)
    expect(corpo()).not.toMatch(/assertPermission\(ctx, 'cashier', 'MANAGE'\)/)
  })
  it('a bandeira e a maquininha vão na mesma chamada de plano_receber', () => {
    expect(corpo()).toMatch(/p_bandeira:\s*bandeiraDoPagamento\(recebimento\.metodo, recebimento\.bandeira\)/)
    expect(corpo()).toMatch(/p_maquininha:\s*maquininhaDoPagamento\(recebimento\)/)
    expect(corpo()).not.toMatch(/gravar a bandeira do recebimento do plano/)
    expect(migracoesDaLeva()).toMatch(/function public\.plano_receber\([\s\S]*?p_bandeira text default null,\s*p_maquininha uuid default null/)
  })
})

// VF2-01 — uma regra só para as vezes do cartão: `cartao_vezes`, nulo = 1x;
// nunca `parcela_total` (a parcela 2/3 do crediário recebida no crédito à
// vista pagava a taxa de 3x na comissão e nos indicadores, e a de 1x no
// recebível). VF2-02 — "O lançamento já gravado fica com a taxa que tem":
// toda leitura parte do retrato (o débito e o Pix também).
describe('VF2-01 e VF2-02: as vezes e o retrato da taxa no banco', () => {
  it('a migration troca as leituras pelo cartao_vezes e lê o retrato', () => {
    const sql = migracoesDaLeva()
    for (const fn of [
      'private.comissao_base_do_pagamento', 'private.comissao_conta_detalhe', 'public.metrics_avisos_do_fechamento',
      'public.metrics_taxas_por_maquininha', 'public.metrics_vendas_sem_taxa_do_fechamento', 'public.metrics_custos_da_venda',
      'public.metrics_series_dos_custos_da_venda', 'public.metrics_caixa_dos_lancamentos',
    ]) expect(sql, fn).toContain(fn)
    expect(sql).toMatch(/add column if not exists taxa_pct_retrato numeric/)
    expect(sql).toMatch(/function private\.taxa_gravada_do_cartao/)
  })
  it('a regra de comissoes.md não manda ler parcela_total', () => {
    const t = regra('comissoes.md')
    expect(t).not.toMatch(/`cartao_vezes` \(crédito em N\s+vezes, pago na hora — 2026-10-20\), senão `parcela_total`, senão 1/)
  })
})

// VF2-03 — "Com produto pendente, o atendimento não se abate de pacote (a
// comanda tem dinheiro a receber)" + CLAUDE.md §11 ("A trava da action é a
// única"): só a tela barrava.
describe('VF2-03: abater do pacote com produto pendente', () => {
  it('a função do banco recusa', () => {
    expect(migracoesDaLeva()).toMatch(/atendimento_abater_do_pacote[\s\S]*comanda_itens[\s\S]*product_sale_id is null/)
  })
})

// VF2-05 e o marcar_pago — copilot.md: "O marcar_pago é a baixa do
// Financeiro"; a baixa é `podeDarBaixa` (CX2). O prompt dizia que a parcela do
// crediário é só no PDV, e a ferramenta pedia o PDV.
describe('VF2-05: o Copilot e a baixa do Financeiro', () => {
  it('o marcar_pago segue podeDarBaixa', () => {
    const corpo = corpoDe(fonte('lib/copilot/ferramentas/gestao-escrita.ts'), "nome: 'marcar_pago'", 'async preparar')
    expect(corpo).toMatch(/pode:\s*podeDarBaixa/)
    expect(corpo).not.toMatch(/modulo: 'cashier'/)
  })
  // A regra mudou: o Copilot não vende nem recebe — nem a comanda, nem a parcela
  // do crediário, que se recebe no PDV (o Heitor, 17–18/11, DEVLOG.md:2201: "O
  // Copilot (17/11): só lê e manda ao PDV; não vende, não recebe e não aceita o
  // plano"; CR-06; confirmada na revisão de 24/11, docs/catalogo/copilot.md
  // Q01 e "Divergências"). Era: "o prompt diz que a parcela do crediário se
  // baixa pelo Copilot" (VF2-05, decisão do Claude de 18/11).
  it('o prompt manda a parcela do crediário ao PDV; o marcar_pago é só a baixa do lançamento avulso', () => {
    const p = fonte('lib/copilot/prompt.ts')
    expect(p).not.toMatch(/parcela do crediário[^']*marcar_pago/)
    expect(p).toMatch(/a parcela do crediário[^']*é no PDV: você não vende nem recebe/)
  })
})

// IND-01 — indicadores.md (C45/F72): a leitura usa `unidadesParaLer` (a
// desativada que recebeu no período conta). O Copilot somava só as ativas.
describe('IND-01: os indicadores do Copilot leem as unidades de leitura', () => {
  it('indicadores.ts parte de unidadesParaLer', () => {
    const f = fonte('lib/copilot/ferramentas/indicadores.ts')
    expect(f).toMatch(/unidadesParaLer\(/)
    expect(f).not.toMatch(/const branchIds = await idsDasUnidades\(c, u\.unidade\)/)
  })
})

// IND-02 — §13.1/§14: nada se conta na tela de uma lista cortada. O dashboard
// da rede contava os planos propostos de um .limit(20).
describe('IND-02: os planos propostos do dashboard da rede são contados no banco', () => {
  it('a página conta, e a tela mostra o total', () => {
    expect(fonte('app/admin/dashboard/page.tsx')).toMatch(/pendingPlansTotal/)
    const v = fonte('components/admin/admin-dashboard-view.tsx')
    expect(v).not.toMatch(/\{pendingPlans\.length\}/)
    expect(v).not.toMatch(/\+\{pendingPlans\.length - 5\} mais/)
  })
})

// IND-03 — indicadores.md (F64): a validade do pacote é o fim do dia DA UNIDADE.
describe('IND-03: o app da cliente diz a validade no relógio da unidade', () => {
  it('sem America/Sao_Paulo fixo na tela inicial', () => {
    expect(fonte('app/[slug]/cliente/home/page.tsx')).not.toMatch(/timeZone: 'America\/Sao_Paulo'/)
  })
})

// IND-04 — a variação contra um anterior NEGATIVO (o lucro de −R$ 1.000 a
// +R$ 500) dizia "▼ 150%".
describe('IND-04: variacaoPercentual com o anterior negativo', () => {
  it('melhorou é para cima, sobre o tamanho do anterior', async () => {
    const { variacaoPercentual } = await import('@/lib/metrics/resultado')
    expect(variacaoPercentual(500, -1000)).toEqual({ pct: 150, up: true })
    expect(variacaoPercentual(-1500, -1000)).toEqual({ pct: 50, up: false })
    expect(variacaoPercentual(150, 100)).toEqual({ pct: 50, up: true })
    expect(variacaoPercentual(0, 0)).toBeNull()
  })
})

// IND-05 — indicadores.md: "Nenhuma tela soma dinheiro". A legenda do gráfico
// de evolução somava a série na tela.
describe('IND-05: os totais da evolução vêm de lib/metrics', () => {
  it('totaisDaEvolucao soma em centavos, e o gráfico não soma', async () => {
    const { totaisDaEvolucao } = await import('@/lib/metrics/evolucao')
    expect(totaisDaEvolucao([{ revenue: 0.1, cost: 0.05 }, { revenue: 0.2, cost: 0.05 }]))
      .toEqual({ revenue: 0.3, cost: 0.1, profit: 0.2 })
    expect(fonte('components/admin/evolution-chart.tsx')).not.toMatch(/data\.reduce\(/)
  })
})

// IND-06 — C46: a variação mora em lib/metrics. O Financeiro da rede tinha a sua.
describe('IND-06: o Financeiro da rede usa variacaoPercentual', () => {
  it('sem cópia própria da conta', () => {
    const f = fonte('components/admin/admin-financial-view.tsx')
    expect(f).toMatch(/variacaoPercentual/)
    expect(f).not.toMatch(/\(\(curr - prev\) \/ prev\) \* 100/)
  })
})

// IND-08 — princípio 3 e F62b: a parcela vencida há 30 dias dizia "0d".
describe('IND-08: os dias até o vencimento', () => {
  it('a vencida conta para trás, no dia da unidade', async () => {
    const { diasAteOVencimento } = await import('@/lib/financeiro/vencimentos')
    const agora = new Date('2026-11-18T15:00:00Z')
    expect(diasAteOVencimento('2026-10-19T15:00:00Z', agora)).toBe(-30)
    expect(diasAteOVencimento('2026-11-18T15:00:00Z', agora)).toBe(0)
    expect(diasAteOVencimento('2026-11-21T15:00:00Z', agora)).toBe(3)
    expect(fonte('components/admin/reports-bi-view.tsx')).not.toMatch(/Math\.max\(0, Math\.ceil\(\(new Date\(i\.due_date\)/)
  })
})

// IND-09 — indicadores.md ("Novos clientes" só existe na rede, o Heitor,
// 18/11): o Copilot mandava o nulo sem dizer por quê.
describe('IND-09: o Copilot diz que "novos clientes" é só da rede', () => {
  it('com o número nulo, vai a nota', () => {
    expect(fonte('lib/copilot/ferramentas/indicadores.ts')).toMatch(/notaDosNovosClientes/)
  })
})

// COM-01 — C35 (vendas-financeiro.md): o "só os meus" do Financeiro existe para
// "Minhas comissões". A pessoa vê a PRÓPRIA comissão (na aba Profissionais e no
// Copilot, só a linha dela); a das outras não sai do servidor.
describe('COM-01: a regra das comissões com "só os meus"', () => {
  it('comissoes.md não diz mais que a aba Profissionais exige o Financeiro de todos', () => {
    expect(regra('comissoes.md')).not.toMatch(/O ranking do dashboard e a comissão na aba\s+Profissionais dos relatórios exigem `financial` sem OWN/)
  })
})

// RC-1 — os pontos e o voucher na comanda do plano já existem (FD2a/FD2b).
describe('RC-1: o texto velho dos pontos na comanda do plano', () => {
  it('vendas-financeiro.md não diz mais que a comanda do plano não usa pontos', () => {
    const t = regra('vendas-financeiro.md')
    expect(t).not.toMatch(/A comanda do\s+PLANO ainda não usa pontos/)
    expect(t).not.toMatch(/Ainda por vir \(o plano de adaptação, `docs\/revisao\.md`\): os pontos na\s+comanda do plano\./)
  })
})
