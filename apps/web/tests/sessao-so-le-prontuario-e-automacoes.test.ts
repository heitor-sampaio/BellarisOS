import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A sessão só LÊ — e o dado de um módulo, só com o módulo (CLAUDE.md §4, F63;
 * a varredura de 18/11: ATD-P01, ATD-P02, ATD-E01, AUT-01). O prontuário,
 * módulo escopável ("só os meus"), não se lê pela sessão de jeito nenhum:
 * "Toda leitura de módulo escopável passa ownerFilter" (§11) e "Realtime de
 * tela que mostra dado com escopo assina um SINAL" (§4). A prova de banco
 * é `e2e/rls-sessao-so-le-prontuario-e-automacoes.spec.ts` (o token de um
 * membro); este teste trava o texto das migrations, para uma política de
 * escrita não voltar por descuido numa edição delas.
 */

const MIGRATIONS = join(__dirname, '..', '..', '..', 'supabase', 'migrations')
const SINAL = readFileSync(join(MIGRATIONS, '20261124400001_sessao_ve_o_modulo_e_sinais.sql'), 'utf-8')
const POLITICAS = readFileSync(join(MIGRATIONS, '20261124400002_sessao_so_le_prontuario_procedimentos_estoque_automacoes.sql'), 'utf-8')

const DO_PRONTUARIO = ['medical_records', 'medical_record_entries', 'injectable_maps', 'injectable_applications']
const AUTOMACOES = ['domain_events', 'automation_runs', 'automation_run_steps', 'automations', 'automation_versions']
const TODAS = [...DO_PRONTUARIO, ...AUTOMACOES, 'procedures', 'procedure_products', 'products']

/** As políticas que a migration CRIA na tabela: [nome, comando, corpo]. */
function criadas(sql: string, tabela: string): { nome: string; corpo: string }[] {
  const re = new RegExp(`create policy\\s+("?[\\w ]+"?)\\s+on public\\.${tabela}\\b([\\s\\S]*?);`, 'g')
  return [...sql.matchAll(re)].map(m => ({ nome: m[1]!, corpo: m[2]! }))
}

describe('a sessão só lê o prontuário, os procedimentos, os produtos e as automações', () => {
  it('nenhuma política de escrita (nem ALL) nasce nas doze tabelas: só a de leitura, to authenticated', () => {
    for (const t of TODAS) {
      for (const p of criadas(POLITICAS, t)) {
        expect(p.corpo, `${t}.${p.nome}`).toMatch(/for select to authenticated/)
      }
    }
  })

  it('as políticas de escrita e o ALL de antes saem', () => {
    for (const nome of [
      '"Operacional acessa prontuários" on public.medical_records',
      'medical_record_entries_operacional on public.medical_record_entries',
      'injectable_maps_all on public.injectable_maps',
      'injectable_maps_insert on public.injectable_maps',
      'injectable_maps_update on public.injectable_maps',
      'injectable_maps_delete on public.injectable_maps',
      'injectable_applications_all on public.injectable_applications',
      'procedures_insert on public.procedures',
      'procedures_update on public.procedures',
      'procedures_delete on public.procedures',
      'procedure_products_insert on public.procedure_products',
      'procedure_products_update on public.procedure_products',
      'procedure_products_delete on public.procedure_products',
      '"Operacional acessa estoque da filial" on public.products',
    ]) expect(POLITICAS).toContain(`drop policy if exists ${nome};`)
  })

  // A sessão só lê SINAIS (o Heitor, 2026-11-19, "vai na 2"; CLAUDE.md §4): a
  // leitura das automações pela sessão, que esta migration abria com o módulo e
  // "A rede inteira", saiu na 20261128200002 — as telas leem pelo servidor.
  it('o prontuário não ganha política nenhuma (a tabela fecha, como as comissões); a leitura das automações pela sessão saiu (a sessão só lê sinais)', () => {
    for (const t of DO_PRONTUARIO) {
      expect(criadas(POLITICAS, t), `${t}: nenhuma política para a sessão`).toEqual([])
      expect(POLITICAS, t).not.toMatch(new RegExp(`(create|alter) policy[^;]*on public\\.${t}\\b`))
    }
    const SO_SINAIS = readFileSync(join(MIGRATIONS, '20261128200002_a_sessao_so_le_sinais_sem_leitura.sql'), 'utf-8')
    for (const t of AUTOMACOES) {
      for (const p of criadas(POLITICAS, t)) {
        expect(SO_SINAIS, `${t}.${p.nome}`).toContain(`drop policy if exists ${p.nome} on public.${t};`)
      }
    }
  })

  it('a corrente, as execuções e a evolução saem do Realtime; as telas escutam os sinais', () => {
    for (const t of ['domain_events', 'automation_runs', 'medical_record_entries']) {
      expect(POLITICAS).toMatch(new RegExp(`alter publication supabase_realtime drop table public\\.${t};`))
    }
    for (const sinal of ['automacoes_sinais', 'prontuario_sinais']) {
      expect(SINAL).toMatch(new RegExp(`alter publication supabase_realtime add table public\\.${sinal};`))
      expect(SINAL).toMatch(new RegExp(`create policy ${sinal}_select on public\\.${sinal}\\s+for select to authenticated`))
      for (const restritiva of ['suporte_sem_escrita_ins', 'suporte_sem_escrita_upd', 'suporte_sem_escrita_del']) {
        expect(SINAL).toContain(`create policy ${restritiva} on public.${sinal} as restrictive`)
      }
    }
    // O sinal do prontuário é uma linha por REDE: não diz o atendimento nem a cliente.
    expect(SINAL).toMatch(/create table if not exists public\.prontuario_sinais \(\s+tenant_id uuid primary key[^,]*,\s+mudou_em\s+timestamptz not null default now\(\)\s+\);/)
    expect(SINAL).toMatch(/after insert or update or delete on public\.medical_record_entries/)
    for (const pagina of ['app/admin/automacoes/page.tsx', 'app/admin/automacoes/eventos/page.tsx']) {
      const texto = readFileSync(join(__dirname, '..', pagina), 'utf-8')
      expect(texto, pagina).toContain("tables={['automacoes_sinais']}")
    }
    const atendimento = readFileSync(join(__dirname, '..', 'app/_shared/sessao-de-atendimento.tsx'), 'utf-8')
    // A agenda também vem por sinal desde 19/11 (o Heitor, "vai na 2": a
    // sessão só lê sinais) — o tópico `agenda` de `public.sinais`.
    expect(atendimento).toContain("tables={['prontuario_sinais', 'financeiro_sinais']} topicos={['agenda']}")
  })

  it('a função da leitura confere o cargo GRAVADO (nunca a claim role) e não abre à anon', () => {
    expect(SINAL).toContain("tr.key = 'NETWORK_ADMIN' and tr.is_system")
    expect(SINAL).toContain('u.is_active')
    expect(SINAL).toContain('private.rede_tem_recurso(')
    expect(SINAL).toMatch(/revoke execute on function private\.sessao_ve_o_modulo\(text, text, boolean\) from public, anon;/)
    expect(SINAL.trimEnd()).toMatch(/notify pgrst, 'reload schema';$/)
    expect(POLITICAS.trimEnd()).toMatch(/notify pgrst, 'reload schema';$/)
  })
})
