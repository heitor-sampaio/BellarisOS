import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * A troca do responsável e o evento da linha do tempo ("Responsável: de X para
 * Y") valem juntos (CLAUDE.md §14: "Escrever no banco fora de transação quando
 * duas gravações precisam valer juntas" — o app calcula, uma função grava). Eram
 * duas gravações seguidas: o responsável trocado aparecia antes de o evento
 * existir (a completa de 26/11 pegou o `e2e/crm-responsavel.spec.ts:103` lendo
 * o responsável novo e nenhum OWNER_CHANGED), e uma falha no meio deixava a
 * troca sem registro.
 */
const raiz = resolve(__dirname, '..', '..', '..')
const pasta = resolve(raiz, 'supabase', 'migrations')
const migration = readdirSync(pasta).find(f => f.endsWith('_troca_de_responsavel_numa_transacao.sql'))

describe('a troca do responsável e o evento numa transação só', () => {
  it('a função grava o responsável e o OWNER_CHANGED juntos, só para o servidor', () => {
    expect(migration, 'a migration').toBeTruthy()
    const sql = readFileSync(resolve(pasta, migration!), 'utf8')
    expect(sql).toMatch(/create or replace function public\.lead_trocar_responsavel\(/)
    expect(sql).toMatch(/update public\.leads[\s\S]*owner_id = p_usuario/)
    expect(sql).toMatch(/insert into public\.lead_events[\s\S]*'OWNER_CHANGED'/)
    expect(sql).toMatch(/revoke all on function public\.lead_trocar_responsavel\([^)]*\) from public, anon, authenticated/)
    expect(sql).toMatch(/grant execute on function public\.lead_trocar_responsavel\([^)]*\) to service_role/)
    expect(sql).toMatch(/notify pgrst, 'reload schema';\s*$/)
  })

  it('o trocarResponsavelCore chama a função, e não grava as duas à parte', () => {
    const fonte = readFileSync(resolve(__dirname, '..', 'lib/crm/responsavel.ts'), 'utf8')
    const corpo = fonte.slice(fonte.indexOf('export async function trocarResponsavelCore'))
    expect(corpo).toMatch(/\.rpc\('lead_trocar_responsavel'/)
    expect(corpo).not.toMatch(/\.from\('leads'\)\.update\(\{ owner_id/)
    expect(corpo).not.toMatch(/registrarEventoLead\(/)
  })
})
