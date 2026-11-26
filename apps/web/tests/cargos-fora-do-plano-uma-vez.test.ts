import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { lerRecursos } from '@estetica-os/nucleo/lib/planos/recursos'

/**
 * Princípio 3: Cargos dizia "Fora do plano da rede: Copilot, Copilot." — a
 * tela somava `modulosForaDoPlano(...)`, que já traz o Copilot quando o plano
 * não o tem, e o 'copilot' de novo (o "sem plano" não libera o Copilot).
 */
describe('Cargos diz cada módulo fora do plano uma vez', () => {
  it('o plano sem o Copilot: ele sai uma vez só', async () => {
    const { modulosForaDoPlanoNosCargos } = await import('@/lib/cargos/fora-do-plano')
    const recursos = lerRecursos({ funcionalidades: ['agenda'], limites: {} })
    const fora = modulosForaDoPlanoNosCargos(recursos, false)
    expect(fora.filter(m => m === 'copilot')).toHaveLength(1)
    expect(new Set(fora).size).toBe(fora.length)
  })

  it('sem plano: só o Copilot (o "sem plano" não o libera)', async () => {
    const { modulosForaDoPlanoNosCargos } = await import('@/lib/cargos/fora-do-plano')
    expect(modulosForaDoPlanoNosCargos(null, false)).toEqual(['copilot'])
    expect(modulosForaDoPlanoNosCargos(null, true)).toEqual([])
  })

  it('a tela de Cargos usa a conta', () => {
    const f = readFileSync(join(__dirname, '..', 'app/_shared/configuracoes.tsx'), 'utf8')
    expect(f).toMatch(/foraDoPlano=\{modulosForaDoPlanoNosCargos\(/)
  })
})
