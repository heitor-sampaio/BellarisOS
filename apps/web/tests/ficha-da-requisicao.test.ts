import { describe, it, expect } from 'vitest'
import { fichaDaRequisicao, type FichaDoLogin } from '@/lib/clientes/ficha-da-requisicao'

const A: FichaDoLogin = { clientId: 'ficha-a', tenantId: 'rede-a', slug: 'aurora' }
const B: FichaDoLogin = { clientId: 'ficha-b', tenantId: 'rede-b', slug: 'bela-pele' }

describe('fichaDaRequisicao — a ficha é a da clínica do endereço', () => {
  it('no portal de uma clínica, a ficha daquela clínica (página ou action, com ou sem query)', () => {
    expect(fichaDaRequisicao([A, B], 'GET /bela-pele/cliente/home', 'ficha-a')).toEqual(B)
    expect(fichaDaRequisicao([A, B], 'POST /bela-pele/cliente/perfil?x=1', 'ficha-a')).toEqual(B)
    expect(fichaDaRequisicao([A, B], 'GET /aurora/cliente', 'ficha-b')).toEqual(A)
  })

  it('no portal de uma clínica em que ela não tem ficha: fora', () => {
    expect(fichaDaRequisicao([A, B], 'GET /outra-clinica/cliente/home', 'ficha-a')).toBe('fora')
  })

  it('fora de um portal (api, login, raiz): a ficha da marca do token, ou a primeira', () => {
    expect(fichaDaRequisicao([A, B], 'GET /api/documentos/1/pdf', 'ficha-b')).toEqual(B)
    expect(fichaDaRequisicao([A, B], 'GET /auth/redirect', 'ficha-a')).toEqual(A)
    expect(fichaDaRequisicao([A, B], 'GET /', 'sumiu')).toEqual(A)
    expect(fichaDaRequisicao([A, B], '', 'ficha-b')).toEqual(B)
  })

  it('o slug de outra rota da clínica (não o portal) também decide, se for o dela', () => {
    expect(fichaDaRequisicao([A, B], 'GET /bela-pele/dashboard', 'ficha-a')).toEqual(B)
  })

  it('sem ficha nenhuma: nada a escolher', () => {
    expect(fichaDaRequisicao([], 'GET /aurora/cliente/home', 'ficha-a')).toBeNull()
  })
})
