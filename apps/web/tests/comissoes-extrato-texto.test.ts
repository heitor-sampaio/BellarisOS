import { describe, it, expect } from 'vitest'
import { tituloDoLancamento, regraDoLancamento, csvDoExtrato } from '@/lib/comissoes/extrato-texto'
import type { LancamentoDoExtrato } from '@/lib/comissoes/leitura'
import * as nodeFs from 'node:fs'
import * as nodePath from 'node:path'

const base: LancamentoDoExtrato = {
  id: 'l1', professionalId: 'p1', branchId: 'b1', releasedAt: '2026-11-10T13:00:00Z', kind: 'LIBERACAO', motivo: null, amount: 420,
  status: 'OPEN', payoutId: null, appointmentId: null, scheduledAt: '2026-11-10T13:00:00Z', cliente: 'Beatriz Nogueira', procedimento: null,
  origem: 'PLANO_VENDA', preco: 8400, regraTipo: 'PERCENTAGE', regraValor: 5, pacote: null, descontaTaxa: false, descontaInsumos: false,
  previsto: null, baseComPontos: 'PRECO', plano: null, base: 8400, baseDesconto: 0, baseTaxa: 0, baseInsumos: 0, baseFator: 1, pagoEm: null,
  regraDe: 'CLINICA',
}

// A43 da 11ª: "Procedimento · Beatriz Nogueira" na venda do plano.
describe('A43: o título do lançamento de venda diz que é venda', () => {
  it('a venda do plano sem nome', () => {
    expect(tituloDoLancamento(base)).toBe('Venda de plano')
  })
  it('a venda do plano com nome, do pacote e do pré-pago', () => {
    expect(tituloDoLancamento({ ...base, plano: 'Harmonização', procedimento: 'Harmonização' })).toBe('Venda do plano Harmonização')
    expect(tituloDoLancamento({ ...base, origem: 'PACOTE_VENDA', pacote: '10 drenagens', procedimento: '10 drenagens' })).toBe('Venda do pacote 10 drenagens')
    expect(tituloDoLancamento({ ...base, origem: 'PRE_PAGO_VENDA', procedimento: 'Drenagem' })).toBe('Venda de procedimento: Drenagem')
  })
  it('o atendimento segue com o procedimento', () => {
    expect(tituloDoLancamento({ ...base, origem: 'AVULSO', procedimento: 'Toxina' })).toBe('Toxina')
  })
})

// A17 da 11ª: de onde veio o percentual.
describe('A17: a regra diz de onde veio', () => {
  it('da pessoa, do item, da rede', () => {
    expect(regraDoLancamento({ ...base, regraValor: 3, regraDe: 'PESSOA' }, 'Tatiane')).toBe('3% — de Tatiane')
    expect(regraDoLancamento({ ...base, origem: 'PACOTE_VENDA', regraValor: 10, regraDe: 'ITEM' }, 'Tatiane')).toBe('10% — do pacote')
    expect(regraDoLancamento({ ...base, origem: 'PRODUTO', regraValor: 10, regraDe: 'ITEM' }, 'Tatiane')).toBe('10% — do produto')
    expect(regraDoLancamento({ ...base, regraDe: 'CLINICA' }, 'Tatiane')).toBe('5% — da rede')
    expect(regraDoLancamento({ ...base, regraDe: null }, 'Tatiane')).toBe('5%')
  })
})

