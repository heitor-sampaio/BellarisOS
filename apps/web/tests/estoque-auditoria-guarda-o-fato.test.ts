import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * D9 da 31ª simulação (2026-11-26; Auditoria em `docs/regras/plataforma.md`,
 * princípio 3): a perda e o inventário não diziam o que aconteceu. A Auditoria
 * guarda do movimento de estoque só o rótulo e os valores do gatilho
 * (`private.auditar`: no INSERT, `depois` = rótulo + valores) — o produto, o
 * tipo, a quantidade, o custo e a correção de cadastro. Sem o MOTIVO da perda e
 * o SALDO depois, a frase não tinha como dizer "perda de 2 frascos (Vencido)" nem
 * "o inventário ajustou de 970 g para 950 g". O gatilho passa a guardar os dois
 * (o saldo antes é o depois menos a quantidade). A frase é da Auditoria
 * (`lib/auditoria/frase.ts`).
 */
const DIR = join(__dirname, '..', '..', '..', 'supabase', 'migrations')
const migration = () => {
  const f = readdirSync(DIR).filter(n => n.endsWith('.sql')).find(n => /auditoria_do_estoque_guarda_motivo_e_saldo/.test(n))
  return f ? readFileSync(join(DIR, f), 'utf8') : ''
}

describe('a Auditoria do estoque guarda o motivo da perda e o saldo depois', () => {
  it('os três gatilhos do movimento guardam motivo_da_perda e balance_after', () => {
    const m = migration()
    expect(m, 'a migration existe').not.toBe('')
    const valores = "private.auditar('normal', 'product_id', 'type,quantity,unit_cost,correcao_de_cadastro,motivo_da_perda,balance_after', '', '')"
    expect(m.split(valores).length - 1).toBe(3)
    for (const t of ['auditoria_ins', 'auditoria_upd', 'auditoria_del']) expect(m).toContain(`drop trigger if exists ${t} on public.stock_movements;`)
    expect(m.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
})
