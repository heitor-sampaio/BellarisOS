import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchQueInsiste, criarLoginDeTeste } from '../e2e/apoio/banco'

/**
 * O banco do E2E com o Postgres engasgado (F45, 2026-11-07).
 *
 * Na completa de 06–07/11 o banco de produção parou de 9 a 45 s algumas vezes
 * (edge_logs: 01:29, 01:38, 01:50). Três falhas foram um INSERT simples do
 * próprio teste cancelado pelo `statement_timeout` (57014) — a rede, a
 * oportunidade, o agendamento; uma, o `createUser` do Auth com erro vazio
 * ("context deadline exceeded" no Auth).
 *
 * - A gravação cancelada por tempo (57014) repete: o Postgres DESFEZ a
 *   transação, nada foi gravado — repetir não grava duas vezes. Qualquer outro
 *   erro de gravação volta na hora (é o banco falando).
 * - O login que o Auth não criou (5xx, erro sem mensagem) repete; se a
 *   repetição diz "já existe", a primeira chegou a criar — vale o que existe.
 */

const CANCELADA = JSON.stringify({ code: '57014', details: null, hint: null, message: 'canceling statement due to statement timeout' })
const resposta = (status: number, corpo: string) => new Response(corpo, { status, headers: { 'content-type': 'application/json' } })

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('fetchQueInsiste', () => {
  it('a gravação cancelada pelo statement_timeout (57014) repete — e a segunda vale', async () => {
    vi.useFakeTimers()
    const f = vi.fn()
      .mockResolvedValueOnce(resposta(500, CANCELADA))
      .mockResolvedValueOnce(resposta(201, '{"id":"x"}'))
    vi.stubGlobal('fetch', f)
    const p = fetchQueInsiste('https://x.supabase.co/rest/v1/leads', { method: 'POST', body: '{"a":1}' })
    await vi.runAllTimersAsync()
    const r = await p
    expect(r.status).toBe(201)
    expect(f).toHaveBeenCalledTimes(2)
    expect(f.mock.calls[1]?.[1]?.body).toBe('{"a":1}')
  })

  it('outro erro de gravação NÃO repete (poderia gravar duas vezes)', async () => {
    const f = vi.fn().mockResolvedValue(resposta(409, '{"code":"23505","message":"duplicate key"}'))
    vi.stubGlobal('fetch', f)
    const r = await fetchQueInsiste('https://x.supabase.co/rest/v1/leads', { method: 'POST', body: '{}' })
    expect(r.status).toBe(409)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('a gravação cancelada três vezes devolve o erro (não insiste para sempre)', async () => {
    vi.useFakeTimers()
    const f = vi.fn().mockImplementation(async () => resposta(500, CANCELADA))
    vi.stubGlobal('fetch', f)
    const p = fetchQueInsiste('https://x.supabase.co/rest/v1/tenants', { method: 'POST', body: '{}' })
    await vi.runAllTimersAsync()
    const r = await p
    expect(r.status).toBe(500)
    expect(f).toHaveBeenCalledTimes(3)
  })
})

describe('criarLoginDeTeste', () => {
  const email = 'e2e-membro-x@bellaris.invalid'
  const db = (respostas: Array<{ data: { user: { id: string } | null }; error: { message?: string } | null }>, existentes: Array<{ id: string; email: string }> = []) => ({
    auth: { admin: {
      createUser: vi.fn().mockImplementation(async () => respostas.shift()!),
      listUsers: vi.fn().mockResolvedValue({ data: { users: existentes }, error: null }),
    } },
  })

  it('o Auth que não respondeu (erro vazio) repete, e a segunda cria', async () => {
    vi.useFakeTimers()
    const d = db([{ data: { user: null }, error: {} }, { data: { user: { id: 'u2' } }, error: null }])
    const p = criarLoginDeTeste(d as never, email, 'criar o login')
    await vi.runAllTimersAsync()
    expect(await p).toBe('u2')
    expect(d.auth.admin.createUser).toHaveBeenCalledTimes(2)
  })

  it('a repetição diz "já existe": a primeira chegou a criar, e vale o login que existe', async () => {
    vi.useFakeTimers()
    const d = db(
      [{ data: { user: null }, error: { message: '' } }, { data: { user: null }, error: { message: 'A user with this email address has already been registered' } }],
      [{ id: 'outro', email: 'e2e-outro@bellaris.invalid' }, { id: 'u1', email }],
    )
    const p = criarLoginDeTeste(d as never, email, 'criar o login')
    await vi.runAllTimersAsync()
    expect(await p).toBe('u1')
  })

  it('"já existe" de primeira é erro do teste (o e-mail é de outro), não se adota', async () => {
    const d = db([{ data: { user: null }, error: { message: 'A user with this email address has already been registered' } }], [{ id: 'u1', email }])
    await expect(criarLoginDeTeste(d as never, email, 'criar o login')).rejects.toThrow(/criar o login: .*already been registered/)
  })
})
