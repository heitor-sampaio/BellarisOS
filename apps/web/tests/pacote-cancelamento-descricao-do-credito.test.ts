import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * R43 (o Heitor, 28/11: "Pode corrigir, e o teste aceita a troca de trecho (a
 * proposta)"). Princípio 7: o crédito do cancelamento saía "Cancelamento do pacote Pacote
 * Drenagem 5 sessões (4 sessões)" — o nome do pacote já começa com "Pacote".
 * O nome vai entre aspas, como o sistema já escreve os nomes ("Voucher “X”",
 * "Plano “X”"): o pacote e o plano (o plano sem nome é "Plano de tratamento").
 */
const DIR = join(__dirname, '..', '..', '..', 'supabase', 'migrations')

describe('a descrição do crédito do cancelamento põe o nome entre aspas', () => {
  const arquivo = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()
    .filter(f => readFileSync(join(DIR, f), 'utf8').includes("'Cancelamento do pacote “'"))
  it('uma migration troca a descrição no corpo vivo do pacote e do plano', () => {
    expect(arquivo.length).toBeGreaterThan(0)
    const sql = readFileSync(join(DIR, arquivo[arquivo.length - 1]!), 'utf8')
    expect(sql).toContain("'public.pacote_cancelar_devolvendo(")
    expect(sql).toContain("'public.plano_cancelar_devolvendo(")
    expect(sql).toContain("'Cancelamento do pacote “' || coalesce(v_nome, '') || '” ('")
    expect(sql).toContain("'Cancelamento do plano “' || v_nome || '” ('")
    expect(sql.trimEnd().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
})
