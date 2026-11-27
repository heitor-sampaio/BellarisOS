import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A19 da 37ª (LU-14: recortada a uma unidade, a margem é a daquela unidade;
 * princípio 3): no recorte de uma unidade, "Procedimentos por margem" listava
 * um procedimento que só existe na outra. `metrics_margem_procedimentos_na_unidade`
 * lia todo o catálogo da rede. A régua de "a unidade oferece" é uma só
 * (`ofereceNaUnidade`, D7 da 13ª/F65): o procedimento DELA, o da rede sem
 * disponibilidade cadastrada, ou o da rede com ela na disponibilidade.
 *
 * Sem banco local: o teste lê a última migration que mexe na função.
 */
const pasta = join(__dirname, '..', '..', '..', 'supabase', 'migrations')

function ultimaQueMexe(funcao: string): string {
  const arquivos = readdirSync(pasta).filter(f => f.endsWith('.sql')).sort()
  const que = arquivos.filter(f => readFileSync(join(pasta, f), 'utf8').includes(funcao))
  expect(que.length, `alguma migration mexe em ${funcao}`).toBeGreaterThan(0)
  return readFileSync(join(pasta, que[que.length - 1]!), 'utf8')
}

describe('a margem do recorte de uma unidade', () => {
  const sql = ultimaQueMexe('metrics_margem_procedimentos_na_unidade')

  it('só lista o que a unidade oferece (a régua de ofereceNaUnidade)', () => {
    expect(sql).toMatch(/pr\.branch_id = p_unidade/)
    expect(sql).toMatch(/not exists \(select 1 from public\.procedure_branch_availability/)
    expect(sql).toMatch(/av\.branch_id = p_unidade/)
  })

  it('a migration termina recarregando o esquema', () => {
    expect(sql.trimEnd()).toMatch(/notify pgrst, 'reload schema';$/)
  })
})
