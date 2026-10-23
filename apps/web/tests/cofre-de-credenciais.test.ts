import { describe, it, expect } from 'vitest'
import { randomBytes } from 'node:crypto'
import { cifrarSegredos, decifrarSegredos, temSegredoEmTextoPuro, PREFIXO_CIFRADO } from '@/lib/integracoes/cofre'
import { mascararSegredos, mesclarSegredos, SEGREDO_GUARDADO } from '@/lib/integracoes/sem-segredo'

// A chave do cofre mora FORA do banco (CREDENCIAIS_CHAVE, no Railway): quem
// tiver só o banco vê o token cifrado (2026-10-23).
const CHAVE = randomBytes(32)
const OUTRA = randomBytes(32)

const CONFIG = {
  token: 'tok-uazapi-123', baseUrl: 'https://x.uazapi.com', connectedPhone: '5511999',
  appSecret: 'segredo-do-app', accessToken: '',
  pages: [{ pageId: '1', access_token: 'token-da-pagina' }],
}

describe('cifrarSegredos — o token não fica em texto no banco', () => {
  it('cifra só as chaves secretas, inclusive dentro de listas, e mantém o resto', () => {
    const c = cifrarSegredos(CONFIG, CHAVE)
    expect(c.baseUrl).toBe('https://x.uazapi.com')
    expect(c.connectedPhone).toBe('5511999')
    expect(c.accessToken).toBe('')                       // vazio não vira nada
    for (const v of [c.token, c.appSecret, c.pages[0]!.access_token]) {
      expect(v.startsWith(PREFIXO_CIFRADO)).toBe(true)
    }
    const texto = JSON.stringify(c)
    for (const s of ['tok-uazapi-123', 'segredo-do-app', 'token-da-pagina']) expect(texto).not.toContain(s)
  })

  it('volta ao original com a mesma chave', () => {
    expect(decifrarSegredos(cifrarSegredos(CONFIG, CHAVE), CHAVE)).toEqual(CONFIG)
  })

  it('não cifra duas vezes (o config lido e espalhado num update)', () => {
    const uma = cifrarSegredos(CONFIG, CHAVE)
    expect(cifrarSegredos({ ...uma, connectedPhone: '55' }, CHAVE).token).toBe(uma.token)
  })

  it('o mesmo token cifrado duas vezes dá textos diferentes', () => {
    expect(cifrarSegredos(CONFIG, CHAVE).token).not.toBe(cifrarSegredos(CONFIG, CHAVE).token)
  })

  it('sem a chave, recusa gravar em vez de gravar em texto puro', () => {
    expect(() => cifrarSegredos(CONFIG, null)).toThrow(/CREDENCIAIS_CHAVE/)
  })

  it('config sem segredo nenhum não precisa da chave', () => {
    expect(cifrarSegredos({ baseUrl: 'https://y', token: '' }, null)).toEqual({ baseUrl: 'https://y', token: '' })
  })
})

describe('decifrarSegredos', () => {
  it('o texto puro antigo passa como está — e sem precisar da chave', () => {
    expect(decifrarSegredos(CONFIG, null)).toEqual(CONFIG)
  })

  it('chave errada ou texto adulterado PARA (nada de token lixo seguindo para a Meta)', () => {
    const c = cifrarSegredos(CONFIG, CHAVE)
    expect(() => decifrarSegredos(c, OUTRA)).toThrow()
    const adulterado = { ...c, token: c.token.slice(0, -4) + (c.token.endsWith('AAAA') ? 'BBBB' : 'AAAA') }
    expect(() => decifrarSegredos(adulterado, CHAVE)).toThrow()
  })

  it('cifrado sem a chave no ambiente PARA', () => {
    expect(() => decifrarSegredos(cifrarSegredos(CONFIG, CHAVE), null)).toThrow(/CREDENCIAIS_CHAVE/)
  })

  it('config nula vira {}', () => {
    expect(decifrarSegredos(null, CHAVE)).toEqual({})
  })
})

describe('temSegredoEmTextoPuro — a varredura que a migração e o teste usam', () => {
  it('acusa o texto puro e aceita o cifrado', () => {
    expect(temSegredoEmTextoPuro(CONFIG)).toBe(true)
    expect(temSegredoEmTextoPuro(cifrarSegredos(CONFIG, CHAVE))).toBe(false)
    expect(temSegredoEmTextoPuro({ baseUrl: 'https://y' })).toBe(false)
  })
})

describe('a tela continua sem ver o segredo', () => {
  it('o cifrado vira o marcador, e salvar com o marcador mantém o cifrado', () => {
    const guardado = cifrarSegredos(CONFIG, CHAVE)
    expect(mascararSegredos(guardado).token).toBe(SEGREDO_GUARDADO)
    expect(mesclarSegredos({ token: SEGREDO_GUARDADO }, guardado).token).toBe(guardado.token)
  })
})
