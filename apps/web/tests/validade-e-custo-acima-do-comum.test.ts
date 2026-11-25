import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { EntradaDaRecompensa, avisoDoCustoDaRecompensa } from '@/lib/fidelidade/recompensa'
import { recusaDaValidadeEmDias, avisoDaValidadeEmDias } from '@/lib/vendas/validade'

/**
 * O Heitor, 25/11, sobre os limites que recusavam o valor que a rede escolheu:
 * "Se não for impossível, ainda que improvável, pode ser feito."
 *
 * - a validade do pré-pago e do pacote: era de 1 a 3.650 dias;
 * - o custo da recompensa: era até 10 milhões de pontos.
 *
 * Acima do antigo teto, a tela avisa e o servidor grava. O impossível (decisão
 * do Claude, 25/11): a validade vira DATA, então até 100 anos (36.500 dias); o
 * custo é um `integer` no banco, então até 2.147.483.647.
 */

const APP = join(__dirname, '..')
const ler = (p: string) => readFileSync(join(APP, p), 'utf8')
const base = { name: 'Limpeza grátis', type: 'PRODUTO', validity_days: 30 }

describe('o custo da recompensa: acima de 10 milhões avisa', () => {
  it('grava 20 milhões de pontos, com o aviso', () => {
    expect(EntradaDaRecompensa.parse({ ...base, points_cost: '20000000' }).points_cost).toBe(20_000_000)
    expect(avisoDoCustoDaRecompensa(20_000_000)).toBe('Acima do comum (mais de 10.000.000 pontos). Confira: o valor vale como está.')
    expect(avisoDoCustoDaRecompensa(10_000_000)).toBeNull()
  })
  it('o impossível continua recusado: zero, fracionário e acima do registro', () => {
    for (const c of ['0', '1.5', '2147483648']) {
      expect(EntradaDaRecompensa.safeParse({ ...base, points_cost: c }).success, c).toBe(false)
    }
    const r = EntradaDaRecompensa.safeParse({ ...base, points_cost: '2147483648' })
    expect(r.success ? '' : r.error.issues[0]!.message).toBe('No máximo 2.147.483.647 pontos (o limite do registro).')
  })
  it('a tela do catálogo mostra o aviso ao lado do custo', () => {
    expect(ler('components/admin/fidelidade-catalogo.tsx')).toMatch(/avisoDoCustoDaRecompensa\(Number\(custo\)\)/)
  })
})

describe('a validade do pré-pago e do pacote: acima de 3.650 dias avisa', () => {
  it('a conta: aceita 5.000 com aviso; recusa zero, fracionário e acima de 100 anos', () => {
    expect(recusaDaValidadeEmDias(null)).toBeNull()
    expect(recusaDaValidadeEmDias(5000)).toBeNull()
    expect(avisoDaValidadeEmDias(5000)).toBe('Acima do comum (mais de 3.650 dias). Confira: o valor vale como está.')
    expect(avisoDaValidadeEmDias(3650)).toBeNull()
    expect(recusaDaValidadeEmDias(0)).toBe('Validade inválida.')
    expect(recusaDaValidadeEmDias(1.5)).toBe('Validade inválida.')
    expect(recusaDaValidadeEmDias(36_501)).toBe('No máximo 36.500 dias (100 anos, o limite das datas).')
  })
  it('as actions do pré-pago e do pacote usam a mesma conta, sem o 3.650', () => {
    const prePago = ler('actions/pre-pago.ts')
    expect(prePago).toMatch(/recusaDaValidadeEmDias\(validade\)/)
    expect(prePago).not.toMatch(/3650/)
    const pacotes = ler('actions/pacotes.ts')
    expect(pacotes).not.toMatch(/3650/)
    expect(pacotes).toMatch(/validity_days: z\.number\(\)\.int\(\)\.min\(1\)\.max\(LIMITE_DE_DIAS/)
    expect(ler('actions/automacoes.ts')).not.toMatch(/3650/)
  })
  it('as telas não param em 3.650 e mostram o aviso', () => {
    const vender = ler('components/shared/vender.tsx')
    expect(vender).not.toMatch(/max=\{3650\}/)
    expect(vender).toMatch(/avisoDaValidadeEmDias\(/)
    expect(ler('components/admin/pacotes-catalogo.tsx')).toMatch(/avisoDaValidadeEmDias\(/)
  })
  it('o banco: a venda pré-paga deixa de recusar acima de 3.650 e recusa acima de 36.500', () => {
    const pasta = join(APP, '..', '..', 'supabase', 'migrations')
    const nome = readdirSync(pasta).find(n => n.startsWith('20261207100001'))
    expect(nome, 'a migration nova').toBeTruthy()
    const sql = readFileSync(join(pasta, nome!), 'utf8')
    for (const f of ['public.procedimento_vender', 'public.procedimento_vender_com_equipe']) expect(sql).toContain(f)
    expect(sql).toContain('p_validade_dias > 36500')
    expect(sql.trimEnd().endsWith(`notify pgrst, 'reload schema';`)).toBe(true)
  })
})
