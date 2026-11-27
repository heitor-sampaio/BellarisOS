import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * D3 da 35ª (PL-19, "Pago R$ X"; princípio 3): o plano de R$ 910 pago com
 * R$ 860 de crédito interno e R$ 50 no Pix dizia "Recebido R$ 50" na página e
 * "Pago R$ 50" no app. O `recebido` de `metrics_financeiro_do_plano` saía de
 * `metrics_receitas_pagas`, que deixa o crédito interno de fora — o certo para
 * a RECEITA (CI-03, VE-05), não para o que pagou o plano. O pago do plano é o
 * movimento pago dele (`metrics_movimentos_pagos`, a mesma conta de estornos),
 * com o crédito interno; a receita não muda.
 */

const MIGRATIONS = join(__dirname, '..', '..', '..', 'supabase', 'migrations')
const ultimaQueMexeNoPlano = () => {
  const nomes = readdirSync(MIGRATIONS).filter(n => n.endsWith('.sql')).sort()
  const com = nomes.filter(n => readFileSync(join(MIGRATIONS, n), 'utf8').includes('metrics_financeiro_do_plano'))
  return readFileSync(join(MIGRATIONS, com[com.length - 1]!), 'utf8')
}

describe('D3: o pago do plano conta o crédito interno', () => {
  it('o recebido sai do movimento pago do plano, não da receita', () => {
    const m = ultimaQueMexeNoPlano()
    expect(m).toMatch(/metrics_movimentos_pagos\(p_tenant, null, '2000-01-01'::timestamptz, 'infinity'::timestamptz\) t\s+where t\.type = 'INCOME' and t\.treatment_plan_id in \(select id from plano\)/)
    expect(m).toContain('pg_temp.trocar_no_corpo')
  })
  it('a receita (metrics_receitas_pagas) não muda', () => {
    expect(ultimaQueMexeNoPlano()).not.toMatch(/create or replace function public\.metrics_receitas_pagas/i)
  })
})
