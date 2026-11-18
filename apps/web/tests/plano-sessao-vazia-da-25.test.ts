import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { recusaDaSessaoVazia } from '@/lib/plano-de-tratamento/textos'

const ler = (rel: string) => readFileSync(path.join(__dirname, '..', rel), 'utf8')

/**
 * A1(b) da 25ª simulação (princípios 3 e 7): o plano com uma sessão sem
 * procedimento era salvo sem aviso — a sessão vazia ia ao plano, ao contrato e
 * à conta das sessões, valendo R$ 0. O salvar recusa e diz qual sessão.
 * (O "Cancelar" do plano proposto, A1(a), vai ao Heitor.)
 */
describe('A1(b): o plano não se salva com sessão vazia', () => {
  const com = (n: number) => ({ procedures: Array.from({ length: n }, () => ({})) })
  it('diz qual sessão está vazia', () => {
    expect(recusaDaSessaoVazia([com(1), com(0), com(2)])).toBe('A sessão 2 está sem procedimento: inclua um ou tire a sessão.')
    expect(recusaDaSessaoVazia([com(0), com(1), com(0)])).toBe('As sessões 1 e 3 estão sem procedimento: inclua um em cada ou tire-as.')
    expect(recusaDaSessaoVazia([com(0), com(0), com(0)])).toBe('As sessões 1, 2 e 3 estão sem procedimento: inclua um em cada ou tire-as.')
  })
  it('sem sessão vazia, nada', () => {
    expect(recusaDaSessaoVazia([com(1), com(3)])).toBeNull()
    expect(recusaDaSessaoVazia([])).toBeNull()
  })
  it('os três caminhos que gravam as sessões recusam antes de gravar', () => {
    const t = ler('actions/treatment-plans.ts')
    for (const nome of ['saveTreatmentPlanInterno', 'salvarPlanoDoClienteInterno', 'generateEvaluationPlanInterno', 'gravarSessoes']) {
      const i = t.indexOf(`async function ${nome}(`)
      expect(i, nome).toBeGreaterThanOrEqual(0)
      const corpo = t.slice(i, t.indexOf('\n}\n', i))
      const recusa = corpo.indexOf('recusaDaSessaoVazia(sessions)')
      expect(recusa, `${nome} confere`).toBeGreaterThan(0)
      // Antes de qualquer escrita.
      for (const escrita of ['.update(', '.upsert(', '.delete(', ".rpc('gerar_plano_da_avaliacao'"]) {
        const e = corpo.indexOf(escrita)
        if (e >= 0) expect(recusa, `${nome}: antes de ${escrita}`).toBeLessThan(e)
      }
    }
  })
})
