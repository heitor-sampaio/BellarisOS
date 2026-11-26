import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * D1 da 31ª simulação (2026-11-26): 1 pote de alginato (1000 g) do lote A0, a
 * R$ 0,11/g, foi para Itajaí — e a transferência valeu R$ 119,99 nos Relatórios
 * e R$ 120,00 nas Movimentações, quando o lote custa R$ 110,00 (ES-29: "ao custo
 * do lote que saiu"; ES-18: "o lote transferido herda o custo do de origem").
 *
 * Duas causas, no banco:
 * - `estoque_transferir` grava as duas pernas sem `unit_cost`, e quem lê o custo
 *   do movimento (`custo_do_movimento`, as Movimentações) cai no último custo
 *   (R$ 0,12/g × 1000 = R$ 120,00). A transferência passa a gravar o custo dos
 *   lotes que a saída tira (o mesmo FEFO do gatilho do lote), por unidade de
 *   consumo, como o consumo e o ajuste já gravam.
 * - `metrics_transferencias_de_estoque` somava a quantidade da ligação ao lote
 *   (`stock_movement_batches.quantity`, em EMBALAGENS: 1) vezes o custo do lote
 *   por unidade de CONSUMO (R$ 0,11/g), e o resto (1000 − 1 = 999 g) ao último
 *   custo: 1 × 0,11 + 999 × 0,12 = R$ 119,99. A ligação vai × o rendimento.
 *
 * As transferências gravadas antes (decisão do Claude, 26/11; princípio 4, nada
 * de chutar): a que tem os lotes de origem ligados, cobrindo a quantidade
 * inteira e todos com custo, ganha o custo deles; a outra fica como está (vale o
 * último custo, ES-18: "a parte que nenhum lote cobre usa o último custo").
 */
const DIR = join(__dirname, '..', '..', '..', 'supabase', 'migrations')
const migration = () => {
  const f = readdirSync(DIR).filter(n => n.endsWith('.sql')).find(n => /estoque_transferencia_ao_custo_do_lote/.test(n))
  return f ? readFileSync(join(DIR, f), 'utf8') : ''
}

describe('a transferência vale o custo do lote que saiu', () => {
  it('a transferência grava nas duas pernas o custo dos lotes que a saída tira', () => {
    const m = migration()
    expect(m, 'a migration existe').not.toBe('')
    expect(m).toContain("'public.estoque_transferir(uuid,uuid,uuid,numeric,text,text)'::regprocedure")
    expect(m).toContain('private.custo_da_saida_pelos_lotes(p_produto, p_origem, p_quantidade)')
    expect(m).toContain('notes, reference, created_by, unit_cost)')
    expect(m).toMatch(/v_ref, p_autor, v_custo\)/)
  })
  it('o custo da saída segue o FEFO do gatilho do lote e vem por unidade de consumo', () => {
    const m = migration()
    expect(m).toMatch(/create or replace function private\.custo_da_saida_pelos_lotes\(p_produto uuid, p_unidade uuid, p_embalagens numeric\)/)
    // A mesma ordem do on_stock_movement_lotes: o válido que vence antes, os vencidos depois.
    expect(m).toContain("order by coalesce((b.expires_at at time zone 'UTC')::date < (now() at time zone public.fuso_da_unidade(b.branch_id))::date, false),")
    expect(m).toMatch(/v_soma := v_soma \+ v_tira \* v_fator \* v_custo/)
    expect(m).toMatch(/revoke all on function private\.custo_da_saida_pelos_lotes\(uuid, uuid, numeric\) from public, anon, authenticated/)
  })
  it('a métrica das transferências multiplica a ligação ao lote pelo rendimento', () => {
    const m = migration()
    expect(m).toMatch(/create or replace function public\.metrics_transferencias_de_estoque/)
    expect(m).toContain('abs(smb.quantity) * public.fator_de_consumo(p) * coalesce(public.custo_do_lote(smb.batch_id)')
    expect(m).not.toMatch(/sum\(abs\(smb\.quantity\) \* coalesce\(public\.custo_do_lote/)
  })
  it('as transferências de antes ganham o custo dos lotes ligados, sem passar pela Auditoria', () => {
    const m = migration()
    expect(m).toContain('alter table public.stock_movements disable trigger auditoria_upd;')
    expect(m).toContain('alter table public.stock_movements enable trigger auditoria_upd;')
    expect(m).toMatch(/where s\.type = 'TRANSFER_OUT' and s\.unit_cost is null/)
    expect(m.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
})
