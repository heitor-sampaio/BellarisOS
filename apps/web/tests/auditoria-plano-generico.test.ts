import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * O gatilho da Auditoria (`private.auditar`) roda em TODA gravação de 88
 * tabelas. Com o plano personalizado do PL/pgSQL, a consulta grande dele era
 * replanejada a cada chamada: 1,7 ms por comando contra 0,1 ms sem o gatilho,
 * e o banco cedeu sob a completa de 14–15/11 duas vezes. Com
 * `plan_cache_mode = force_generic_plan` na função, 0,54 ms.
 *
 * Um `create or replace function private.auditar` novo troca a configuração
 * da função e o ajuste some calado: a última migration que mexe nela tem de
 * trazê-lo.
 */
const DIR = path.resolve(__dirname, '../../../supabase/migrations')

describe('o gatilho da Auditoria usa o plano genérico', () => {
  it('a última migration que define ou altera private.auditar() fixa plan_cache_mode = force_generic_plan', () => {
    const mexem = fs.readdirSync(DIR)
      .filter(n => n.endsWith('.sql'))
      .sort()
      .filter(n => /(create\s+or\s+replace\s+function|alter\s+function)\s+private\.auditar\s*\(/i.test(fs.readFileSync(path.join(DIR, n), 'utf8')))
    expect(mexem.length).toBeGreaterThan(0)
    const ultima = mexem[mexem.length - 1]!
    const sql = fs.readFileSync(path.join(DIR, ultima), 'utf8')
    expect(sql, `${ultima} mexe em private.auditar() sem o plano genérico`).toMatch(/plan_cache_mode\s*=\s*force_generic_plan/i)
  })
})
