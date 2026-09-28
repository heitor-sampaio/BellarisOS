import { describe, it, expect } from 'vitest'
import { origemPublica, urlPublica } from '@/lib/origem'

// O servidor escuta em 0.0.0.0:8080; a pessoa chegou por app.bellarisos.com.
const req = (headers: Record<string, string>) =>
  new Request('http://0.0.0.0:8080/auth/confirm?next=/admin', { headers })

describe('origemPublica', () => {
  it('usa o que o proxy informa, nunca o endereço em que o servidor escuta', () => {
    const r = req({ host: '0.0.0.0:8080', 'x-forwarded-host': 'app.bellarisos.com', 'x-forwarded-proto': 'https' })
    expect(origemPublica(r)).toBe('https://app.bellarisos.com')
    expect(urlPublica(r, '/login?erro=link').href).toBe('https://app.bellarisos.com/login?erro=link')
  })

  it('atrás de dois proxies, fica com o primeiro da lista', () => {
    const r = req({ 'x-forwarded-host': 'app.bellarisos.com, interno:8080', 'x-forwarded-proto': 'https, http' })
    expect(origemPublica(r)).toBe('https://app.bellarisos.com')
  })

  it('sem proxy, o Host da requisição — http só para o próprio computador', () => {
    expect(origemPublica(req({ host: '127.0.0.1:3100' }))).toBe('http://127.0.0.1:3100')
    expect(origemPublica(req({ host: 'app.bellarisos.com' }))).toBe('https://app.bellarisos.com')
  })
})
