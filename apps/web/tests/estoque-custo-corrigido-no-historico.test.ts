import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A13 da 31ª simulação (2026-11-26; princípio 3): depois do "Corrigir custo" do
 * lote (A10 da 24ª), o Histórico da entrada mostrava só o custo novo — sem o
 * antigo nem a marca de que foi corrigido. `estoque_corrigir_custo_do_lote`
 * sobrescreve o `unit_cost` da entrada, e o movimento não guardava o de antes
 * (só a Auditoria). Agora a entrada guarda o custo de ANTES da primeira correção
 * e quando foi corrigida (`custo_corrigido_de`, `custo_corrigido_em`), e o
 * Histórico diz "Custo corrigido de X para Y". As corrigidas antes ganham o de
 * antes da Auditoria (a edição do custo da entrada, depois de gravada).
 */
const ler = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8')
const DIR = join(__dirname, '..', '..', '..', 'supabase', 'migrations')
const migration = () => {
  const f = readdirSync(DIR).filter(n => n.endsWith('.sql')).find(n => /estoque_custo_corrigido_no_historico/.test(n))
  return f ? readFileSync(join(DIR, f), 'utf8') : ''
}

describe('o Histórico diz que o custo da entrada foi corrigido, de quanto para quanto', () => {
  it('a entrada guarda o custo de antes da primeira correção e quando foi corrigida', () => {
    const m = migration()
    expect(m, 'a migration existe').not.toBe('')
    expect(m).toMatch(/add column if not exists custo_corrigido_de numeric/)
    expect(m).toMatch(/add column if not exists custo_corrigido_em timestamp with time zone/)
    expect(m).toContain("'public.estoque_corrigir_custo_do_lote(uuid,uuid,numeric)'::regprocedure")
    expect(m).toContain('custo_corrigido_de = coalesce(custo_corrigido_de, unit_cost), custo_corrigido_em = now()')
    expect(m).toContain('alter table public.stock_movements disable trigger auditoria_upd;')
    expect(m.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })

  it('o histórico lê a correção e a tela a mostra', () => {
    const acoes = ler('actions/stock.ts')
    expect(acoes).toMatch(/custo_corrigido_de, custo_corrigido_em/)
    expect(acoes).toMatch(/custoCorrigido:/)
    const modal = ler('components/admin/admin-stock-manage-modal.tsx')
    expect(modal).toContain('data-custo-corrigido')
    expect(modal).toMatch(/Custo corrigido de/)
  })
})
