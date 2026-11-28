import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-02 (recomendação do Claude aprovada pelo Heitor, 13/11: "concordo"): "o ganho é sobre o valor pago,
 * depois do voucher e dos pontos usados". No atendimento AVULSO, no modo "por procedimento", a base dos
 * pontos contava o voucher e os pontos usados (`loyalty_discount`) como dinheiro pago: a Massagem de R$ 140
 * (55 pontos) paga R$ 125 com um voucher de R$ 15 dava 55, e não 49 (55 × 125 ÷ 140).
 *
 * A conta passa a ser a do pacote e do plano (os ramos irmãos da mesma função): os pontos × o dinheiro que
 * entrou ÷ o preço vendido. O desconto comercial (`sale_discount`) fica fora do preço vendido, como no pacote
 * e no plano (o preço vendido já é o com desconto) — ele não tira pontos; o voucher e os pontos tiram.
 * O crédito interno segue fora do pago (GA-07: já pontuou na venda dele).
 */

const MIGRATIONS = join(__dirname, '..', '..', '..', 'supabase', 'migrations')
const achada = readdirSync(MIGRATIONS)
  .filter(n => n.endsWith('.sql') && n >= '20261221100001' && n <= '20261221199999')
  .map(n => ({ nome: n, sql: readFileSync(join(MIGRATIONS, n), 'utf8') }))
  .find(m => m.sql.includes("'public.fidelidade_pontos_do_pagamento(public.financial_transactions, public.loyalty_configs)'::regprocedure"))

/** Os trechos $t$…$t$ da troca, na ordem: de[0..n-1], para[0..n-1]. */
function trechos(sql: string): string[] {
  return [...sql.matchAll(/\$t\$([\s\S]*?)\$t\$/g)].map(m => m[1]!)
}

describe('os pontos do atendimento avulso no modo "por procedimento"', () => {
  it('uma migration troca a base do avulso no corpo da função', () => {
    expect(achada, 'nenhuma migration da faixa 202612211 troca o corpo de fidelidade_pontos_do_pagamento').toBeTruthy()
    expect(achada!.sql).toContain('create or replace function pg_temp.trocar_no_corpo')
    expect(achada!.sql.trimEnd().endsWith("notify pgrst, 'reload schema';")).toBe(true)
    expect(achada!.sql).not.toMatch(/create policy/i)
  })

  it('o voucher e os pontos usados saem da base; o desconto comercial sai do preço vendido', () => {
    const t = trechos(achada!.sql)
    expect(t.length % 2).toBe(0)
    const de = t.slice(0, t.length / 2).join('\n')
    const para = t.slice(t.length / 2).join('\n')
    // O que sai: a soma que contava o loyalty_discount como pago e o alvo sobre o preço de tabela.
    expect(de).toContain('coalesce(sum(f.amount + coalesce(f.loyalty_discount, 0) + coalesce(f.sale_discount, 0)), 0)')
    expect(de).toContain('least(v_cob, v_total) / v_total')
    // O que entra: nada do loyalty_discount; o alvo é o pago sobre o preço vendido (o de tabela menos o desconto).
    expect(para).not.toContain('loyalty_discount')
    expect(para).toContain('sale_discount')
    expect(para).toMatch(/least\(v_pago, v_total - v_cob\) \/ \(v_total - v_cob\)/)
    // Pago todo pelo desconto comercial: nada a dividir, nenhum ponto.
    expect(para).toMatch(/when v_total - v_cob > 0/)
  })

  it('o desconto comercial do atendimento conta mesmo com a parcela ainda em aberto, e nunca o do estornado', () => {
    const t = trechos(achada!.sql)
    const para = t.slice(t.length / 2).join('\n')
    // O desconto mora no PRIMEIRO lançamento (no crediário ele pode estar a receber): o preço vendido não
    // depende de qual parcela já foi paga.
    const sub = para.match(/\(select sum\(coalesce\(d\.sale_discount[\s\S]*?into v_pago, v_cob/)?.[0] ?? ''
    expect(sub, 'o desconto sai de uma subconsulta própria').not.toBe('')
    expect(sub).not.toMatch(/is_paid/)
    expect(sub).toMatch(/estorno_de is null/)
    expect(sub).toMatch(/<> 'Estornada'/)
  })

  it('não vira "a migration do ligado em" (tests/fidelidade-config.test.ts acha a mais nova com v_ligado)', () => {
    expect(achada!.sql).not.toContain('v_ligado')
  })
})
