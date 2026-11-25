import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  recusaDoAjusteDePontos, avisoDoAjusteDePontos, lerPontosDoProcedimento, avisoDosPontosDoProcedimento,
} from '@/lib/fidelidade/pontos-acima-do-comum'

/**
 * O Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser
 * feito." O ajuste manual de pontos ia até 1.000.000 ("Valor de pontos fora do
 * limite."), e os pontos do procedimento também ("Pontos de fidelidade
 * inválidos.").
 *
 * Decisão do Claude, 25/11: acima de 1.000.000 (o antigo teto) a tela avisa e
 * o servidor grava. O impossível é o registro:
 * - os pontos do ajuste e do procedimento são `integer` (`p_pontos`,
 *   `loyalty_transactions.points`, `procedures.loyalty_points`): até
 *   2.147.483.647; e a fração;
 * - o saldo (`saldo_de_pontos`) também é `integer`: o crédito que o faria
 *   passar disso é recusado no banco, com a mensagem dele;
 * - os pontos de UM pagamento (os do procedimento × as unidades da venda, ou o
 *   valor × os pontos por real) também caem num `integer`: acima, o pagamento
 *   diz isso, em vez do "integer out of range" do banco.
 */

const APP = join(__dirname, '..')
const ler = (p: string) => readFileSync(join(APP, p), 'utf8')
const NO_REGISTRO = 'No máximo 2.147.483.647 pontos (o limite do registro).'

