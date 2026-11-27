import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { lancamentosDoPagamento, EntradaDoPagamento, recusaDaEntradaDoPagamento } from '@/lib/checkout/lancamentos'
import { rotuloDoPagamento, valoresDoPagamento, pagamentoNormalizado, pagamentoDoRetrato, partesQuePagamAgora, type PagamentoDoPlano } from '@/lib/checkout/pagamento'
import { recusaDasOutras, valorDaPrincipal, parteVazia } from '@/lib/checkout/varias-formas'
import { estadoDoPagamento, montarPagamento, recusaDoPagamento } from '@/components/shared/campos-do-pagamento'
import * as nodeFs from 'node:fs'
import * as nodePath from 'node:path'
import { formasDaComandaEmTexto, type ComandaDoPdv } from '@/lib/pdv/situacoes'
import { contaDoTroco, recusaDoTroco, emDinheiro, emDinheiroDoEstado } from '@/lib/checkout/troco'

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
    // O cartão diz o valor de cada vez (o Heitor, 27/11, R33: "A parcela também nesses dois casos (a proposta)").
    expect(sp(v['pagamento.forma']!)).toBe('R$ 1.596,00 à vista: R$ 1.000,00 no cartão de crédito em 3x (2x de R$ 333,33 + 1x de R$ 333,34) + R$ 596,00 no Pix')
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

