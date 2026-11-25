import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Sem CPF, a linha da importação acha quem já existe pela ficha SEM CPF do
 * mesmo telefone (docs/regras/crm-inbox.md, "Quem já existe só tem o VAZIO
 * completado"). Com duas fichas sem CPF no telefone (a Edna e a Filomena), a
 * linha da Filomena achava a MAIS ANTIGA — a da Edna —, na prévia
 * (`importacao_cruzamento`) e na gravação (`cliente_por_telefone`), embora a
 * ficha da própria Filomena existisse. Entre as fichas sem CPF do telefone,
 * vale a de mesmo nome (sem acento, sem caixa, sem espaço a mais —
 * `private.sem_acento`, como o `nomeDiferente` da prévia); sem ela, a mais
 * antiga, como antes (o "Completar a ficha de X" segue igual).
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
const MESMO_NOME = /private\.sem_acento\(c\.name\)/

describe('a importação sem CPF prefere a ficha do mesmo nome no telefone', () => {
  it('a prévia (importacao_cruzamento) recebe o nome da linha e ordena pela ficha do mesmo nome antes da mais antiga', () => {
    const { nome, sql } = ultimaQueCita('public.importacao_cruzamento(uuid,text,jsonb)')
    expect(sql, nome).toContain('email text, nome text)')
    expect(sql, nome).toMatch(MESMO_NOME)
    expect(sql, nome).toMatch(/desc, c\.created_at/)
    expect(sql.trimEnd().endsWith(`notify pgrst, 'reload schema';`), nome).toBe(true)
  })

  it('a gravação (cliente_por_telefone) recebe o nome e ordena pela ficha do mesmo nome antes da mais antiga', () => {
    const { nome, sql } = ultimaQueCita('function public.cliente_por_telefone(')
    expect(sql, nome).toMatch(/p_nome text default null/i)
    expect(sql, nome).toMatch(MESMO_NOME)
    expect(sql, nome).toMatch(/desc, c\.created_at/)
    // A assinatura nova não deixa a velha ao lado (o PostgREST não escolhe entre duas).
    expect(sql, nome).toMatch(/drop function if exists public\.cliente_por_telefone\(uuid, text, boolean\)/i)
    expect(sql, nome).toMatch(/revoke execute on function public\.cliente_por_telefone\(uuid, text, boolean, text\) from public, anon, authenticated/i)
    expect(sql, nome).toMatch(/grant execute on function public\.cliente_por_telefone\(uuid, text, boolean, text\) to service_role/i)
    expect(sql.trimEnd().endsWith(`notify pgrst, 'reload schema';`), nome).toBe(true)
  })

  it('a gravação manda o nome da linha', () => {
    expect(fonte('lib/importacao/processar.ts')).toMatch(/rpc\('cliente_por_telefone', \{[^}]*p_nome: /)
  })

  it('a prévia manda o nome de cada linha ao cruzamento', () => {
    expect(fonte('actions/importacao.ts')).toMatch(/nome: texto\(l\.name\)/)
    expect(fonte('components/branch/importador-de-contatos.tsx')).toMatch(/name: \(l\.dados\.name as string \| undefined\) \?\? undefined/)
  })
})
