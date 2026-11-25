import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A comissão em R$ fixo do produto vale POR UNIDADE: a venda grava a regra vezes a quantidade
 * (`produto_vender_itens`: `round(comissao_valor * quantity, 2)` em `commissions.rule_value`, e o valor em
 * `commissions.amount`). Sem o teto de 100 unidades (o Heitor, 25/11: "Se não for impossível, ainda que
 * improvável, pode ser feito."), R$ 10 por unidade em 100.001 unidades já não cabia em numeric(10,4) — e o
 * banco recusava a VENDA, em inglês, por causa da coluna da comissão. Cada valor que a rede escolheu cabe;
 * é o total derivado que estourava. Decisão do Claude, 25/11 (princípio 2): as colunas do que se deriva
 * crescem, com as mesmas casas (o arredondamento da gravação continua o mesmo).
 */
const DIR = join(__dirname, '..', '..', '..', 'supabase', 'migrations')
const migration = () => {
  const f = readdirSync(DIR).filter(n => n.endsWith('.sql')).find(n => /comissao_da_venda_cabe_no_registro/.test(n))
  return f ? readFileSync(join(DIR, f), 'utf8') : ''
}

describe('a comissão de uma venda grande cabe no registro', () => {
  it('rule_value e amount da comissão crescem, com as mesmas casas', () => {
    const m = migration()
    expect(m, 'a migration existe').not.toBe('')
    expect(m).toMatch(/alter table public\.commissions[\s\S]*alter column rule_value type numeric\(20,\s*4\)/i)
    expect(m).toMatch(/alter column amount type numeric\(20,\s*2\)/i)
    expect(m.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
  it('a regra (o valor por unidade que a rede digita) não muda: o limite dela é o da tela', () => {
    expect(migration()).not.toMatch(/alter table public\.commission_rules/i)
  })
})
