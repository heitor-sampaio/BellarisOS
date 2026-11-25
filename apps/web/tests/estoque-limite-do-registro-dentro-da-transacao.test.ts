import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A entrada e a transferência conferem no app o que o registro não guarda (a quantidade e o saldo depois do
 * movimento, numeric(10,4): 999.999,9999 — `lib/estoque/limites-do-registro.ts`; o Heitor, 25/11: "Se não for
 * impossível, ainda que improvável, pode ser feito."). Mas o app lê o saldo ANTES da transação: com duas
 * entradas ao mesmo tempo, a segunda passava da conferência e o banco recusava em inglês ("numeric field
 * overflow"). As duas funções já travam o saldo (`for update`); a mesma conferência vai para dentro delas,
 * depois do saldo novo calculado. Decisão do Claude, 25/11.
 */
const DIR = join(__dirname, '..', '..', '..', 'supabase', 'migrations')
const migration = () => {
  const f = readdirSync(DIR).filter(n => n.endsWith('.sql')).find(n => /estoque_limite_do_registro_dentro_da_transacao/.test(n))
  return f ? readFileSync(join(DIR, f), 'utf8') : ''
}

describe('o limite do registro do estoque vale dentro da transação', () => {
  it('a entrada confere a quantidade e o saldo depois, já com o saldo travado', () => {
    const m = migration()
    expect(m, 'a migration existe').not.toBe('')
    expect(m).toContain("'public.estoque_entrada(uuid,uuid,numeric,numeric,text,text,timestamptz,text,text,text,text)'::regprocedure")
    expect(m).toMatch(/p_quantidade \* v_fator > 999999\.9999 or coalesce\(v_novo_rend, v_novo_saldo\) > 999999\.9999/)
  })
  it('a transferência confere o saldo do destino', () => {
    const m = migration()
    expect(m).toContain("'public.estoque_transferir(uuid,uuid,uuid,numeric,text,text)'::regprocedure")
    expect(m).toMatch(/coalesce\(v_para_rend, v_para_novo\) > 999999\.9999/)
  })
  it('a recusa é em português e diz o limite; recarrega o esquema', () => {
    const m = migration()
    expect(m).toContain('(o limite do registro)')
    expect(m.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
})
