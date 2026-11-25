import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import * as variasFormas from '@/lib/checkout/varias-formas'
import { EntradaDoPagamento, lancamentosDoPagamento, recusaDaEntradaDoPagamento } from '@/lib/checkout/lancamentos'
import { recusaDasFormasDaBaixa, lerPartesDaBaixa } from '@/lib/financeiro/baixa-em-formas'
import type { PagamentoDoPlano } from '@/lib/checkout/pagamento'

/**
 * O "+ Outra forma" sem limite de quantidade. O Heitor, 25/11, perguntado se
 * o limite de 5 formas continua ou passa a avisar acima de 5: "Não precisa de
 * aviso, essa não é uma ação automatica, o usuario vai precisar clicar em um
 * botão, então ele fez de proposito."
 *
 * Cada forma a mais é um clique de quem recebe: nem teto, nem aviso. Fica só o
 * impossível, que já existia: cada forma com pelo menos R$ 0,01, e as formas
 * fechando o total ao centavo.
 *
 * E o crediário na comanda do atendimento: a entrada e cada parcela são um
 * lançamento, e o banco recusava acima de 30 lançamentos ("Formas demais neste
 * pagamento.") — a comanda em 30x com entrada não fechava. As parcelas seguem
 * o teto do crediário (`TETO_DO_CREDIARIO`, 32.767: uma linha por parcela); as
 * formas pagas agora, nenhum.
 */

const RAIZ = join(__dirname, '..', '..', '..')
const texto = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8').replace(/\r/g, '')
const MIGRATION = join(RAIZ, 'supabase', 'migrations', '20261207700001_formas_do_pagamento_sem_limite.sql')
const sql = () => (existsSync(MIGRATION) ? readFileSync(MIGRATION, 'utf8').replace(/\r/g, '') : '')

/** O à vista em `n` formas de R$ 10,00 (a primeira com o que falta das outras). */
const emFormas = (n: number): PagamentoDoPlano => ({
  forma: 'AVISTA', metodo: 'PIX', valor: 10,
  outras: Array.from({ length: n - 1 }, (_, i) => ({ metodo: i % 2 ? 'CASH' : 'DEBIT_CARD', valor: 10 })),
} as PagamentoDoPlano)

describe('o "+ Outra forma" sem teto de quantidade', () => {
  it('não existe mais o número de formas (MAXIMO_DE_OUTRAS sai)', () => {
    expect((variasFormas as Record<string, unknown>).MAXIMO_DE_OUTRAS).toBeUndefined()
    for (const arquivo of ['lib/checkout/varias-formas.ts', 'lib/checkout/lancamentos.ts', 'lib/financeiro/baixa-em-formas.ts', 'components/shared/outras-formas.tsx']) {
      expect(texto(arquivo), arquivo).not.toMatch(/MAXIMO_DE_OUTRAS|Divida em até/)
    }
  })

  it('o botão "+ Outra forma" segue na tela depois da 5ª forma', () => {
    const tela = texto('components', 'shared', 'outras-formas.tsx')
    const botao = tela.indexOf('data-outra-forma')
    expect(botao).toBeGreaterThan(0)
    // O botão não depende de quantas formas já há.
    expect(tela.slice(Math.max(0, botao - 200), botao)).not.toMatch(/outras\.length\s*</)
  })

  it('o servidor lê 12 formas no à vista da venda e da comanda', () => {
    const lido = EntradaDoPagamento.safeParse(emFormas(12))
    expect(lido.success, lido.success ? '' : lido.error.issues[0]?.message).toBe(true)
  })

  it('12 formas que fecham o total valem, e viram 12 lançamentos pagos', () => {
    const p = emFormas(12)
    expect(recusaDaEntradaDoPagamento(p, 120)).toBeNull()
    const ls = lancamentosDoPagamento(120, p, 'Atendimento')
    expect(ls).toHaveLength(12)
    expect(ls.every(l => l.is_paid && l.amount === 10)).toBe(true)
  })

  it('o impossível continua recusado: forma sem valor e formas que não fecham o total', () => {
    const p = emFormas(8)
    expect(recusaDaEntradaDoPagamento(p, 100)).toMatch(/As formas somam R\$\s80,00 e não fecham o total de R\$\s100,00/)
    const comZero = { ...p, outras: [...(p as { outras: { metodo: string; valor: number }[] }).outras, { metodo: 'PIX', valor: 0 }] } as PagamentoDoPlano
    expect(recusaDaEntradaDoPagamento(comZero, 80)).toBe('Digite o valor de cada forma (acima de zero).')
  })

  it('o "Receber" da parcela e do a receber aceita 8 formas', () => {
    const partes = Array.from({ length: 8 }, () => ({ forma: 'PIX', valor: 75 }))
    expect(recusaDasFormasDaBaixa(partes, 600)).toBeNull()
    const lidas = lerPartesDaBaixa(partes)
    expect(Array.isArray(lidas) ? lidas.length : lidas.error).toBe(8)
    // O impossível segue: a soma que não fecha e a forma sem valor.
    expect(recusaDasFormasDaBaixa(partes, 700)).toMatch(/não fecham o valor de/)
    expect(recusaDasFormasDaBaixa([...partes.slice(1), { forma: 'CASH', valor: 0 }], 525)).toBe('Digite o valor de cada forma (acima de zero).')
  })
})

