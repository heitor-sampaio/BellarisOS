import { describe, it, expect, vi, afterEach } from 'vitest'
import { totp, passarOCodigo, type MfaDoTeste } from '../e2e/apoio/totp'

/**
 * O código TOTP do atendente de teste com o Auth lento (F47 — a completa de
 * 09–10/11).
 *
 * `criarAtendente` calculava o código ANTES de pedir o desafio
 * (`challengeAndVerify({ code: totp(segredo) })`): às 03:24:58Z o
 * `POST /auth/v1/factors/<id>/challenge` levou 34,6 s, o verify chegou às
 * 03:25:32 com o código de duas janelas antes, e o Auth respondeu 422 —
 * "Invalid TOTP code entered" — em `sistema-redes`. O código sai DEPOIS do
 * desafio, e o recusado tenta de novo na janela seguinte, com desafio novo.
 */

const SEGREDO = 'JBSWY3DPEHPK3PXP'
const JANELA = (ms: number) => Math.floor(ms / 30_000)

/** Um Auth em que o desafio leva `demoraMs` e o verify só aceita o código da janela de agora. */
function authLento(demoraMs: number, recusas = 0): MfaDoTeste & { verificados: string[] } {
  let falta = recusas
  const verificados: string[] = []
  return {
    verificados,
    async challenge() {
      vi.setSystemTime(Date.now() + demoraMs)
      return { data: { id: `desafio-${Date.now()}` }, error: null }
    },
    async verify({ code }) {
      verificados.push(code)
      if (falta > 0) { falta--; return { error: { message: 'Invalid TOTP code entered' } } }
      return code === totp(SEGREDO, Date.now()) ? { error: null } : { error: { message: 'Invalid TOTP code entered' } }
    },
  }
}

afterEach(() => { vi.useRealTimers() })

describe('passarOCodigo', () => {
  it('com o desafio levando 35 s, o código é o da janela em que o verify sai', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-10T03:24:58Z'))
    const antes = Date.now()
    const auth = authLento(35_000)
    await passarOCodigo(auth, 'fator', SEGREDO)
    expect(auth.verificados).toEqual([totp(SEGREDO, antes + 35_000)])
    expect(JANELA(antes + 35_000)).not.toBe(JANELA(antes))
  })

  it('o código recusado (já usado nesta janela) tenta de novo na janela seguinte, com desafio novo', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-10T03:00:10Z'))
    const auth = authLento(0, 1)
    const p = passarOCodigo(auth, 'fator', SEGREDO)
    await vi.runAllTimersAsync()
    await p
    expect(auth.verificados).toHaveLength(2)
    expect(auth.verificados[1]).not.toBe(auth.verificados[0])
  })

  it('recusado três vezes, diz o motivo (não insiste para sempre)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-10T03:00:10Z'))
    const auth = authLento(0, 99)
    const p = passarOCodigo(auth, 'fator', SEGREDO).catch((e: Error) => e)
    await vi.runAllTimersAsync()
    const erro = await p
    expect(String(erro)).toContain('verificar o código: Invalid TOTP code entered')
    expect(auth.verificados).toHaveLength(3)
  })
})
