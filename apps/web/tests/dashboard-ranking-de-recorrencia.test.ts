import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { rankingDaRecorrencia } from '@/lib/metrics/recorrencia'

/**
 * D16 da 28ª: o "Ranking — Recorrência" listava clientes com "0 atend." (na
 * unidade recortada) e dizia "sem dados" na rede: saía do ranking de GASTO
 * (`metrics_top_clients`, as 10 que mais pagaram), não das que mais vieram.
 * Princípio 3: recorrência é quem mais voltou — conta os atendimentos
 * concluídos no recorte, só quem tem ao menos um, a mesma conta na rede e na
 * unidade (`metrics_recorrencia_das_clientes`).
 */
const RAIZ = join(__dirname, '..', '..', '..')
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('o ranking de recorrência das clientes', () => {
  it('não lista quem tem 0 atendimentos, e ordena pelos atendimentos', () => {
    const r = rankingDaRecorrencia([
      { clientId: 'diana', name: 'Diana', appointments: 0 },
      { clientId: 'ana', name: 'Ana', appointments: 2 },
      { clientId: 'bia', name: 'Bia', appointments: 5 },
    ])
    expect(r.map(c => c.clientId)).toEqual(['bia', 'ana'])
  })
  it('fica nas 5 primeiras', () => {
    const r = rankingDaRecorrencia(Array.from({ length: 8 }, (_, i) => ({ clientId: `c${i}`, name: `C${i}`, appointments: i + 1 })))
    expect(r).toHaveLength(5)
    expect(r[0]!.appointments).toBe(8)
  })
  it('o dashboard pede a recorrência ao banco (não ao ranking de gasto)', () => {
    const p = fonte('app/admin/dashboard/page.tsx')
    expect(p).toMatch(/getRecorrenciaDasClientes\(\{ \.\.\.daAgenda, limit: 5 \}\)/)
    expect(p).toMatch(/rankingDaRecorrencia\(clientStatsDaAgenda\)/)
    expect(fonte('lib/metrics/queries.ts')).toMatch(/rpc\('metrics_recorrencia_das_clientes'/)
  })
  it('a função conta os concluídos, só quem tem ao menos um, e é só do servidor', () => {
    const dir = join(RAIZ, 'supabase', 'migrations')
    const arq = readdirSync(dir).find(f => /^202612043\d+_.*recorrencia/.test(f))
    expect(arq, 'a migration da recorrência').toBeTruthy()
    const sql = readFileSync(join(dir, arq!), 'utf8')
    expect(sql).toContain('function public.metrics_recorrencia_das_clientes')
    expect(sql).toMatch(/a\.status = 'COMPLETED'/)
    expect(sql).toMatch(/revoke execute on function public\.metrics_recorrencia_das_clientes[^;]*from public, anon, authenticated/)
    expect(sql).toMatch(/grant execute on function public\.metrics_recorrencia_das_clientes[^;]*to service_role/)
    expect(sql.trim()).toMatch(/notify pgrst, 'reload schema';$/)
  })
})
