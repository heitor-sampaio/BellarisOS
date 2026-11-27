import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { vencimentoDoGanho } from '@/lib/fidelidade/formato'

/**
 * A13 da 37ª (SA-04: "quanto vence nos próximos 30 dias, com o 'vence em' de
 * cada linha"; SA-05: "Gastam-se primeiro os que vencem antes"; princípio 3):
 * depois da troca, as linhas de ganho seguiam "vence em 27/02/2027" inteiras e
 * o saldo era menor — o extrato não dizia de qual vencimento os pontos saíram
 * nem quanto resta de cada um.
 *
 * O que resta de cada ganho é do banco (`fidelidade_restante_dos_ganhos`), pela
 * MESMA conta do vencimento (`fidelidade_a_expirar`, a única cópia do FIFO): o
 * que resta de um vencimento é o a vencer até ele menos o a vencer até o
 * anterior. A tela só escreve.
 */
const raiz = join(__dirname, '..')
const fonte = (arquivo: string) => readFileSync(join(raiz, arquivo), 'utf8')
const data = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4)
const AGORA = Date.parse('2026-11-27T12:00:00Z')
const VENCE = '2027-02-27T12:00:00Z'

describe('o "vence em" de cada ganho no extrato', () => {
  it('inteiro, como antes', () => {
    expect(vencimentoDoGanho({ points: 100, expires_at: VENCE, restante: 100 }, data, AGORA)).toBe('vence em 27/02/2027')
    // Sem a conta (linha que não é ganho com validade), o "vence em" de sempre.
    expect(vencimentoDoGanho({ points: 100, expires_at: VENCE, restante: null }, data, AGORA)).toBe('vence em 27/02/2027')
  })
  it('em parte: quanto resta e quando vence', () => {
    expect(vencimentoDoGanho({ points: 130, expires_at: VENCE, restante: 30 }, data, AGORA)).toBe('restam 30 pontos, vencem em 27/02/2027')
    expect(vencimentoDoGanho({ points: 130, expires_at: VENCE, restante: 1 }, data, AGORA)).toBe('resta 1 ponto, vence em 27/02/2027')
  })
  it('gasto inteiro: não diz que vence', () => {
    expect(vencimentoDoGanho({ points: 100, expires_at: VENCE, restante: 0 }, data, AGORA)).toBe('já usados')
    expect(vencimentoDoGanho({ points: 1, expires_at: VENCE, restante: 0 }, data, AGORA)).toBe('já usado')
    // Vencido: a linha "Pontos vencidos" diz o que saiu.
    expect(vencimentoDoGanho({ points: 100, expires_at: '2026-10-01T12:00:00Z', restante: 0 }, data, AGORA)).toBeNull()
  })
  it('sem validade, ou saída: nada', () => {
    expect(vencimentoDoGanho({ points: 100, expires_at: null, restante: null }, data, AGORA)).toBeNull()
    expect(vencimentoDoGanho({ points: -50, expires_at: VENCE, restante: null }, data, AGORA)).toBeNull()
  })
})

describe('a conta é do banco, e a ficha e o app a usam', () => {
  const pasta = join(raiz, '..', '..', 'supabase', 'migrations')
  const arquivos = readdirSync(pasta).filter(f => f.endsWith('.sql')).sort()
  const que = arquivos.filter(f => readFileSync(join(pasta, f), 'utf8').includes('fidelidade_restante_dos_ganhos'))

  it('a função existe, pela conta de fidelidade_a_expirar, só para o servidor', () => {
    expect(que.length).toBeGreaterThan(0)
    const sql = readFileSync(join(pasta, que[que.length - 1]!), 'utf8')
    expect(sql).toMatch(/public\.fidelidade_a_expirar\(/)
    expect(sql).toMatch(/revoke execute on function public\.fidelidade_restante_dos_ganhos\(uuid\) from public, anon, authenticated/)
    expect(sql).toMatch(/grant execute on function public\.fidelidade_restante_dos_ganhos\(uuid\) to service_role/)
    expect(sql.trimEnd()).toMatch(/notify pgrst, 'reload schema';$/)
  })

  it('o extrato traz o que resta, e a ficha e o app escrevem com vencimentoDoGanho', () => {
    expect(fonte('lib/fidelidade/leitura.ts')).toMatch(/rpc\('fidelidade_restante_dos_ganhos'/)
    expect(fonte('components/branch/fidelidade-do-cliente.tsx')).toMatch(/vencimentoDoGanho\(/)
    expect(fonte('app/[slug]/cliente/fidelidade/page.tsx')).toMatch(/vencimentoDoGanho\(/)
  })
})