describe('a outra forma no cartão diz o valor da parcela, e o valor da 1ª não quebra (MQ-17)', () => {
  const tela = () => ler('components/shared/outras-formas.tsx').replace(/\r/g, '')
  it('as vezes da 2ª forma têm a dica das vezes, com o valor DELA, como a 1ª', () => {
    const t = tela()
    expect(t).toContain("import { DicaDasVezes } from '@/components/shared/resumo-das-vezes'")
    const vezes = t.slice(t.indexOf('Vezes no cartão da ${numero}ª forma'), t.indexOf('Vezes no cartão da ${numero}ª forma') + 500)
    expect(vezes).toMatch(/<DicaDasVezes total=\{valor\} vezes=\{parte\.vezes\} opcoes=\{opcoesDeVezes\} \/>/)
  })
  it('o valor da 1ª forma fica numa linha (a nota vai para baixo, não o número)', () => {
    const t = tela()
    const primeira = t.slice(t.indexOf('data-valor-da-primeira-forma'), t.indexOf('data-valor-da-primeira-forma') + 400)
    expect(primeira).toMatch(/<b style=\{\{[^}]*whiteSpace: 'nowrap'[^}]*\}\}>\{formatBRL\(Math\.max\(0, principal\)\)\}<\/b>/)
    expect(t).not.toMatch(/valorFixo = \{[^}]*overflowWrap: 'anywhere'/)
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

describe('a comanda do crediário diz a forma da entrada e a maquininha (princípio 3)', () => {
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

  // ─── a comanda do crediário diz a forma da entrada e a maquininha ─────
  const comanda = (mais: Partial<ComandaDoPdv>): ComandaDoPdv => ({
    id: 'c', numero: 1, origem: 'VENDA', abertaEm: '2026-11-18T23:00:00Z', canceladaEm: null, canceladaMotivo: null,
    clienteId: 'cl', cliente: 'Marta', agendamentoId: null, procedimento: 'Limpeza 4x', profissional: 'Sofia', agendadoPara: null,
    atendimento: null, valor: 3000, paga: true, pagaEm: '2026-11-18T23:00:00Z', recebido: 1000, forma: 'CREDIARIO', estornada: false,
    planoId: null, emAberto: 2000, parcelasEmAberto: 2, proximaParcela: null, produtos: 0, jaPago: 0,
    formas: [], desconto: 0, fidelidade: 0, voucher: null, estornoAnterior: null,
    ...mais,
  })

  describe('"Crediário" com a forma da entrada e a maquininha', () => {
    it('a entrada no crédito 3x na Cielo', () => {
      expect(sp(formasDaComandaEmTexto(comanda({
        formas: [{ forma: 'CREDIT_CARD', vezes: 3, valor: 1000, maquininha: 'Cielo' }],
      })))).toBe('Crediário (Crédito 3x · Cielo)')
    })
    it('a entrada e uma parcela já recebida, cada uma com o valor', () => {
      expect(sp(formasDaComandaEmTexto(comanda({
        formas: [{ forma: 'CREDIT_CARD', vezes: 3, valor: 1000 }, { forma: 'PIX', vezes: 1, valor: 500 }],
      })))).toBe('Crediário (Crédito 3x R$ 1.000,00 + Pix R$ 500,00)')
    })
    it('sem entrada, só "Crediário"', () => {
      expect(formasDaComandaEmTexto(comanda({ formas: [] }))).toBe('Crediário')
    })
    it('a venda paga no cartão diz a maquininha', () => {
      expect(sp(formasDaComandaEmTexto(comanda({ forma: 'CREDIT_CARD', formas: [{ forma: 'CREDIT_CARD', vezes: 2, valor: 300, maquininha: 'Stone' }] }))))
        .toBe('Crédito 2x · Stone')
    })
    it('o banco devolve as formas da venda no crediário, com a maquininha', () => {
      const m = ultimaCom('pdv_comandas')
      expect(m!.nome >= '20261130100001').toBe(true)
      expect(m!.sql).toContain("'maquininha', x.maquininha")
      // A venda no crediário também traz as formas do que já entrou (a entrada).
      expect(m!.sql).toContain("coalesce(s.v_forma, '') <> 'A_RECEBER'")
      expect(m!.sql.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
    })
    it('o nome da maquininha vem do servidor, só com mais de uma (maquininhaDoRotulo)', () => {
      const c = ler('lib/pdv/comandas.ts')
      expect(c).toContain('nomesDasMaquininhas(')
      expect(c).toContain('maquininhaDoRotulo(')
    })
  })

})

// O troco (vendas-financeiro.md): ao receber em DINHEIRO, toda tela que recebe
// pede o "Valor entregue" (opcional) e mostra o troco; o entregue menor que o
// valor avisa e não deixa confirmar. O que se grava continua sendo o valor do
// pagamento (o entregue não vai ao servidor).
describe('a conta do troco', () => {
  it('sem o valor entregue, nada a dizer nem a recusar (o campo é opcional)', () => {
    expect(contaDoTroco(80, '')).toEqual({ situacao: 'sem-entregue' })
    expect(recusaDoTroco(80, '  ')).toBeNull()
  })
  it('entregue maior: o troco, em centavos', () => {
    expect(contaDoTroco(80, '100')).toEqual({ situacao: 'troco', troco: 20 })
    expect(contaDoTroco(79.9, '100,00')).toEqual({ situacao: 'troco', troco: 20.1 })
    expect(recusaDoTroco(80, '100')).toBeNull()
  })
  it('entregue igual: sem troco', () => {
    expect(contaDoTroco(80, '80,00')).toEqual({ situacao: 'troco', troco: 0 })
    expect(recusaDoTroco(80, '80')).toBeNull()
  })
  it('entregue menor: avisa e recusa, dizendo quanto falta', () => {
    expect(contaDoTroco(80, '50')).toEqual({ situacao: 'menor', falta: 30 })
    expect(recusaDoTroco(80, '50')).toMatch(/O valor entregue \(R\$\s50,00\) é menor que os R\$\s80,00 em dinheiro: faltam R\$\s30,00\./)
  })
  it('o que não se lê é recusa, não zero', () => {
    expect(contaDoTroco(80, '1,400.50').situacao).toBe('ilegivel')
    expect(recusaDoTroco(80, '1,400.50')).toMatch(/Valor não entendido/)
  })
  it('sem nada em dinheiro, o entregue não conta', () => {
    expect(recusaDoTroco(0, '10')).toBeNull()
    expect(contaDoTroco(0, '10')).toEqual({ situacao: 'sem-entregue' })
  })
})

describe('quanto do pagamento é em dinheiro', () => {
  const parte = (metodo: string, valor: string) => ({ metodo, valor, vezes: 1, bandeira: '', maquininha: '' })
  it('a 1ª forma em dinheiro com o que falta das outras, mais as outras em dinheiro', () => {
    expect(emDinheiro('CASH', 80)).toBe(80)
    expect(emDinheiro('PIX', 80)).toBe(0)
    expect(emDinheiro('PIX', 50, [parte('CASH', '30')])).toBe(30)
    expect(emDinheiro('CASH', 50, [parte('PIX', '30'), parte('CASH', '20')])).toBe(70)
  })
  it('do estado dos campos: o à vista e a entrada do crediário', () => {
    const base = { forma: 'AVISTA' as const, metodo: 'CASH', entrada: '', outras: [] }
    expect(emDinheiroDoEstado(base, 200)).toBe(200)
    // Com outra forma, a 1ª fica com o que falta.
    expect(emDinheiroDoEstado({ ...base, outras: [parte('PIX', '120')] }, 200)).toBe(80)
    expect(emDinheiroDoEstado({ ...base, forma: 'PARCELADO', entrada: '100,00' }, 900)).toBe(100)
    expect(emDinheiroDoEstado({ ...base, forma: 'PARCELADO', entrada: '' }, 900)).toBe(0)
    expect(emDinheiroDoEstado({ ...base, forma: 'A_RECEBER', metodo: '' }, 900)).toBe(0)
    expect(emDinheiroDoEstado({ ...base, metodo: 'PIX' }, 200)).toBe(0)
  })
})

// As portas do dinheiro (o comportamento é de tela; sem navegador, o fonte):
// cada uma mostra o mesmo campo e trava o botão pela mesma recusa.
describe('toda tela que recebe pede o valor entregue no dinheiro', () => {
  const fonte = (arq: string) => readFileSync(join(__dirname, '..', arq), 'utf8')
  const portas = [
    'components/shared/campos-do-pagamento.tsx',       // comanda do atendimento e a Nova venda
    'components/shared/receber-no-cartao.tsx',         // receber no Financeiro e na ficha
    'components/shared/pdv/parcelas-em-aberto.tsx',    // receber a parcela no PDV
    'components/branch/checkout-wizard.tsx',           // receber o plano no PDV
    // A tela do atendimento saiu na 28ª: não recebe mais o plano (o Heitor, 13/11,
    // PV-01: "o pagamento acontece por dentro desse PDV, seja do que for"; AT-13, PV-13).
  ]
  for (const arq of portas) {
    it(`${arq}: o CampoDoTroco e a recusaDoTroco`, () => {
      const f = fonte(arq)
      expect(f).toContain('<CampoDoTroco')
      expect(f).toMatch(/recusaDoTroco\(/)
    })
  }
  it('o recusaDoPagamento dos campos trava pelo troco (vale para toda tela que os usa)', () => {
    const f = fonte('components/shared/campos-do-pagamento.tsx')
    expect(f).toMatch(/recusaDoTroco\(emDinheiroDoEstado\(e, total\), e\.entregue/)
  })
  it('o entregue não vai ao servidor: montarPagamento não o lê', () => {
    const f = fonte('components/shared/campos-do-pagamento.tsx')
    const montar = f.slice(f.indexOf('export function montarPagamento'), f.indexOf('export function recusaDoPagamento'))
    expect(montar).not.toContain('entregue')
  })
})
