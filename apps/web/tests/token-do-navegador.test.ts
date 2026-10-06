import { describe, it, expect, vi } from 'vitest'
import { fonteDeToken, type TokenDoServidor } from '@/lib/supabase/token-do-navegador'

/**
 * O navegador não lê mais a sessão (os cookies são httpOnly): para o Realtime,
 * ele pede ao servidor só o ACCESS token (até 1 h, sem renovação própria). A
 * fonte guarda o token em memória, renova antes de vencer e não pede duas
 * vezes ao mesmo tempo.
 */
const agoraSeg = 1_800_000_000
const token = (exp: number, valor = `tok-${exp}`): TokenDoServidor => ({ access_token: valor, expires_at: exp })

describe('fonteDeToken', () => {
  it('guarda o token e não pede de novo enquanto ele vale', async () => {
    const buscar = vi.fn(async () => token(agoraSeg + 3600))
    const f = fonteDeToken(buscar, () => agoraSeg * 1000)
    expect(await f()).toBe(`tok-${agoraSeg + 3600}`)
    expect(await f()).toBe(`tok-${agoraSeg + 3600}`)
    expect(buscar).toHaveBeenCalledTimes(1)
  })

  it('renova quando falta menos de um minuto para vencer', async () => {
    let agora = agoraSeg * 1000
    const buscar = vi.fn()
      .mockResolvedValueOnce(token(agoraSeg + 120, 'primeiro'))
      .mockResolvedValueOnce(token(agoraSeg + 3700, 'segundo'))
    const f = fonteDeToken(buscar, () => agora)
    expect(await f()).toBe('primeiro')
    agora = (agoraSeg + 70) * 1000           // faltam 50 s
    expect(await f()).toBe('segundo')
    expect(buscar).toHaveBeenCalledTimes(2)
  })

  it('pedidos ao mesmo tempo dividem UMA busca', async () => {
    let soltar: (t: TokenDoServidor) => void = () => {}
    const buscar = vi.fn(() => new Promise<TokenDoServidor>(ok => { soltar = ok }))
    const f = fonteDeToken(buscar, () => agoraSeg * 1000)
    const a = f(); const b = f()
    soltar(token(agoraSeg + 3600, 'um'))
    expect(await a).toBe('um')
    expect(await b).toBe('um')
    expect(buscar).toHaveBeenCalledTimes(1)
  })

  it('sem sessão (o servidor diz que não há), devolve null e tenta de novo na próxima', async () => {
    const buscar = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(token(agoraSeg + 3600, 'voltou'))
    const f = fonteDeToken(buscar, () => agoraSeg * 1000)
    expect(await f()).toBeNull()
    expect(await f()).toBe('voltou')
  })

  it('falha da busca não envenena a fonte: a próxima tenta de novo', async () => {
    const buscar = vi.fn()
      .mockRejectedValueOnce(new Error('rede'))
      .mockResolvedValueOnce(token(agoraSeg + 3600, 'ok'))
    const f = fonteDeToken(buscar, () => agoraSeg * 1000)
    expect(await f()).toBeNull()
    expect(await f()).toBe('ok')
  })
})