describe('o banco aceita quantas formas vierem', () => {
  it('a migration existe e termina recarregando o esquema', () => {
    expect(existsSync(MIGRATION), MIGRATION).toBe(true)
    expect(sql().trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
    expect(sql()).not.toMatch(/create policy/i)
  })

  it('o "Receber" em formas deixa de recusar acima de 5', () => {
    const s = sql()
    expect(s).toContain("'public.lancamento_receber_em_formas(uuid,uuid,jsonb,uuid)'::regprocedure")
    expect(s).toContain('$t$if v_n < 2 or v_n > 5 then$t$')
    expect(s).toContain("$t$'Divida em 2 a 5 formas.'$t$")
    // O trecho novo: pelo menos duas (com uma só é a baixa de sempre), e nenhum teto.
    expect(s).toContain('$t$if v_n < 2 then$t$')
    expect(s).toContain("$t$'Divida em pelo menos 2 formas.'$t$")
  })

  it('a comanda do atendimento: sem "Formas demais"; as parcelas no teto do crediário (32.767)', () => {
    const s = sql()
    expect(s).toContain("'public.confirmar_pagamento_do_atendimento(uuid,uuid,uuid,text,jsonb)'::regprocedure")
    expect(s).toContain('if jsonb_array_length(v_l) > 30 then')
    // O trecho novo: conta só as parcelas (o que não se paga agora) e recusa acima do registro.
    expect(s).toMatch(/not coalesce\(\(x ->> 'is_paid'\)::boolean, false\)\) > 32767/)
    expect(s).toContain("'No máximo 32.767 parcelas (o limite do registro).'")
    const novo = s.slice(s.indexOf('array[', s.indexOf('confirmar_pagamento_do_atendimento(uuid,uuid,uuid,text,jsonb)')) + 1)
    expect(novo.slice(novo.indexOf('array['))).not.toContain('Formas demais')
  })

  it('a comanda em 30x com entrada são 31 lançamentos, e o app os manda todos', () => {
    const p: PagamentoDoPlano = { forma: 'PARCELADO', metodo: 'PIX', entrada: 100, parcelas: 30, primeiroVencimento: '2026-12-10' } as PagamentoDoPlano
    expect(recusaDaEntradaDoPagamento(p, 3100)).toBeNull()
    const ls = lancamentosDoPagamento(3100, p, 'Atendimento')
    expect(ls).toHaveLength(31)
    expect(ls.filter(l => !l.is_paid)).toHaveLength(30)
  })
})
