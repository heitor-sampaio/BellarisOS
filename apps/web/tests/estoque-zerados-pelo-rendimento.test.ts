import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * D6: Relatórios → Estoque contava "Produtos zerados 1" onde o Estoque dizia
 * "Sem estoque 0" (ES-20: "'Sem estoque' é o produto sem saldo positivo no
 * recorte… uma conta de produtos igual no Estoque e nos Relatórios").
 *
 * O ácido tinha 8 ml (`current_rendimento`) e `current_stock` 0. O Estoque
 * conta pelo saldo que mostra — o rendimento, quando o produto tem unidade de
 * consumo (`situacaoDoEstoque`, `lib/estoque/situacao.ts`); `metrics_relatorio`
 * contava os zerados pelas embalagens (`current_stock > 0`), no total e na
 * linha de cada unidade. A régua passa a ser a da tela: `saldo_de_consumo`
 * (o rendimento; sem unidade de consumo, as embalagens), com as 4 casas que a
 * tela arredonda (`quase`).
 */
const DIR = join(__dirname, '..', '..', '..', 'supabase', 'migrations')
const migration = () => {
  const f = readdirSync(DIR).filter(n => n.endsWith('.sql')).find(n => /^202612122\d{5}_estoque_zerados_pelo_rendimento\.sql$/.test(n))
  return f ? readFileSync(join(DIR, f), 'utf8') : ''
}

describe('D6: os zerados dos Relatórios pela régua do Estoque', () => {
  it('a migration troca no corpo vivo de metrics_relatorio, conferindo a contagem', () => {
    const m = migration()
    expect(m, 'a migration existe').not.toBe('')
    expect(m).toContain("'public.metrics_relatorio(uuid,uuid[],timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,text,text,uuid,text[])'::regprocedure")
    expect(m).toMatch(/create or replace function pg_temp\.trocar_no_corpo/)
    expect(m.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
  it('o total: o produto sem saldo POSITIVO (pelo rendimento) em nenhuma unidade do recorte', () => {
    const m = migration()
    expect(m).toContain('and sz.current_stock > 0)),')
    expect(m).toContain('and round(public.saldo_de_consumo(sz, pz), 4) > 0)),')
  })
  it('a linha de cada unidade: o produto sem saldo positivo NELA, pela mesma régua', () => {
    const m = migration()
    expect(m).toContain('count(*) filter (where current_stock <= 0 and is_active is distinct from false) zerados,')
    expect(m).toContain('count(*) filter (where not positivo and is_active is distinct from false) zerados,')
    expect(m).toMatch(/round\(public\.saldo_de_consumo\(s, pr\), 4\) > 0, false\) as positivo/)
  })
})
