import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * F73 (D4 da 14ª simulação): o editor do plano lista só o que a unidade DO
 * PLANO faz, e o servidor que grava as sessões recusa o resto. A regra é uma:
 * o catálogo sai de `procedimentosParaPlano` COM a unidade, e toda gravação de
 * sessões passa por `recusaDosProcedimentosDoPlano`
 * (lib/procedimentos/disponivel-na-unidade.ts).
 */
const RAIZ = path.resolve(__dirname, '..')

function arquivos(dir: string): string[] {
  return fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true }).flatMap(e => {
    const rel = path.join(dir, e.name)
    if (e.isDirectory()) return arquivos(rel)
    return /\.(ts|tsx)$/.test(e.name) ? [rel] : []
  })
}

function corpo(arquivo: string, nome: string): string {
  const texto = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8')
  const m = new RegExp(`\\n(export )?(async )?function ${nome}\\b`).exec(texto)
  if (!m) throw new Error(`${arquivo}: função ${nome} não encontrada`)
  const resto = texto.slice(m.index + 1)
  const fim = resto.slice(1).search(/\n(export )?(async )?function |\nexport const |\nconst [A-Z]/)
  return fim < 0 ? resto : resto.slice(0, fim + 1)
}

/** Só os insumos do catálogo (o mapa de injetáveis não lista procedimento). */
const SO_INSUMOS = new Set([path.join('app', '_shared', 'detalhe-de-injetavel.tsx')])

describe('o catálogo do editor do plano é o da unidade do plano', () => {
  const chamadas = ['app', 'components', 'actions', 'lib'].flatMap(arquivos)
    .filter(a => !a.endsWith(path.join('checkout', 'procedimentos-do-plano.ts')))
    .flatMap(a => {
      const texto = fs.readFileSync(path.join(RAIZ, a), 'utf8')
      return [...texto.matchAll(/procedimentosParaPlano\(([^)]*)\)/g)].map(m => ({ arquivo: a, args: m[1]! }))
    })

  it('acha os chamadores', () => {
    expect(chamadas.length).toBeGreaterThan(3)
  })

  it.each(chamadas.filter(c => !SO_INSUMOS.has(c.arquivo)).map(c => [c.arquivo, c.args]))(
    '%s passa a unidade (%s)', (_arquivo, args) => {
      expect(args.split(',').length, 'sem a unidade, o editor lista o catálogo da rede inteira').toBeGreaterThanOrEqual(2)
      expect(args, 'unidade nula de propósito não vale').not.toMatch(/\?\s*null\s*:/)
    })

  it('o plano aberto traz o catálogo dele (getPlanoParaEditar)', () => {
    expect(corpo('actions/treatment-plans.ts', 'getPlanoParaEditar')).toMatch(/procedimentosParaPlano\(ctx\.tenantId!, plan\.branch_id/)
  })

  it('a tela do plano usa a unidade DO plano, não a da tela', () => {
    const t = fs.readFileSync(path.join(RAIZ, 'app/_shared/detalhe-de-plano.tsx'), 'utf8')
    expect(t).toMatch(/procedimentosParaPlano\(ctx\.tenantId!, plano\.unidadeId\)/)
  })
})

describe('o servidor recusa o procedimento que a unidade do plano não faz', () => {
  it('gravarSessoes confere ANTES de apagar as sessões antigas', () => {
    const c = corpo('actions/treatment-plans.ts', 'gravarSessoes')
    const confere = c.indexOf('recusaDosProcedimentosDoPlano(')
    const apaga = c.indexOf('.delete()')
    expect(confere).toBeGreaterThan(-1)
    expect(confere).toBeLessThan(apaga)
  })

  it('toda chamada de gravarSessoes leva a unidade do plano', () => {
    const t = fs.readFileSync(path.join(RAIZ, 'actions/treatment-plans.ts'), 'utf8')
    const chamadas = [...t.matchAll(/await gravarSessoes\(([^\n]*)\)/g)]
    expect(chamadas.length).toBeGreaterThan(0)
    for (const m of chamadas) expect(m[1]).toMatch(/unidadeId:/)
  })

  it('a avaliação confere antes do gerar_plano_da_avaliacao', () => {
    const c = corpo('actions/treatment-plans.ts', 'generateEvaluationPlanInterno')
    expect(c.indexOf('recusaDosProcedimentosDoPlano(')).toBeGreaterThan(-1)
    expect(c.indexOf('recusaDosProcedimentosDoPlano(')).toBeLessThan(c.indexOf("'gerar_plano_da_avaliacao'"))
  })

  it('só gravarSessoes insere procedimento de sessão de plano', () => {
    const quem = ['app', 'components', 'actions', 'lib'].flatMap(arquivos).filter(a =>
      /from\('treatment_plan_session_procedures'\)\s*\.(insert|upsert)/.test(fs.readFileSync(path.join(RAIZ, a), 'utf8')))
    expect(quem).toEqual([path.join('actions', 'treatment-plans.ts')])
  })
})
