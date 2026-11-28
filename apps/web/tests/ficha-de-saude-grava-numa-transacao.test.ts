import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * CLAUDE.md §14: "Escrever no banco fora de transação quando duas gravações
 * precisam valer juntas (padrão: o app calcula, uma função grava)".
 *
 * Responder a ficha de saúde grava a ficha no prontuário E fecha o pendente da
 * cliente. Eram duas idas ao banco: se a segunda falhasse, a ficha ficava
 * gravada e o pendente aberto (a cliente seria chamada a responder de novo).
 * O app monta a ficha; a função `pre_atendimento_gravar_ficha_de_saude` grava
 * as duas coisas numa transação só.
 */
const raiz = join(__dirname, '..', '..', '..')
const ficha = readFileSync(join(__dirname, '..', 'lib/pre-atendimento/ficha.ts'), 'utf8').replace(/\r/g, '')
const pasta = join(raiz, 'supabase/migrations')
const migration = readdirSync(pasta)
  .filter(n => n.endsWith('.sql'))
  .map(n => readFileSync(join(pasta, n), 'utf8').replace(/\r/g, ''))
  .find(t => /create or replace function public\.pre_atendimento_gravar_ficha_de_saude\(/.test(t))

describe('a ficha de saúde respondida se grava numa transação', () => {
  it('o app grava pela função, não em duas idas', () => {
    expect(ficha).toMatch(/\.rpc\('pre_atendimento_gravar_ficha_de_saude'/)
    expect(ficha).not.toMatch(/from\('medical_records'\)\.upsert\(/)
  })

  it('a função grava o prontuário e fecha o pendente, e só o servidor a chama', () => {
    expect(migration).toBeDefined()
    const sql = migration!
    expect(sql).toMatch(/insert into public\.medical_records/)
    expect(sql).toMatch(/on conflict \(client_id\) do update/)
    expect(sql).toMatch(/update public\.pre_atendimentos/)
    // A cliente é da rede que chama.
    expect(sql).toMatch(/from public\.clients\s+where id = p_client and tenant_id = p_tenant/)
    expect(sql).toMatch(/revoke execute on function public\.pre_atendimento_gravar_ficha_de_saude\([^)]*\) from public, anon, authenticated/)
    expect(sql).toMatch(/grant execute on function public\.pre_atendimento_gravar_ficha_de_saude\([^)]*\) to service_role/)
    expect(sql).toMatch(/notify pgrst, 'reload schema';/)
  })
})
