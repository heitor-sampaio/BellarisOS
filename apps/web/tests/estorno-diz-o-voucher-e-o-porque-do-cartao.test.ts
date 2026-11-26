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
 * do banco ao estorno parcial do cartão dizia o que fazer, não o porquê.
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

describe('A19: a recusa do estorno parcial no cartão diz o porquê', () => {
  const pasta = join(WEB, '../../supabase/migrations')
  const nome = readdirSync(pasta).find(f => /^202612104\d{5}_estorno_do_cartao_diz_o_porque\.sql$/.test(f))
  const sql = nome ? readFileSync(join(pasta, nome), 'utf8').replace(/\r/g, '') : ''
  it('a migration existe, na faixa da área', () => {
    expect(nome, 'supabase/migrations/202612104…_estorno_do_cartao_diz_o_porque.sql').toBeTruthy()
  })
  it('troca a frase nas funções que recusam, sem tirar o começo (os E2E o conferem)', () => {
    // O pacote e o plano ficam de fora: tests/comissoes-base-efetiva.test.ts trava a migration mais nova que os cita.
    for (const f of ['public.procedimento_cancelar_unidade_devolvendo(', 'private.recebiveis_do_cartao_acompanham(',
      'public.produto_devolver_itens(']) {
      expect(sql, f).toContain(`'${f}`)
    }
    expect(sql).toContain('No cartão, o estorno é do pagamento inteiro (a operadora não estorna só uma parte):')
    expect(sql).toMatch(/trocar_no_corpo/)
    expect(sql.trimEnd()).toMatch(/notify pgrst, 'reload schema';$/)
  })
})
