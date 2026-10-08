import { describe, expect, it } from 'vitest'
import { comNovaTentativa, SALDO_MUDOU } from '@/lib/estoque/nova-tentativa'

/**
 * Quando o banco recusa porque o saldo mudou entre a leitura e a gravação
 * (40001), o app RELÊ e calcula de novo — algumas vezes, e só por esse motivo.
 */
describe('comNovaTentativa', () => {
  it('saldo mudou: tenta de novo, e o que passa é o resultado', async () => {
    let vezes = 0
    const r = await comNovaTentativa(async () => {
      vezes++
      return vezes < 3 ? { error: { code: SALDO_MUDOU, message: 'mudou' } } : { error: null, data: 'ok' }
    })
    expect(vezes).toBe(3)
    expect(r).toEqual({ error: null, data: 'ok' })
  })
  it('outro erro não repete', async () => {
    let vezes = 0
    const r = await comNovaTentativa(async () => { vezes++; return { error: { code: 'P0001', message: 'outro' } } })
    expect(vezes).toBe(1)
    expect(r.error?.code).toBe('P0001')
  })
  it('desiste depois de 3 vezes, devolvendo o último erro', async () => {
    let vezes = 0
    const r = await comNovaTentativa(async () => { vezes++; return { error: { code: SALDO_MUDOU, message: 'mudou' } } })
    expect(vezes).toBe(3)
    expect(r.error?.code).toBe(SALDO_MUDOU)
  })
})
