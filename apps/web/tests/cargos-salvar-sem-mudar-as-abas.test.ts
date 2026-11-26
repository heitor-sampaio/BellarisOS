import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A26 da 34ª simulação (princípio 3: o que a tela mostra é o que vale): cada
 * "Salvar acessos" do cargo, mesmo sem mexer nas abas de Relatórios, saía na
 * Auditoria como "Mudou os acessos do cargo X (N abas de relatório…)" — a
 * `salvar_matriz_do_cargo` apagava todas as abas e as criava de novo. Salvar
 * sem mudar as abas não mexe nelas: sai só a aba desmarcada, entra só a nova.
 */
const PASTA = join(__dirname, '..', '..', '..', 'supabase', 'migrations')
const migrations = readdirSync(PASTA).filter(f => f.endsWith('.sql')).sort()
const ler = (f: string) => readFileSync(join(PASTA, f), 'utf8')

describe('A26: salvar o cargo sem mudar as abas não as recria', () => {
  const ultima = [...migrations].reverse().find(f => /public\.salvar_matriz_do_cargo/.test(ler(f)) && /role_report_tabs/.test(ler(f)))
  const sql = ultima ? ler(ultima) : ''

  it('a última migration que mexe nas abas da função não apaga todas antes de inserir', () => {
    expect(ultima).toBeDefined()
    // O que sai: só as abas que não vieram.
    expect(sql).toMatch(/delete from role_report_tabs where tenant_id = p_tenant and role_id = p_role\s+and tab <> all\(coalesce\(p_abas, '\{\}'::text\[\]\)\);/)
    // O que entra: só as que faltam.
    expect(sql).toMatch(/select p_tenant, p_role, t from unnest\(coalesce\(p_abas, '\{\}'::text\[\]\)\) as t\s+on conflict \(role_id, tab\) do nothing;/)
    expect(sql.trimEnd().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })

  it('a função segue fechada à sessão', () => {
    expect(sql).toMatch(/revoke execute on function public\.salvar_matriz_do_cargo\(uuid, uuid, jsonb, text, text\[\]\) from public, anon, authenticated;/)
    expect(sql).toMatch(/grant\s+execute on function public\.salvar_matriz_do_cargo\(uuid, uuid, jsonb, text, text\[\]\) to service_role;/)
  })
})
