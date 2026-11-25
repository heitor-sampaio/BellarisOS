import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import * as comum from '@/lib/acima-do-comum'
import * as vezesDoCartao from '@/lib/financeiro/vezes-do-cartao'
import { maximoDeVezes, opcoesDeVezes } from '@/lib/financeiro/vezes-do-cartao'
import { EntradaDaMaquininha, lerMaquininha, taxaNaMaquininha, maximoDaMaquininha } from '@/lib/financeiro/maquininhas'
import { EntradaDoCartaoPorBandeira, lerCartaoPorBandeira, taxasDaTabelaColada, creditoPelaTaxaPorParcela } from '@/lib/financeiro/bandeiras'
import { EntradaDoPagamento } from '@/lib/checkout/lancamentos'
import { partesQuePagamAgora, vezesNoCartao } from '@/lib/checkout/pagamento'
import { EntradaDoCancelamento } from '@/lib/pacotes/entrada-do-cancelamento'
import { EntradaDasTaxas } from '@/lib/comissoes/config'
import { formaConferivel } from '@/lib/financeiro/conferencia-do-fechamento'

/**
 * O Heitor, 25/11, sobre o limite de 12 vezes no cartão: "Se não for
 * impossível, ainda que improvável, pode ser feito." (o princípio 2: "no
 * máximo, avisar"). Acima de 12 vezes a tela AVISA e o servidor GRAVA.
 *
 * O impossível (decisão do Claude, 25/11): zero, negativo, fracionário e
 * acima de 1.200 vezes — cada parcela vira um recebível com data mensal, e
 * 1.200 meses são 100 anos, o mesmo limite das datas (`LIMITE_DE_MESES`). O
 * "comum" é o teto de antes, 12.
 *
 * A taxa das vezes acima de 12 (princípio 4): sem a taxa daquelas vezes
 * cadastrada, vale zero e a tela avisa — nunca a de 12.
 */

const RAIZ = join(__dirname, '..', '..', '..')
const texto = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')
const v = vezesDoCartao as unknown as Record<string, unknown>
const c = comum as unknown as Record<string, unknown>
const funcao = <T>(nome: string): T => {
  expect(typeof v[nome], `${nome} em lib/financeiro/vezes-do-cartao.ts`).toBe('function')
  return v[nome] as T
}

describe('o comum e o impossível das vezes no cartão', () => {
  it('o limite é o das datas (1.200 meses = 100 anos); o comum, o teto de antes (12)', () => {
    expect(c.LIMITE_DE_VEZES_NO_CARTAO, 'LIMITE_DE_VEZES_NO_CARTAO em lib/acima-do-comum.ts').toBe(comum.LIMITE_DE_MESES)
    expect(v.VEZES_COMUNS_NO_CARTAO).toBe(12)
  })

  it('acima de 12 vezes, a tela avisa; até 12, nada', () => {
    const aviso = funcao<(n: number) => string | null>('avisoDasVezesNoCartao')
    expect(aviso(18)).toBe('Acima do comum (mais de 12 vezes). Confira: o valor vale como está.')
    expect(aviso(12)).toBeNull()
    expect(aviso(1)).toBeNull()
  })

  it('só o impossível se recusa: zero, negativo, fracionário e acima de 1.200', () => {
    const recusa = funcao<(n: number) => string | null>('recusaDasVezesNoCartao')
    for (const n of [1, 12, 13, 18, 1200]) expect(recusa(n), String(n)).toBeNull()
    for (const n of [0, -1, 1.5, Number.NaN]) expect(recusa(n), String(n)).toBe('As vezes no cartão são um número inteiro, de pelo menos 1.')
    expect(recusa(1201)).toBe('No máximo 1.200 vezes (100 anos, o limite das datas).')
  })
})