// A44 da 11ª: "Taxa da maquininha" e "Insumos" saíam 0,00 com a base cheia.
describe('A44: o CSV não diz 0,00 do que não sai da base', () => {
  it('a taxa e os insumos vazios quando não são descontados; com o desconto, o valor', () => {
    const csv = csvDoExtrato([base, { ...base, id: 'l2', descontaTaxa: true, baseTaxa: 6.3 }], new Map([['p1', 'Tatiane']]), new Map([['b1', 'Azaleia']]))
    // Os campos com ";" vêm entre aspas: o CSV lido como o Excel lê.
    const campos = (linha: string) => [...linha.matchAll(/("([^"]|"")*"|[^;]*)(;|$)/g)].map(m => m[1]!.replace(/^"|"$/g, '').replace(/""/g, '"')).slice(0, -1)
    const l = csv.slice(1).split('\r\n')
    const cab = campos(l[0]!)
    const iTaxa = cab.indexOf('Taxa da maquininha'), iIns = cab.indexOf('Insumos'), iRegra = cab.indexOf('Regra')
    const sem = campos(l[1]!), com = campos(l[2]!)
    expect([sem[iTaxa], sem[iIns]]).toEqual(['', ''])
    expect(com[iTaxa]).toBe('6,30')
    expect(sem[iRegra]).toBe('5% — da rede')
  })
})

describe('cada lançamento de comissão guarda o retrato da base (princípio 3, comissoes.md)', () => {
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

  // ─── O retrato da base em cada lançamento ──────────────────────────────────
  // Decisão do Claude (18/11), princípio 3 ("O que a tela mostra é o que vale na
  // conta"): todo lançamento novo guarda a base da conta da linha NA HORA em que
  // nasceu; o estorno, a da liberação que ele desfaz. Sem retrato (o antigo), o
  // extrato segue a conta de hoje (e a D5 no avulso).
  describe('o extrato diz a base da hora de cada lançamento', () => {
    it('o acerto da linha grava o retrato (e o estorno, o da liberação que desfaz)', () => {
      const m = ultimaCom('base_retrato')
      expect(m, 'nenhuma migration retrata a base do lançamento').not.toBeNull()
      expect(m!.nome >= '20261130100001').toBe(true)
      const s = sp(m!.sql)!
      expect(s).toMatch(/alter table public\.commissions add column if not exists base_retrato jsonb/)
      expect(m!.sql).toContain("'private.comissao_acertar_linha(uuid,text,uuid)'::regprocedure")
      expect(s).toMatch(/from private\.comissao_conta_detalhe\(p_linha\) d/)
      expect(s).toMatch(/where c\.line_id = p_linha and c\.amount > 0 order by c\.released_at desc, c\.id desc limit 1/)
      expect(m!.sql).toContain('create or replace function pg_temp.trocar_no_corpo')
      expect(m!.sql.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
    })
    it('o extrato (e o CSV, que sai dele) usa o retrato quando existe', () => {
      const m = ultimaCom('base_retrato')!
      const s = sp(m.sql)!
      expect(m.sql).toContain("'public.comissoes_extrato_com_regra(uuid,uuid[],timestamp with time zone,timestamp with time zone,uuid)'::regprocedure")
      expect(s).toMatch(/case when x\.base_retrato is not null then \(x\.base_retrato ->> 'base'\)::numeric/)
      for (const k of ['base_desconto', 'base_taxa', 'base_insumos', 'base_fator', 'base_fidelidade', 'preco', 'regra_valor']) {
        expect(s, k).toContain(`(x.base_retrato ->> '${k}')::numeric`)
      }
      expect(ler('lib/comissoes/leitura.ts')).toContain("rpc('comissoes_extrato_com_regra'")
    })
    it('comissoes.md diz a regra', () => {
      const t = sp(nodeFs.readFileSync(nodePath.join(WEB, '..', '..', 'docs', 'regras', 'comissoes.md'), 'utf8'))!
      expect(t).toMatch(/\*\*Cada lançamento com o RETRATO da base\*\*/)
    })
  })
})

// ─── CB-04: no fixo POR UNIDADE do produto, a linha diz a conta ─────────────
// D9 da 38ª (CB-04: "o valor ao lado da frase é a base que a conta usa de
// fato"; CB-03: no fixo o desconto não reduz a base). O Sérum a R$ 15 por
// unidade × 2 deu R$ 30, e a linha dizia "base cheia …: R$ 324,00" — o vendido,
// um número que não entra na conta.
describe('CB-04: a linha do produto em R$ por unidade não mostra a base que a conta não usa', () => {
  const nb = (s: string) => s.replace(/\s/g, ' ')
  const serum: LancamentoDoExtrato = {
    ...base, origem: 'PRODUTO', procedimento: '2× Sérum + 1× Protetor', amount: 30, preco: 324, base: 324,
    regraTipo: 'FIXED_AMOUNT', regraValor: 30, regraDe: 'ITEM', descontaTaxa: true, baseComPontos: null, itemDoProduto: { nome: 'Sérum', quantidade: 2 },
  }
  it('o fixo por unidade diz as unidades × o valor, sem a base', async () => {
    const { baseERegraDoLancamento } = await import('@/lib/comissoes/extrato-texto')
    expect(nb(baseERegraDoLancamento(serum, 'Rúbia'))).toBe('R$ 15,00 por unidade × 2 — do produto')
  })
  it('com os pontos que reduzem o fixo, a base que a conta usa aparece', async () => {
    const { baseERegraDoLancamento } = await import('@/lib/comissoes/extrato-texto')
    const comPontos = { ...serum, baseComPontos: 'VALOR_PAGO' as const, base: 300, baseDesconto: 24, baseFidelidade: 24 }
    expect(nb(baseERegraDoLancamento(comPontos, 'Rúbia'))).toContain('R$ 300,00 (R$ 324,00 − R$ 24,00 de pontos e voucher)')
  })
  it('o percentual e o fixo de um atendimento seguem com a base', async () => {
    const { baseERegraDoLancamento } = await import('@/lib/comissoes/extrato-texto')
    expect(nb(baseERegraDoLancamento({ ...serum, regraTipo: 'PERCENTAGE', regraValor: 10, amount: 32.4 }, 'Rúbia')))
      .toBe('base sem a taxa da maquininha: R$ 324,00 · 10% do vendido — do produto')
    const fixo = { ...serum, origem: 'AVULSO', itemDoProduto: null, regraDe: null, regraValor: 90, preco: 380, base: 380, procedimento: 'Peeling', baseComPontos: 'PRECO' as const }
    expect(nb(baseERegraDoLancamento(fixo, 'Rúbia'))).toBe('base cheia (sem taxa nem insumo descontados; os pontos e o voucher usados não saem dela): R$ 380,00 · R$ 90,00 fixo')
  })
  it('a tela do extrato escreve a linha por ela', () => {
    const t = nodeFs.readFileSync(nodePath.join(__dirname, '..', 'components', 'shared', 'financeiro-comissoes.tsx'), 'utf8')
    expect(t).toContain('baseERegraDoLancamento(l, nome)')
    expect(t).not.toContain('textoDaBase(base(l), l)')
  })
})

// ─── CT-02 e o princípio 4: a linha diz a taxa que valeu 0% por falta de cadastro ─
// A1 da 38ª: o crédito 8x sem taxa cadastrada valeu 0% na base (CT-02), a
// janela de receber avisou, e a linha da comissão dizia só "base sem a taxa da
// maquininha: R$ 200,00".
describe('CT-02: a linha da comissão diz a forma sem taxa cadastrada', () => {
  const nb = (s: string) => s.replace(/\s/g, ' ')
  const limpeza: LancamentoDoExtrato = {
    ...base, origem: 'AVULSO', procedimento: 'Limpeza', amount: 70, preco: 200, base: 200, regraTipo: 'PERCENTAGE', regraValor: 35,
    regraDe: null, descontaTaxa: true, baseTaxa: 0, baseComPontos: null, transacaoId: 't1',
  }
  it('a linha diz o que a janela de receber disse, curto', async () => {
    const { baseERegraDoLancamento } = await import('@/lib/comissoes/extrato-texto')
    expect(nb(baseERegraDoLancamento({ ...limpeza, semTaxaCadastrada: 'Crédito 8x' }, 'Nayara')))
      .toBe('base sem a taxa da maquininha: R$ 200,00 · sem taxa da maquininha cadastrada para o crédito 8x (vale 0%) · 35%')
    expect(nb(baseERegraDoLancamento(limpeza, 'Nayara'))).toBe('base sem a taxa da maquininha: R$ 200,00 · 35%')
  })
  it('a forma sem taxa sai do pagamento da linha e da maquininha dele (a conta de taxaNaMaquininha)', async () => {
    const { formaSemTaxaCadastrada } = await import('@/lib/comissoes/taxa-sem-cadastro')
    const stone = { id: 'm1', taxas: { 'CREDIT_CARD:3': 4.9, 'DEBIT_CARD:1': 1.8 }, cobraPorBandeira: false, porBandeira: {} }
    const pag = (metodo: string, vezes: number | null) => ({ payment_method: metodo, cartao_vezes: vezes, cartao_bandeira: null, maquininha_id: 'm1' })
    expect(formaSemTaxaCadastrada(limpeza, pag('CREDIT_CARD', 8), [stone])).toBe('Crédito 8x')
    // Com a taxa daquelas vezes, nada; no débito cadastrado, nada.
    expect(formaSemTaxaCadastrada(limpeza, pag('CREDIT_CARD', 3), [stone])).toBeNull()
    expect(formaSemTaxaCadastrada(limpeza, pag('DEBIT_CARD', null), [stone])).toBeNull()
    expect(formaSemTaxaCadastrada(limpeza, pag('DEBIT_CARD', null), [{ ...stone, taxas: {} }])).toBe('Débito')
    // O Pix não é cartão; a rede que não desconta a taxa e o R$ fixo não a usam; a taxa que saiu não é zero.
    expect(formaSemTaxaCadastrada(limpeza, pag('PIX', null), [stone])).toBeNull()
    expect(formaSemTaxaCadastrada({ ...limpeza, descontaTaxa: false }, pag('CREDIT_CARD', 8), [stone])).toBeNull()
    expect(formaSemTaxaCadastrada({ ...limpeza, regraTipo: 'FIXED_AMOUNT' }, pag('CREDIT_CARD', 8), [stone])).toBeNull()
    expect(formaSemTaxaCadastrada({ ...limpeza, baseTaxa: 6 }, pag('CREDIT_CARD', 8), [stone])).toBeNull()
    // Sem a maquininha do pagamento na lista, não se chuta (princípio 4).
    expect(formaSemTaxaCadastrada(limpeza, { ...pag('CREDIT_CARD', 8), maquininha_id: 'outra' }, [stone])).toBeNull()
  })
  it('o extrato lê o pagamento de cada linha e a maquininha dele', () => {
    const t = nodeFs.readFileSync(nodePath.join(__dirname, '..', 'lib', 'comissoes', 'leitura.ts'), 'utf8')
    expect(t).toContain('semTaxaCadastrada:')
    expect(t).toContain('formaSemTaxaCadastrada(')
    expect(t).toContain('maquininhasDaRede(')
  })
})
