import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { abaDoFinanceiro, linkDaAba, ABAS_DO_FINANCEIRO } from '@/lib/financeiro/abas'

/**
 * FI1 do plano de adaptação (a revisão do Heitor, 2026-11-13: "nada de recurso
 * novo: o que já existe, organizado pelas cinco perguntas de quem cuida do
 * dinheiro"). O Financeiro tem cinco abas — Resumo · A receber · A pagar ·
 * Movimentações · Comissões — e abre no Resumo. Os links antigos
 * (`?aberto=todos`, `?aberto=vencidas`, `?aberto=a-pagar`) levam à aba nova.
 */
describe('as abas do Financeiro (FI1)', () => {
  it('são cinco, nesta ordem, e o Financeiro abre no Resumo', () => {
    expect(ABAS_DO_FINANCEIRO.map(a => a.chave)).toEqual(['resumo', 'a-receber', 'a-pagar', 'movimentacoes', 'comissoes'])
    expect(ABAS_DO_FINANCEIRO.map(a => a.rotulo)).toEqual(['Resumo', 'A receber', 'A pagar', 'Movimentações', 'Comissões'])
    expect(abaDoFinanceiro({})).toEqual({ aba: 'resumo', soAsVencidas: false, destino: null })
    expect(abaDoFinanceiro({ aba: 'xyz' }).aba).toBe('resumo')
  })

  it('cada aba pela URL', () => {
    expect(abaDoFinanceiro({ aba: 'a-receber' })).toEqual({ aba: 'a-receber', soAsVencidas: false, destino: null })
    expect(abaDoFinanceiro({ aba: 'a-receber', aberto: 'vencidas' })).toEqual({ aba: 'a-receber', soAsVencidas: true, destino: null })
    expect(abaDoFinanceiro({ aba: 'a-pagar' }).aba).toBe('a-pagar')
    expect(abaDoFinanceiro({ aba: 'movimentacoes', period: 'month' }).aba).toBe('movimentacoes')
    // "Só as vencidas" é do A receber: em outra aba não vale.
    expect(abaDoFinanceiro({ aba: 'movimentacoes', aberto: 'vencidas' }).soAsVencidas).toBe(false)
  })

  it('os links antigos levam à aba nova, com o resto da URL', () => {
    expect(abaDoFinanceiro({ aberto: 'todos', unidade: 'u1' }).destino).toBe('?aba=a-receber&unidade=u1')
    expect(abaDoFinanceiro({ aberto: 'vencidas' }).destino).toBe('?aba=a-receber&aberto=vencidas')
    expect(abaDoFinanceiro({ aberto: 'a-pagar', period: 'month' }).destino).toBe('?aba=a-pagar&period=month')
  })

  it('o link de cada aba guarda o período e a unidade; Comissões é a página dela', () => {
    const manter = { period: 'custom', from: '2026-11-01', to: '2026-11-10', unidade: 'u1', aberto: 'vencidas' }
    expect(linkDaAba('/admin/financeiro', 'resumo', manter)).toBe('/admin/financeiro?period=custom&from=2026-11-01&to=2026-11-10&unidade=u1')
    expect(linkDaAba('/admin/financeiro', 'movimentacoes', manter)).toBe('/admin/financeiro?aba=movimentacoes&period=custom&from=2026-11-01&to=2026-11-10&unidade=u1')
    expect(linkDaAba('/x/financeiro', 'a-receber', {})).toBe('/x/financeiro?aba=a-receber')
    expect(linkDaAba('/admin/financeiro', 'comissoes', manter)).toBe('/admin/financeiro/comissoes?unidade=u1')
    expect(linkDaAba('/x/financeiro', 'comissoes', {})).toBe('/x/financeiro/comissoes')
  })
})

/**
 * FI8 (o Heitor, 13/11: "ok"): a política antiga "Operacional acessa
 * financeiro da filial" sai — já não tinha efeito (a restritiva
 * `financeiro_so_pelo_servidor` fecha a sessão, F75). A trava: uma migration a
 * derruba, e nenhuma depois dela a recria.
 */
describe('a política antiga do financeiro sai (FI8)', () => {
  const MIGRATIONS = join(__dirname, '..', '..', '..', 'supabase', 'migrations')
  const NOME = 'Operacional acessa financeiro da filial'
  it('uma migration derruba a política, e nenhuma depois a recria nem a altera', () => {
    expect(existsSync(MIGRATIONS)).toBe(true)
    const arquivos = readdirSync(MIGRATIONS).filter(n => n.endsWith('.sql')).sort()
    const sql = (n: string) => readFileSync(join(MIGRATIONS, n), 'utf8')
    const derruba = new RegExp(`drop policy if exists "${NOME}"\\s+on\\s+(public\\.)?financial_transactions`, 'i')
    const mexe = new RegExp(`(create|alter) policy "${NOME}"`, 'i')
    const ultimaQueDerruba = arquivos.findLastIndex(n => derruba.test(sql(n)) && !mexe.test(sql(n)))
    expect(ultimaQueDerruba, 'nenhuma migration derruba a política (sem recriar)').toBeGreaterThanOrEqual(0)
    expect(arquivos.findLastIndex(n => mexe.test(sql(n)))).toBeLessThan(ultimaQueDerruba)
  })
})
