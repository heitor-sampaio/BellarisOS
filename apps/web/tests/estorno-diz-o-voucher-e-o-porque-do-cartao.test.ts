import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { textoDosPontosDoEstorno } from '@/lib/fidelidade/pontos-do-estorno'

/**
 * O estorno diz, antes, o que acontece (princípio 3).
 *
 * D8 (Fidelidade ES-01/ES-02: a janela diz "o voucher que volta a valer"): o
 * estorno do pagamento feito com um voucher o devolve a ativo
 * (`estornar_transacao`: `used_transaction_id = p_transacao` → ATIVO), mas a
 * janela só dizia isso no pagamento de R$ 0. A linha do voucher entra em todo
 * estorno que o devolve.
 *
 * A19 (EX-06: "No cartão, a operadora estorna o pagamento inteiro"): a recusa
 * do banco ao estorno parcial do cartão dizia o que fazer, não o porquê. A 32ª
 * pôs o porquê; o Heitor, 26/11, na página de perguntas (R08): "Não precisa
 * dessa explicação." — a frase volta à de antes.
 */

const WEB = join(__dirname, '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8').replace(/\r/g, '')
const base = { ligada: true, cliente: 'Fátima', ganhos: 0, usados: 0, saldo: 80, premio: null }

describe('D8: a janela do estorno diz o voucher que volta a valer', () => {
  it('só o voucher: a linha dele', () => {
    expect(textoDosPontosDoEstorno({ ...base, voucherDoPagamento: 'Drenagem grátis' }))
      .toBe('O voucher “Drenagem grátis”, usado neste pagamento, volta a valer para Fátima.')
  })
  it('o voucher junto dos pontos que saem', () => {
    expect(textoDosPontosDoEstorno({ ...base, ganhos: 60, saldo: 80, voucherDoPagamento: 'Drenagem grátis' }))
      .toBe('Saem 60 pontos de Fátima, os que este pagamento deu: o saldo dela vai de 80 a 20 pontos. O voucher “Drenagem grátis”, usado neste pagamento, volta a valer para Fátima.')
  })
  it('com a fidelidade desligada, nada (ES-02)', () => {
    expect(textoDosPontosDoEstorno({ ...base, ligada: false, voucherDoPagamento: 'Drenagem grátis' })).toBeNull()
  })
  it('a action lê o voucher usado no pagamento (o mesmo que o estorno devolve)', () => {
    const t = ler('actions/financial.ts')
    const corpo = t.slice(t.indexOf('export async function pontosDoEstorno'), t.indexOf('export async function reaberturaDoEstorno'))
    expect(corpo).toContain(".from('loyalty_vouchers')")
    expect(corpo).toMatch(/\.eq\('used_transaction_id', transactionId\)/)
    expect(corpo).toMatch(/\.eq\('status', 'USADO'\)/)
    expect(corpo).toMatch(/voucherDoPagamento:/)
  })
})

// R08 (o Heitor, 26/11, na página de perguntas: "Não precisa dessa explicação."): a recusa do
// estorno parcial no cartão volta a "No cartão, o estorno é do pagamento inteiro:", sem o porquê.
describe('R08: a recusa do estorno parcial no cartão NÃO diz o porquê', () => {
  const pasta = join(WEB, '../../supabase/migrations')
  const PORQUE = 'a operadora não estorna só uma parte'
  const nome = readdirSync(pasta).find(f => /^202612111\d{5}_estorno_do_cartao_sem_o_porque\.sql$/.test(f))
  const sql = nome ? readFileSync(join(pasta, nome), 'utf8').replace(/\r/g, '') : ''
  it('a migration existe, na faixa da área', () => {
    expect(nome, 'supabase/migrations/202612111…_estorno_do_cartao_sem_o_porque.sql').toBeTruthy()
  })
  it('volta a frase de antes nas três funções que recusam, pelo corpo vivo', () => {
    for (const f of ['public.procedimento_cancelar_unidade_devolvendo(', 'private.recebiveis_do_cartao_acompanham(',
      'public.produto_devolver_itens(']) {
      expect(sql, f).toContain(`'${f}`)
    }
    expect(sql).toContain(`de   text := 'No cartão, o estorno é do pagamento inteiro (${PORQUE}):';`)
    expect(sql).toContain(`para text := 'No cartão, o estorno é do pagamento inteiro:';`)
    expect(sql).toMatch(/create or replace function pg_temp\.trocar_no_corpo/)
    expect(sql.trimEnd()).toMatch(/notify pgrst, 'reload schema';$/)
  })
  it('é a última migration que cita o porquê (nenhuma depois o põe de volta)', () => {
    const citam = readdirSync(pasta).filter(f => f.endsWith('.sql')).sort()
      .filter(f => readFileSync(join(pasta, f), 'utf8').includes(PORQUE))
    expect(citam.at(-1)).toBe(nome)
  })
  it('nem o código nem a regra dizem o porquê', () => {
    for (const arq of ['components/shared/escolha-da-devolucao.tsx', '../../docs/regras/vendas-financeiro.md', '../../docs/catalogo/vendas-financeiro.md']) {
      expect(ler(arq), arq).not.toContain(PORQUE)
    }
  })
})
