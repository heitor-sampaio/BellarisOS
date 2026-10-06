import { describe, it, expect } from 'vitest'
import { caminhoInterno } from '@estetica-os/nucleo/lib/origem'

/**
 * O `next` dos links de e-mail (`/auth/confirm` dos três apps) só pode ser um
 * caminho DESTE app. `startsWith('/') && !startsWith('//')` deixava passar
 * `/\evil.com` e `/<tab>/evil.com`: o parser de URL troca a barra invertida
 * por barra e descarta tab e quebra de linha, e os dois viram `//evil.com` —
 * redirecionamento aberto com um link verdadeiro do Supabase.
 */
describe('caminhoInterno', () => {
  it('aceita caminho do próprio app, com busca', () => {
    expect(caminhoInterno('/update-password')).toBe('/update-password')
    expect(caminhoInterno('/admin/dashboard?aba=1')).toBe('/admin/dashboard?aba=1')
  })

  it('recusa endereço de fora, em todas as formas que o parser normaliza', () => {
    for (const ruim of [
      'https://evil.com', '//evil.com', '/\\evil.com', '\\\\evil.com',
      '/\t/evil.com', '/\n/evil.com', '/\r//evil.com', ' //evil.com',
      'javascript:alert(1)', 'evil.com', '',
    ]) expect(caminhoInterno(ruim), JSON.stringify(ruim)).toBe('/')
  })

  it('sem pedido, o padrão', () => {
    expect(caminhoInterno(null)).toBe('/')
    expect(caminhoInterno(null, '/login')).toBe('/login')
  })
})
