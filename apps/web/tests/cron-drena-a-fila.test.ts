import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { drenarEmLotes } from '@/lib/cron/drenar'

// F71 (a completa de 2026-11-12): `despacharFatosDoBanco` pegava no máximo 50
// fatos por passagem, do mais velho para o mais novo, uma vez só. Com mais de
// 50 fatos a cada 5 minutos a fila crescia sem fim e o fato novo nunca
// disparava (`e2e/automacoes-fatos-do-banco.spec.ts` ficou vermelho). A fila
// do cron se drena por lotes, até esvaziar ou até o orçamento de tempo — uma
// regra só, em `lib/cron/drenar.ts`.

describe('drenarEmLotes: a fila se esvazia em vários lotes', () => {
  it('pega lote depois de lote até vir um lote menor que o tamanho', async () => {
    const fila = Array.from({ length: 125 }, (_, i) => i)
    const feitos: number[] = []
    const r = await drenarEmLotes({
      tamanho: 50,
      orcamentoMs: 10_000,
      buscar: async n => fila.splice(0, n),
      processar: async lote => { feitos.push(...lote); return lote.length },
    })
    expect(feitos).toHaveLength(125)
    expect(r).toEqual({ processados: 125, lotes: 3, esgotouOTempo: false })
  })

  it('para no orçamento de tempo, e o resto fica para a próxima passagem', async () => {
    let agora = 0
    const fila = Array.from({ length: 500 }, (_, i) => i)
    const r = await drenarEmLotes({
      tamanho: 50,
      orcamentoMs: 100,
      relogio: () => agora,
      buscar: async n => fila.splice(0, n),
      processar: async lote => { agora += 60; return lote.length },
    })
    expect(r.lotes).toBe(2)
    expect(r.esgotouOTempo).toBe(true)
    expect(fila).toHaveLength(400)
  })

  it('para quando o lote volta vazio (outra passagem levou tudo)', async () => {
    const r = await drenarEmLotes({
      tamanho: 50, orcamentoMs: 10_000,
      buscar: async () => [],
      processar: async () => { throw new Error('não deveria processar') },
    })
    expect(r).toEqual({ processados: 0, lotes: 0, esgotouOTempo: false })
  })

  it('o lote cheio em que nada se reivindicou (outra passagem pegou) não vira laço infinito', async () => {
    let chamadas = 0
    const r = await drenarEmLotes({
      tamanho: 2, orcamentoMs: 10_000,
      buscar: async () => { chamadas++; return [1, 2] },
      processar: async () => 0,
      maxLotes: 5,
    })
    expect(chamadas).toBe(5)
    expect(r.processados).toBe(0)
  })
})

describe('a fila do cron das automações passa pela regra única', () => {
  const cron = fs.readFileSync(path.resolve(__dirname, '../lib/automacoes/cron.ts'), 'utf8')
  it('os fatos do banco e as retomadas drenam por drenarEmLotes', () => {
    expect(cron).toContain("from '@/lib/cron/drenar'")
    expect(cron.match(/drenarEmLotes(<[^(]*>)?\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })
})
