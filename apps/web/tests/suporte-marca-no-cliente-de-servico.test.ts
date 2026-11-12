import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { comMarcaDoSuporte, CABECALHO_DO_SUPORTE } from '@estetica-os/nucleo/lib/supabase/marca-do-suporte'

// C2 que sobrou da F69 (F71): o cliente de serviço da requisição da sessão de
// suporte diz ao banco quem grava (o cabeçalho), e o gatilho de domain_events
// marca o fato do banco. Só a escrita leva o cabeçalho; a leitura não pergunta
// pela sessão (é o caminho quente de toda tela).

function fetchQueGuarda() {
  const chamadas: { url: string; headers: Headers; method: string }[] = []
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    chamadas.push({ url: String(input), headers: new Headers(init?.headers), method: init?.method ?? 'GET' })
    return new Response('[]', { status: 200 })
  }) as typeof fetch
  return { f, chamadas }
}

describe('comMarcaDoSuporte', () => {
  it('a escrita da sessão de suporte leva o cabeçalho com o id da sessão', async () => {
    const { f, chamadas } = fetchQueGuarda()
    const comMarca = comMarcaDoSuporte(f, async () => 'sessao-1')
    await comMarca('https://x/rest/v1/financial_transactions', { method: 'PATCH', headers: { apikey: 'k' } })
    expect(chamadas[0]!.headers.get(CABECALHO_DO_SUPORTE)).toBe('sessao-1')
    expect(chamadas[0]!.headers.get('apikey'), 'os outros cabeçalhos ficam').toBe('k')
  })

  it('a requisição que não é do suporte sai sem o cabeçalho', async () => {
    const { f, chamadas } = fetchQueGuarda()
    await comMarcaDoSuporte(f, async () => null)('https://x/rest/v1/rpc/concluir_atendimento', { method: 'POST' })
    expect(chamadas[0]!.headers.has(CABECALHO_DO_SUPORTE)).toBe(false)
  })

  it('a leitura não pergunta pela sessão', async () => {
    const { f } = fetchQueGuarda()
    let perguntou = false
    await comMarcaDoSuporte(f, async () => { perguntou = true; return 'x' })('https://x/rest/v1/clients', { method: 'GET' })
    expect(perguntou).toBe(false)
  })

  it('se descobrir a sessão falhar, a escrita sai assim mesmo, sem o cabeçalho', async () => {
    const { f, chamadas } = fetchQueGuarda()
    await comMarcaDoSuporte(f, async () => { throw new Error('fora de requisição') })('https://x/rest/v1/a', { method: 'POST' })
    expect(chamadas).toHaveLength(1)
    expect(chamadas[0]!.headers.has(CABECALHO_DO_SUPORTE)).toBe(false)
  })
})

describe('o cliente de serviço do núcleo usa a marca', () => {
  it('createAdminClient passa o fetch por comMarcaDoSuporte', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../../packages/nucleo/src/lib/supabase/admin.ts'), 'utf8')
    expect(src).toContain('comMarcaDoSuporte')
  })
})
