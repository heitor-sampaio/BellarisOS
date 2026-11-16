import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { lancamentosDoPagamento, EntradaDoPagamento, recusaDaEntradaDoPagamento } from '@/lib/checkout/lancamentos'
import { rotuloDoPagamento, valoresDoPagamento, pagamentoNormalizado, pagamentoDoRetrato, partesQuePagamAgora, type PagamentoDoPlano } from '@/lib/checkout/pagamento'
import { recusaDasOutras, valorDaPrincipal, parteVazia } from '@/lib/checkout/varias-formas'
import { estadoDoPagamento, montarPagamento, recusaDoPagamento } from '@/components/shared/campos-do-pagamento'

/**
 * As duas decisões do Heitor de 2026-11-16:
 * - "A comanda recebe em mais de uma forma?" → "Ok" (D1 da 18ª): o "+ Outra
 *   forma", com o valor de cada uma, na comanda do atendimento, da venda e do plano;
 * - "Crediário no atendimento avulso" → "Mesma regra de pagamentos dos outros":
 *   a comanda do atendimento oferece as formas da venda, o crediário e o a receber.
 * O que é de tela e banco está em `e2e/pdv-varias-formas-e-crediario-avulso.spec.ts`.
 */

const WEB = join(__dirname, '..')
const RAIZ = join(WEB, '..', '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8')
const migration = (trecho: string) => {
  const pasta = join(RAIZ, 'supabase', 'migrations')
  const nome = readdirSync(pasta).filter(n => n.includes(trecho)).sort().pop()
  return nome ? readFileSync(join(pasta, nome), 'utf8') : ''
}
const sp = (s: string) => s.replace(/\s/g, ' ')

const DIVIDIDO: PagamentoDoPlano = {
  forma: 'AVISTA', metodo: 'CREDIT_CARD', vezes: 3, bandeira: 'VISA', valor: 1000,
  outras: [{ metodo: 'PIX', valor: 596 }],
}

describe('D1 da 18ª: a comanda recebe em mais de uma forma', () => {
  it('cada forma é um lançamento pago, com as vezes e a bandeira dela', () => {
    const ls = lancamentosDoPagamento(1596, DIVIDIDO, 'Pacote')
    expect(ls.map(l => [l.amount, l.payment_method, l.is_paid, l.cartao_vezes ?? 1, l.cartao_bandeira ?? null])).toEqual([
      [1000, 'CREDIT_CARD', true, 3, 'VISA'],
      [596, 'PIX', true, 1, null],
    ])
  })

  it('o servidor lê as outras formas e recusa a soma que não fecha o total', () => {
    expect(EntradaDoPagamento.safeParse(DIVIDIDO).success).toBe(true)
    expect(recusaDaEntradaDoPagamento(DIVIDIDO, 1596)).toBeNull()
    expect(recusaDaEntradaDoPagamento(DIVIDIDO, 1600)).toMatch(/não fecham o total/)
    expect(recusaDaEntradaDoPagamento({ ...DIVIDIDO, outras: [{ metodo: 'PIX', valor: 0 }], valor: 1596 }, 1596)).toMatch(/valor de cada forma/)
  })

  it('as vezes de cada parte no cartão se conferem (a parte paga agora)', () => {
    expect(partesQuePagamAgora(DIVIDIDO).map(p => [p.metodo, p.vezes, p.valor])).toEqual([['CREDIT_CARD', 3, 1000], ['PIX', 1, 596]])
    expect(partesQuePagamAgora({ forma: 'AVISTA', metodo: 'PIX' }, 300).map(p => p.valor)).toEqual([300])
  })

  it('o texto diz as formas com o valor de cada uma (a linha do tempo e o contrato)', () => {
    expect(sp(rotuloDoPagamento(DIVIDIDO))).toBe('Crédito 3x R$ 1.000,00 + Pix R$ 596,00')
    const v = valoresDoPagamento(DIVIDIDO, 1596)
    expect(sp(v['pagamento.forma']!)).toBe('R$ 1.596,00 à vista: R$ 1.000,00 no cartão de crédito em 3x + R$ 596,00 no Pix')
  })

  it('o retrato do contrato guarda as formas, e o de antes segue igual', () => {
    expect(pagamentoNormalizado({ forma: 'AVISTA', metodo: 'PIX' })).toEqual({ forma: 'AVISTA', metodo: 'PIX' })
    const r = pagamentoNormalizado(DIVIDIDO)
    expect(r).toMatchObject({ forma: 'AVISTA', metodo: 'CREDIT_CARD', vezes: 3, valor: 100000 })
    expect(pagamentoDoRetrato(r)).toMatchObject({ forma: 'AVISTA', metodo: 'CREDIT_CARD', valor: 1000, outras: [{ metodo: 'PIX', valor: 596 }] })
  })

  it('na tela: a primeira forma fica com o que falta; a outra sem forma ou sem valor não segue', () => {
    expect(valorDaPrincipal(1596, [{ ...parteVazia(), metodo: 'PIX', valor: '596,00' }])).toBe(1000)
    expect(recusaDasOutras([{ ...parteVazia(), valor: '100' }], 1596)).toBe('Escolha a forma de cada parte.')
    expect(recusaDasOutras([{ ...parteVazia(), metodo: 'PIX', valor: '' }], 1596)).toBe('Digite o valor de cada forma.')
    expect(recusaDasOutras([{ ...parteVazia(), metodo: 'PIX', valor: '1.596,00' }], 1596)).toMatch(/já fecham o total/)
    expect(recusaDasOutras([{ ...parteVazia(), metodo: 'PIX', valor: '596' }], 1596)).toBeNull()

    const e = { ...estadoDoPagamento(null, 'AVISTA'), metodo: 'CREDIT_CARD', vezes: 3, outras: [{ ...parteVazia(), metodo: 'PIX', valor: '596' }] }
    expect(recusaDoPagamento(e, 1596)).toBeNull()
    expect(montarPagamento(e, 1596)).toMatchObject({ forma: 'AVISTA', metodo: 'CREDIT_CARD', vezes: 3, valor: 1000, outras: [{ metodo: 'PIX', valor: 596 }] })
    expect(recusaDoPagamento({ ...e, outras: [{ ...parteVazia(), valor: '596' }] }, 1596)).toBe('Escolha a forma de cada parte.')
  })

  it('a venda com pontos ou voucher aceita as formas divididas (o primeiro lançamento leva a fidelidade)', () => {
    const m = migration('20261121000001')
    expect(m, 'a migration das várias formas').toMatch(/create or replace function public\.venda_com_fidelidade/i)
    expect(m).not.toMatch(/jsonb_array_length\(v_l\) <> 1/)
    expect(m).toMatch(/create or replace function public\.plano_checkout_com_fidelidade/i)
  })
})

