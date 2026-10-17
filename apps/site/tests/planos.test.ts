import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cartaoDoPlano, planosDoSite, lerPlanos, _esquecerUltimoBom, type PlanoDoSite } from '@/lib/planos'
import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'

/**
 * Os planos do site (2026-10-17): o que vem de `planos_do_site()` vira o
 * cartão de preço. O número é o do sistema; o que a página escreve por conta
 * própria é só a forma de dizer.
 */
const sem = (chave: string) => FUNCIONALIDADES.map(f => f.chave).filter(c => c !== chave)

const starter: PlanoDoSite = {
  nome: 'Starter', descricao: '1 unidade, equipe ilimitada', valorCentavos: 19900, ordem: 0,
  recursos: {
    funcionalidades: sem('copilot') as PlanoDoSite['recursos']['funcionalidades'],
    limites: { unidades: 1, membros: null, whatsapp: 1 },
    adicionais: { copilot: { valor_centavos: 29900 }, whatsapp: { valor_centavos: 3900 } },
  },
}
const ultra: PlanoDoSite = {
  nome: 'ULTRA', descricao: null, valorCentavos: 49900, ordem: 2,
  recursos: {
    funcionalidades: FUNCIONALIDADES.map(f => f.chave),
    limites: { unidades: null, membros: null, whatsapp: 5 },
    adicionais: { whatsapp: { valor_centavos: 990 } },
  },
}

const s = (t: string) => t.replace(/\s/g, ' ')

describe('cartaoDoPlano', () => {
  it('diz o preço em reais, como o sistema', () => {
    expect(s(cartaoDoPlano(starter).preco)).toBe('R$ 199,00')
  })

  it('diz os limites em português, com o ilimitado por extenso', () => {
    expect(cartaoDoPlano(starter).destaques).toEqual(expect.arrayContaining(['1 unidade', '1 número de WhatsApp', 'Equipe ilimitada']))
    expect(cartaoDoPlano(ultra).destaques).toEqual(expect.arrayContaining(['Unidades ilimitadas', 'Até 5 números de WhatsApp']))
  })

  it('o Copilot: incluído, ou à parte com o preço do plano', () => {
    expect(cartaoDoPlano(ultra).comCopilot).toBe(true)
    expect(cartaoDoPlano(ultra).destaques).toContain('Copilot incluído')
    expect(cartaoDoPlano(starter).comCopilot).toBe(false)
    expect(cartaoDoPlano(starter).adicionais.map(s)).toContain('Copilot: + R$ 299,00 por mês')
    expect(cartaoDoPlano(starter).adicionais.map(s)).toContain('Número de WhatsApp extra: + R$ 39,00 por mês')
  })

  it('todas as funcionalidades fora o Copilot = "todas as funcionalidades"', () => {
    expect(cartaoDoPlano(starter).todasAsFuncionalidades).toBe(true)
    const capado = { ...starter, recursos: { ...starter.recursos, funcionalidades: ['agenda'] as PlanoDoSite['recursos']['funcionalidades'] } }
    expect(cartaoDoPlano(capado).todasAsFuncionalidades).toBe(false)
  })
})

describe('planosDoSite', () => {
  it('lê o que a função devolve e descarta a linha torta', () => {
    const linhas = [
      { nome: 'Starter', descricao: 'x', valor_centavos: 19900, ordem: 0, recursos: starter.recursos },
      { nome: 'Sem preço', descricao: null, valor_centavos: null, ordem: 1, recursos: starter.recursos },
      { nome: 'Sem recursos', descricao: null, valor_centavos: 100, ordem: 2, recursos: null },
    ]
    expect(planosDoSite(linhas).map(p => p.nome)).toEqual(['Starter'])
    expect(planosDoSite('lixo')).toEqual([])
  })
})

describe('lerPlanos', () => {
  beforeEach(() => {
    _esquecerUltimoBom()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://banco.test')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'chave-publica')
  })

  it('sem nunca ter lido, a falha do banco vira null — nunca R$ 0', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('erro', { status: 500 })))
    expect(await lerPlanos()).toBeNull()
  })

  it('depois de uma leitura boa, a falha devolve o último valor bom', async () => {
    const linha = { nome: 'Starter', descricao: 'x', valor_centavos: 19900, ordem: 0, recursos: starter.recursos }
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([linha])))
    expect((await lerPlanos())?.map(p => p.nome)).toEqual(['Starter'])
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('sem rede') }))
    expect((await lerPlanos())?.map(p => p.nome)).toEqual(['Starter'])
  })

  it('pede pela chave pública, à função do site', async () => {
    const f = vi.fn(async () => Response.json([]))
    vi.stubGlobal('fetch', f)
    await lerPlanos()
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://banco.test/rest/v1/rpc/planos_do_site')
    expect((init.headers as Record<string, string>).apikey).toBe('chave-publica')
  })
})