describe('até quantas vezes a maquininha parcela', () => {
  it('a rede escolhe 18: vale 18, e o seletor da venda vai até 18', () => {
    expect(maximoDeVezes(18, [])).toBe(18)
    expect(opcoesDeVezes(18)).toHaveLength(18)
    expect(maximoDaMaquininha({ taxas: {}, maxVezes: 18 })).toBe(18)
  })
  it('no Automático, a maior com taxa — também acima de 12', () => {
    expect(maximoDeVezes(null, [1, 3, 18])).toBe(18)
    expect(maximoDaMaquininha({ taxas: { 'CREDIT_CARD:18': 9 }, maxVezes: null })).toBe(18)
  })
  it('sem nenhuma taxa do crédito, segue 12x; acima do registro, para em 1.200', () => {
    expect(maximoDeVezes(null, [])).toBe(12)
    expect(maximoDeVezes(5000, [])).toBe(1200)
  })
})

describe('a maquininha grava acima de 12', () => {
  const base = { nome: 'Stone', taxas: {}, maxVezes: null, prazoDias: 30, cobraPorBandeira: false, porBandeira: {} }
  it('"Parcelar até" 18 e a taxa do 18x passam', () => {
    expect(EntradaDaMaquininha.safeParse({ ...base, maxVezes: 18, taxas: { 'CREDIT_CARD:18': 11.9 } }).success).toBe(true)
    expect(EntradaDaMaquininha.safeParse({ ...base, maxVezes: 1200 }).success).toBe(true)
  })
  it('o impossível não: zero, fracionário, acima de 1.200 — no limite e na taxa', () => {
    for (const n of [0, 1.5, 1201]) expect(EntradaDaMaquininha.safeParse({ ...base, maxVezes: n }).success, `maxVezes ${n}`).toBe(false)
    for (const k of ['CREDIT_CARD:0', 'CREDIT_CARD:1201', 'CREDIT_CARD:01', 'DEBIT_CARD:2']) {
      expect(EntradaDaMaquininha.safeParse({ ...base, taxas: { [k]: 1 } }).success, k).toBe(false)
    }
  })
  it('a leitura do banco não perde a taxa do 18x (nem a da bandeira)', () => {
    const m = lerMaquininha({ id: 'a', nome: 'Stone', taxas: { 'CREDIT_CARD:18': 11.9, 'CREDIT_CARD:1201': 1 }, max_vezes: 18 })
    expect(m.taxas).toEqual({ 'CREDIT_CARD:18': 11.9 })
    expect(m.maxVezes).toBe(18)
    expect(EntradaDoCartaoPorBandeira.safeParse({ ELO: { taxas: { 'CREDIT_CARD:18': 12 } } }).success).toBe(true)
    expect(EntradaDoCartaoPorBandeira.safeParse({ ELO: { taxas: { 'CREDIT_CARD:1201': 12 } } }).success).toBe(false)
    expect(lerCartaoPorBandeira({ ELO: { taxas: { 'CREDIT_CARD:18': 12 } } })).toEqual({ ELO: { taxas: { 'CREDIT_CARD:18': 12 } } })
  })
})