describe('o ajuste manual de pontos: acima de 1.000.000 avisa', () => {
  it('grava 2.000.000 (a crédito e a débito), com o aviso', () => {
    expect(recusaDoAjusteDePontos(2_000_000)).toBeNull()
    expect(recusaDoAjusteDePontos(-2_000_000)).toBeNull()
    expect(avisoDoAjusteDePontos(2_000_000)).toBe('Acima do comum (mais de 1.000.000 pontos). Confira: o valor vale como está.')
    expect(avisoDoAjusteDePontos(-2_000_000)).toBe('Acima do comum (mais de 1.000.000 pontos). Confira: o valor vale como está.')
    expect(avisoDoAjusteDePontos(1_000_000)).toBeNull()
  })
  it('o impossível continua recusado: zero, fração e acima do registro', () => {
    expect(recusaDoAjusteDePontos(0)).toBe('Informe quantos pontos creditar ou debitar.')
    expect(recusaDoAjusteDePontos(Number.NaN)).toBe('Informe quantos pontos creditar ou debitar.')
    expect(recusaDoAjusteDePontos(1.5)).toBe('Os pontos são um número inteiro.')
    expect(recusaDoAjusteDePontos(2_147_483_647)).toBeNull()
    expect(recusaDoAjusteDePontos(2_147_483_648)).toBe(NO_REGISTRO)
    expect(recusaDoAjusteDePontos(-2_147_483_648)).toBe(NO_REGISTRO)
  })
  it('a action usa a mesma conta, sem o 1.000.000 nem o "fora do limite"', () => {
    const acao = ler('actions/fidelidade.ts')
    expect(acao).toMatch(/recusaDoAjusteDePontos\(/)
    expect(acao).not.toMatch(/1_000_000/)
    expect(acao).not.toMatch(/fora do limite/)
    // A fração era cortada em silêncio (Math.trunc): 1,5 virava 1.
    expect(acao).not.toMatch(/Math\.trunc\(Number\(entrada\?\.pontos\)\)/)
  })
  it('a tela do ajuste mostra o aviso ao lado do campo', () => {
    const tela = ler('components/branch/fidelidade-do-cliente.tsx')
    expect(tela).toMatch(/avisoDoAjusteDePontos\(/)
    expect(tela).toMatch(/data-acima-do-comum="ajuste-de-pontos"/)
  })
})

describe('os pontos do procedimento: acima de 1.000.000 avisa', () => {
  it('a leitura do campo: vazio é sem pontos; 2.000.000 grava, com o aviso', () => {
    expect(lerPontosDoProcedimento('')).toEqual({ pontos: null })
    expect(lerPontosDoProcedimento('  ')).toEqual({ pontos: null })
    expect(lerPontosDoProcedimento('0')).toEqual({ pontos: 0 })
    expect(lerPontosDoProcedimento('2000000')).toEqual({ pontos: 2_000_000 })
    expect(avisoDosPontosDoProcedimento(2_000_000)).toBe('Acima do comum (mais de 1.000.000 pontos). Confira: o valor vale como está.')
    expect(avisoDosPontosDoProcedimento(1_000_000)).toBeNull()
  })
  it('o impossível: negativo, fração e acima do registro, cada um com a sua mensagem', () => {
    expect(lerPontosDoProcedimento('-1')).toEqual({ erro: 'Os pontos de fidelidade são um número inteiro, de zero para cima.' })
    expect(lerPontosDoProcedimento('1.5')).toEqual({ erro: 'Os pontos de fidelidade são um número inteiro, de zero para cima.' })
    expect(lerPontosDoProcedimento('dez')).toEqual({ erro: 'Os pontos de fidelidade são um número inteiro, de zero para cima.' })
    expect(lerPontosDoProcedimento('2147483647')).toEqual({ pontos: 2_147_483_647 })
    expect(lerPontosDoProcedimento('2147483648')).toEqual({ erro: NO_REGISTRO })
  })
  it('a action usa a mesma leitura, sem o 1.000.000', () => {
    const acao = ler('actions/procedures.ts')
    expect(acao).toMatch(/lerPontosDoProcedimento\(/)
    expect(acao).not.toMatch(/1_000_000/)
  })
  it('o cadastro do procedimento mostra o aviso ao lado do campo', () => {
    const tela = ler('components/admin/procedure-form.tsx')
    expect(tela).toMatch(/avisoDosPontosDoProcedimento\(/)
    expect(tela).toMatch(/data-acima-do-comum="pontos-do-procedimento"/)
  })
})

describe('o banco: o saldo até o limite do registro', () => {
  const pasta = join(APP, '..', '..', 'supabase', 'migrations')
  const nome = readdirSync(pasta).find(n => n.startsWith('20261207400001'))
  const sql = nome ? readFileSync(join(pasta, nome), 'utf8') : ''

  it('a migration nova existe e recarrega o esquema', () => {
    expect(nome, 'a migration 20261207400001').toBeTruthy()
    expect(sql.trimEnd().endsWith(`notify pgrst, 'reload schema';`)).toBe(true)
    expect(sql).not.toMatch(/create policy/i)
  })
  it('o ajuste recusa o crédito que passaria o saldo do integer', () => {
    expect(sql).toContain('public.ajustar_pontos(uuid, uuid, uuid, integer, text, text)')
    expect(sql).toMatch(/saldo_de_pontos\(p_cliente\)::bigint \+ p_pontos > 2147483647/)
    expect(sql).toContain('O saldo passaria de 2.147.483.647 pontos (o limite do registro)')
  })
  // Os pontos de UM pagamento (os do procedimento × as unidades, ou o valor × os pontos por real) e o saldo
  // depois do ganho: a conta em bigint e a recusa clara, no lugar do "integer out of range" do banco.
  it('os pontos de um pagamento: a conta em bigint, a recusa clara acima do integer', () => {
    expect(sql).toMatch(/create or replace function private\.pontos_no_registro\(p_pontos numeric\)/)
    expect(sql).toContain('Os pontos deste pagamento passam de 2.147.483.647 (o limite do registro).')
    expect(sql).toContain("'public.fidelidade_pontos_do_pagamento(public.financial_transactions, public.loyalty_configs)'::regprocedure")
    expect(sql).toMatch(/revoke all on function private\.pontos_no_registro\(numeric\) from public, anon, authenticated/)
  })
  it('o ganho que passaria o saldo do integer recusa, como o ajuste', () => {
    expect(sql).toContain("'public.on_transaction_loyalty_earn()'::regprocedure")
    expect(sql).toMatch(/saldo_de_pontos\(new\.client_id\)::bigint \+ v_pontos > 2147483647/)
  })
})
