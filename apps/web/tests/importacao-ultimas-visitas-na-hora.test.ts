import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A "Última visita" importada aparece na lista na hora (o princípio 3 e
 * CLAUDE.md §14: o cache expira com `{ expire: 0 }`). A importação expirava só
 * `clients:`; a última visita mora em `getCachedUltimasVisitas` (tag
 * `appointments:`, 5 minutos), e a lista oscilava entre "Sem visitas" e a data.
 * E `ultimas_visitas` recortava a visita de antes por `clients.branch_id`
 * (CLAUDE.md §14: nada se decide por ele — a cliente é da rede).
 */
const RAIZ = join(__dirname, '..')
const fonte = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8')
const MIGRATIONS = join(RAIZ, '..', '..', 'supabase', 'migrations')
const ultimaQueCita = (trecho: string) => {
  const nomes = readdirSync(MIGRATIONS).filter(n => n.endsWith('.sql')).sort()
  for (let i = nomes.length - 1; i >= 0; i--) {
    const sql = readFileSync(join(MIGRATIONS, nomes[i]!), 'utf8')
    if (sql.includes(trecho)) return { nome: nomes[i]!, sql }
  }
  throw new Error(`nenhuma migration cita ${trecho}`)
}

describe('a lista de clientes vê a última visita importada na hora', () => {
  it('a importação concluída expira também a tag das últimas visitas, com expire: 0', () => {
    expect(fonte('actions/importacao.ts')).toMatch(/revalidateTag\(`appointments:\$\{ctx\.tenantId!\}`, \{ expire: 0 \}\)/)
  })
  it('ultimas_visitas não recorta a visita de antes por clients.branch_id', () => {
    const { nome, sql } = ultimaQueCita(`'public.ultimas_visitas(uuid,uuid)'::regprocedure`)
    expect(sql, nome).toContain('$t$and (p_branch is null or c.branch_id = p_branch)$t$')
    expect(sql.trimEnd().endsWith(`notify pgrst, 'reload schema';`), nome).toBe(true)
  })
})