describe('a taxa das vezes acima de 12 (princípio 4)', () => {
  const m = { taxas: { 'CREDIT_CARD:12': 9.5 }, cobraPorBandeira: false, porBandeira: {} }
  it('sem a taxa do 18x, vale zero (nula: a tela avisa) — nunca a do 12x', () => {
    expect(taxaNaMaquininha(m, 'CREDIT_CARD', 18)).toEqual({ taxa: null, daBandeira: false })
  })
  it('com a taxa do 18x, a dela', () => {
    expect(taxaNaMaquininha({ ...m, taxas: { ...m.taxas, 'CREDIT_CARD:18': 11.9 } }, 'CREDIT_CARD', 18).taxa).toBe(11.9)
  })
  it('a tabela da operadora colada traz o 18x e o 120x; acima de 1.200, erro', () => {
    expect(taxasDaTabelaColada('12x 9,5\n18x 11,9\n120x 50').taxas).toEqual([
      { parcelas: 12, taxa: 9.5 }, { parcelas: 18, taxa: 11.9 }, { parcelas: 120, taxa: 50 },
    ])
    expect(taxasDaTabelaColada('1201x 9,99').erros[0]).toContain('1201x')
  })
  it('o "Preencher pela taxa por parcela" vai até as vezes pedidas (o padrão segue 12)', () => {
    expect(creditoPelaTaxaPorParcela(1, 18).at(-1)).toEqual({ parcelas: 18, taxa: 18 })
    expect(creditoPelaTaxaPorParcela(1)).toHaveLength(12)
  })
  it('a regra geral de antes (payment_fees) também guarda o 18x', () => {
    expect(EntradaDasTaxas.safeParse([{ metodo: 'CREDIT_CARD', parcelas: 18, taxa_pct: 11.9 }]).success).toBe(true)
    expect(EntradaDasTaxas.safeParse([{ metodo: 'CREDIT_CARD', parcelas: 1201, taxa_pct: 1 }]).success).toBe(false)
    const cheia = [{ metodo: 'PIX', parcelas: 1, taxa_pct: 1 }, ...Array.from({ length: 18 }, (_, i) => ({ metodo: 'CREDIT_CARD', parcelas: i + 1, taxa_pct: 1 }))]
    expect(EntradaDasTaxas.safeParse(cheia).success, 'a tabela de 1x a 18x cabe').toBe(true)
  })
})

describe('a venda em 18 vezes passa no servidor', () => {
  it('o pagamento (à vista, entrada do crediário e o à vista dividido)', () => {
    expect(EntradaDoPagamento.safeParse({ forma: 'AVISTA', metodo: 'CREDIT_CARD', vezes: 18 }).success).toBe(true)
    expect(EntradaDoPagamento.safeParse({ forma: 'PARCELADO', metodo: 'CREDIT_CARD', entrada: 100, parcelas: 2, primeiroVencimento: '2026-12-10T15:00:00.000Z', vezes: 18 }).success).toBe(true)
    expect(EntradaDoPagamento.safeParse({ forma: 'AVISTA', metodo: 'PIX', valor: 100, outras: [{ metodo: 'CREDIT_CARD', valor: 100, vezes: 18 }] }).success).toBe(true)
    for (const n of [0, 1.5, 1201]) expect(EntradaDoPagamento.safeParse({ forma: 'AVISTA', metodo: 'CREDIT_CARD', vezes: n }).success, String(n)).toBe(false)
  })
  it('as vezes que pagam agora não se cortam em 12', () => {
    expect(vezesNoCartao({ forma: 'AVISTA', metodo: 'CREDIT_CARD', vezes: 18 })).toBe(18)
    const partes = partesQuePagamAgora({ forma: 'AVISTA', metodo: 'PIX', valor: 100, outras: [{ metodo: 'CREDIT_CARD', valor: 100, vezes: 18 }] }, 200)
    expect(partes.map(p => p.vezes)).toEqual([1, 18])
  })
  it('o pagamento novo do usado no cancelamento do pacote e do plano', () => {
    const base = { motivo: 'x', destino: 'ESTORNO', agendamentos: null, esperado: 0, estorno: 'INTEIRO' }
    expect(EntradaDoCancelamento.safeParse({ ...base, novo: { metodo: 'CREDIT_CARD', vezes: 18 } }).success).toBe(true)
    expect(EntradaDoCancelamento.safeParse({ ...base, novo: { metodo: 'CREDIT_CARD', vezes: 1201 } }).success).toBe(false)
  })
  it('os outros caminhos não têm mais o .max(12) nas vezes', () => {
    const doze = /vezes:\s*z\.number\(\)\.int\(\)\.min\(1\)\.max\(12\)/
    for (const arq of [['actions', 'credito-interno.ts'], ['actions', 'devolucao-de-produto.ts'], ['actions', 'pre-pago.ts'], ['lib', 'copilot', 'ferramentas', 'gestao-escrita.ts']]) {
      expect(doze.test(texto(...arq)), arq.join('/')).toBe(false)
    }
    expect(texto('lib', 'financeiro', 'lancamento.ts')).not.toContain('TETO_DE_VEZES')
    expect(texto('lib', 'checkout', 'passo-do-checkout.ts')).not.toContain('v.vezesCartao! <= 12')
    expect(texto('actions', 'maquininhas.ts')).not.toContain('Math.min(TETO_DE_VEZES')
  })
  it('o Fechamento confere o crédito em 18x e em 120x', () => {
    expect(formaConferivel('CREDIT_CARD:18')).toBe(true)
    expect(formaConferivel('CREDIT_CARD:120')).toBe(true)
  })
})