describe('Crediário no atendimento avulso: a mesma regra das vendas', () => {
  it('o "Receber" da comanda do atendimento oferece o crediário, o a receber e o "+ Outra forma"', () => {
    const tela = ler('components/shared/receber-atendimento.tsx')
    expect(tela).toMatch(/<CamposDoPagamento/)
    expect(tela).toMatch(/'PARCELADO'/)
    expect(tela).toMatch(/'A_RECEBER'/)
    expect(tela).toMatch(/variasFormas/)
  })

  it('confirmPayment monta os lançamentos pela regra das vendas', () => {
    const acao = ler('actions/appointments.ts')
    expect(acao).toMatch(/EntradaDoPagamento\.safeParse/)
    expect(acao).toMatch(/lancamentosDoPagamento\(/)
    expect(acao).toMatch(/recusaDasVezesDoPagamento\(/)
  })

  it('o banco grava cada lançamento do atendimento numa transação, e cobra só o que falta', () => {
    const m = sp(migration('20261121000001'))
    expect(m).toMatch(/create or replace function public\.confirmar_pagamento_do_atendimento/i)
    expect(m).toMatch(/p_dados -> 'lancamentos'/)
    // A comanda reaberta pelo estorno de UMA forma cobra só a parte estornada.
    expect(m).toMatch(/v_ja/)
    // A comissão do avulso olha todos os lançamentos vivos do atendimento (H4: o crediário espera a última parcela).
    expect(m).toMatch(/create or replace function private\.comissao_conta_detalhe/i)
    expect(m).toMatch(/create or replace function private\.comissao_base_do_pagamento/i)
    expect(m).toMatch(/create or replace function public\.atendimentos_a_receber/i)
    expect(m).toMatch(/create or replace function public\.pdv_comandas/i)
    expect(m).toMatch(/notify pgrst, 'reload schema'/)
  })

  it('as parcelas do avulso aparecem na comanda e no PDV da cliente', () => {
    const parcelas = ler('lib/pdv/parcelas-da-cliente.ts')
    expect(parcelas).not.toMatch(/\.is\('appointment_id', null\)/)
    expect(ler('app/_shared/pdv.tsx')).toMatch(/appointment_id/)
  })

  it('o valor cobrado do atendimento soma as formas (não fica só com a última)', () => {
    expect(ler('lib/appointments/valor-cobrado.ts')).toMatch(/anterior/)
  })
})

describe('o banco aceita vários lançamentos vivos do mesmo atendimento', () => {
  // A chave única por atendimento (20261028000201) recusava a 2ª forma e as
  // parcelas do crediário avulso com 23505 — a trava contra pagar duas vezes é
  // a da função (o agendamento travado e o que falta receber).
  it('a última migration que mexe em financial_transactions_appointment_id_key a desfaz e deixa um índice comum', () => {
    const pasta = join(RAIZ, 'supabase', 'migrations')
    const nome = readdirSync(pasta).filter(n => n.endsWith('.sql')).sort()
      .filter(n => readFileSync(join(pasta, n), 'utf8').includes('financial_transactions_appointment_id_key')).pop()!
    const sql = readFileSync(join(pasta, nome), 'utf8')
    expect(sql).toMatch(/drop index if exists public\.financial_transactions_appointment_id_key/)
    expect(sql).not.toMatch(/create unique index[^;]*financial_transactions_appointment_id_key/i)
    expect(sql).toMatch(/create index if not exists financial_transactions_appointment_vivo/)
  })
})
