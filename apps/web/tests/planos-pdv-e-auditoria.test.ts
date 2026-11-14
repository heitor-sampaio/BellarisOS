import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  FUNCIONALIDADES, TUDO_LIBERADO, lerRecursos, modulosForaDoPlano, type Funcionalidade,
} from '@estetica-os/nucleo/lib/planos/recursos'

/**
 * PL1 (Bloco Plataforma do plano de adaptação, 2026-11-16 — a revisão do
 * Heitor de 2026-11-13: "Sim"): o PDV (`cashier`) e a Auditoria (`audit`) são
 * de TODO plano. É por ele que entra o dinheiro (como Clientes, que não é
 * opção), e a auditoria é segurança da rede, não um extra.
 *
 * O único caminho pelo qual o plano tira um módulo é `modulosForaDoPlano`
 * (o `buildContext`, em lib/auth.ts, e os interessados dos avisos): um módulo
 * sai quando TODAS as funcionalidades que o cobrem estão fora. Nenhuma
 * funcionalidade cobrindo os dois, plano nenhum — nem o teste grátis (tudo
 * menos o Copilot), nem a rede bloqueada que volta com o retrato dela — os tira.
 */
const DE_TODO_PLANO = ['cashier', 'audit'] as const

describe('PL1 — o PDV e a Auditoria são de todo plano', () => {
  it('nenhuma funcionalidade do catálogo cobre o PDV nem a Auditoria', () => {
    for (const f of FUNCIONALIDADES as readonly Funcionalidade[]) {
      for (const m of DE_TODO_PLANO) expect(f.modulos, `${f.chave} cobre ${m}`).not.toContain(m)
    }
  })

  it('o plano mais pobre (nenhuma funcionalidade) não os tira', () => {
    const fora = modulosForaDoPlano(lerRecursos({ funcionalidades: [], limites: {} }))
    for (const m of DE_TODO_PLANO) expect(fora).not.toContain(m)
  })

  it('o plano de uma funcionalidade só, cada uma, não os tira', () => {
    for (const f of FUNCIONALIDADES) {
      const fora = modulosForaDoPlano(lerRecursos({ funcionalidades: [f.chave], limites: {} }))
      for (const m of DE_TODO_PLANO) expect(fora, `só com ${f.chave}`).not.toContain(m)
    }
  })

  it('o teste grátis (tudo menos o Copilot) e o tudo liberado não os tiram', () => {
    const teste = lerRecursos({ ...TUDO_LIBERADO, funcionalidades: TUDO_LIBERADO.funcionalidades.filter(c => c !== 'copilot') })
    expect(modulosForaDoPlano(teste)).toEqual(['copilot'])
    expect(modulosForaDoPlano(TUDO_LIBERADO)).toEqual([])
    expect(modulosForaDoPlano(null)).toEqual([])
  })

  it('o contexto só corta pelo plano por modulosForaDoPlano (nenhum corte do PDV ou da Auditoria escrito à mão)', () => {
    const auth = fs.readFileSync(path.resolve(__dirname, '../lib/auth.ts'), 'utf8')
    expect(auth).toContain('modulosForaDoPlano(plano)')
    expect(auth).not.toMatch(/(cashier|audit)\s*:\s*'NONE'/)
  })
})

describe('PL1 — os rótulos do catálogo falam os nomes da revisão', () => {
  const rotulo = (chave: string) => FUNCIONALIDADES.find(f => f.chave === chave)?.rotulo
  it('"Documentos" (era "Termos e contratos" — DC1)', () => {
    expect(rotulo('documentos')).toBe('Documentos (assinatura eletrônica)')
  })
  it('"Fichas de atendimento" (FC1)', () => {
    expect(rotulo('fichas')).toBe('Fichas de atendimento personalizadas')
  })
  it('"Portal e app da cliente"', () => {
    expect(rotulo('portal')).toBe('Portal e app da cliente')
  })
  it('nenhum rótulo diz "Termos e contratos" nem "do cliente"', () => {
    for (const f of FUNCIONALIDADES) {
      expect(f.rotulo).not.toMatch(/termos e contratos/i)
      expect(f.rotulo).not.toMatch(/\bdo cliente\b/i)
    }
  })
})