describe('a tela de Taxas: acima de 12 vezes, avisa', () => {
  const tela = texto('components', 'admin', 'settings-comissoes.tsx')
  it('o "Parcelar no crédito até" passa de 12 e diz o aviso', () => {
    expect(tela).not.toContain('opcoesDeVezes(TETO_DE_VEZES)')
    expect(tela).toContain('avisoDasVezesNoCartao(')
    expect(tela).toContain('data-aviso-das-vezes')
    expect(tela).not.toContain('Array.from({ length: 11 }')
  })
})

describe('o banco grava acima de 12 e só recusa o impossível', () => {
  const arquivo = join(RAIZ, 'supabase', 'migrations', '20261206800001_cartao_acima_de_12_vezes.sql')
  const sql = existsSync(arquivo) ? readFileSync(arquivo, 'utf8') : ''
  it('a migration existe', () => {
    expect(existsSync(arquivo), arquivo).toBe(true)
  })
  it('as travas vão até 1.200', () => {
    expect(sql).toContain("check (parcelas between 1 and 1200 and (metodo = 'CREDIT_CARD' or parcelas = 1))")
    expect(sql).toContain('check (max_vezes between 1 and 1200)')
    expect(sql).toContain('check (cartao_max_vezes is null or cartao_max_vezes between 1 and 1200)')
    expect(sql).toContain("check (cartao_vezes is null or (cartao_vezes between 2 and 1200 and payment_method = 'CREDIT_CARD'))")
    expect(sql).toContain('check (parcela_total >= 1 and parcela_total <= 1200 and parcela_numero <= parcela_total)')
  })
  it('as funções que recusavam acima de 12 passam a recusar só acima de 1.200', () => {
    for (const f of ['confirmar_pagamento_do_atendimento', 'credito_vender', 'pacote_cancelar_devolvendo', 'plano_cancelar_devolvendo',
      'procedimento_cancelar_unidade_devolvendo', 'produto_devolver_itens']) {
      expect(sql, f).toMatch(new RegExp(`trocar_no_corpo\\(\\s*'public\\.${f}\\(`))
    }
    expect(sql).toContain('$t$v_vezes < 1 or v_vezes > 1200 or$t$')
    expect(sql).toContain('$t$v_vezes_x < 1 or v_vezes_x > 1200 or$t$')
    expect(sql).toContain('$t$v_vezes < 1 or v_vezes > 1200 then$t$')
    expect(sql).toContain('$t$v_novo_vezes < 1 or v_novo_vezes > 1200 or$t$')
  })
  it('a taxa, os recebíveis e as vendas sem taxa não cortam mais em 12 (nunca a taxa do 12x no 18x)', () => {
    for (const f of ['private.taxa_da_maquininha', 'private.recebiveis_do_cartao_acompanham', 'public.metrics_vendas_sem_taxa_do_fechamento']) {
      expect(sql, f).toMatch(new RegExp(`trocar_no_corpo\\(\\s*'${f.replace('.', '\\.')}\\(`))
    }
    expect(sql).toContain('$t$greatest(1, coalesce(p_parcelas, 1))$t$')
    expect(sql).toContain('$t$coalesce(new.cartao_vezes, 1)$t$')
    expect(sql).toContain('$t$coalesce(r.cartao_vezes, 1)$t$')
  })
  it('sem política nova, e o PostgREST recarrega', () => {
    expect(sql).not.toMatch(/create policy/i)
    expect(sql.trimEnd()).toMatch(/notify pgrst, 'reload schema';$/)
  })
})
