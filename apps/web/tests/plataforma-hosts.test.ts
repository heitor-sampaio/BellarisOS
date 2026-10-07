import { describe, it, expect } from 'vitest'
import { aceitaNoHost, urlDoHost, inicioDaPlataforma, recusaDoHost, linkDeDefinirSenha, papelAlcanca } from '@estetica-os/nucleo/lib/plataforma/destino'

/**
 * A plataforma mora em DOIS hosts (2026-10-06): o sistema
 * (admin.bellarisos.com, a administração do negócio) e o suporte
 * (suporte.bellarisos.com, o atendimento). Quem é só do suporte nunca chega
 * ao host do sistema; quem é ADMIN entra nos dois (uma sessão em cada).
 */
describe('aceitaNoHost', () => {
  it('o sistema é só do ADMIN', () => {
    expect(aceitaNoHost('sistema', 'ADMIN')).toBe(true)
    expect(aceitaNoHost('sistema', 'SUPORTE')).toBe(false)
  })
  it('o suporte é do SUPORTE e do ADMIN', () => {
    expect(aceitaNoHost('suporte', 'SUPORTE')).toBe(true)
    expect(aceitaNoHost('suporte', 'ADMIN')).toBe(true)
  })
  it('sem a marca da plataforma (membro de rede, cliente), nenhum dos dois', () => {
    for (const marca of [null, undefined, '', 'CLIENT', 'NETWORK_ADMIN']) {
      expect(aceitaNoHost('sistema', marca)).toBe(false)
      expect(aceitaNoHost('suporte', marca)).toBe(false)
    }
  })
})

describe('recusaDoHost — o que o login de cada host diz a quem não é dele', () => {
  it('sem a marca: só da equipe do BellarisOS', () => {
    expect(recusaDoHost('sistema', null)).toMatch(/só da equipe do BellarisOS/)
    expect(recusaDoHost('suporte', 'CLIENT')).toMatch(/só da equipe do BellarisOS/)
  })
  it('o SUPORTE no sistema: só da administração', () => {
    expect(recusaDoHost('sistema', 'SUPORTE')).toMatch(/só da administração/)
  })
  it('quem é do host passa', () => {
    expect(recusaDoHost('sistema', 'ADMIN')).toBeNull()
    expect(recusaDoHost('suporte', 'SUPORTE')).toBeNull()
    expect(recusaDoHost('suporte', 'ADMIN')).toBeNull()
  })
})

describe('linkDeDefinirSenha — para onde volta o e-mail de convite', () => {
  const env = { CLINICA_URL: 'https://app.bellarisos.com', SISTEMA_URL: 'https://admin.bellarisos.com', SUPORTE_URL: 'https://suporte.bellarisos.com' }
  it('membro de rede (o responsável da rede nova, o reenviar acesso): a clínica', () => {
    expect(linkDeDefinirSenha({ para: 'membro' }, env)).toBe('https://app.bellarisos.com/auth/confirm?next=/update-password')
  })
  it('atendente: o host do papel dele', () => {
    expect(linkDeDefinirSenha({ para: 'atendente', papel: 'ADMIN' }, env)).toBe('https://admin.bellarisos.com/auth/confirm?next=/update-password')
    expect(linkDeDefinirSenha({ para: 'atendente', papel: 'SUPORTE' }, env)).toBe('https://suporte.bellarisos.com/auth/confirm?next=/update-password')
  })
})

describe('urlDoHost e inicioDaPlataforma', () => {
  const env = { SISTEMA_URL: 'https://admin.bellarisos.com', SUPORTE_URL: 'https://suporte.bellarisos.com/' }
  it('o endereço vem do ambiente, sem barra no fim', () => {
    expect(urlDoHost('sistema', env)).toBe('https://admin.bellarisos.com')
    expect(urlDoHost('suporte', env)).toBe('https://suporte.bellarisos.com')
  })
  it('sem a variável, falha alto (nunca monta URL a partir do pedido)', () => {
    expect(() => urlDoHost('sistema', {})).toThrow(/SISTEMA_URL/)
  })
  it('o ADMIN começa no sistema; o SUPORTE, no suporte', () => {
    expect(inicioDaPlataforma('ADMIN', env)).toBe('https://admin.bellarisos.com/')
    expect(inicioDaPlataforma('SUPORTE', env)).toBe('https://suporte.bellarisos.com/')
  })
})

/**
 * O GERENTE (2026-10-07, pedido do Heitor): a equipe da plataforma ganha um
 * papel que VÊ o sistema inteiro e não edita nada. Só o sistema — o suporte
 * (chamados, "entrar como") fica com Suporte e Admin.
 */
describe('o Gerente da plataforma', () => {
  const env = { CLINICA_URL: 'https://app.bellarisos.com', SISTEMA_URL: 'https://admin.bellarisos.com', SUPORTE_URL: 'https://suporte.bellarisos.com' }
  it('entra no sistema, não no suporte', () => {
    expect(aceitaNoHost('sistema', 'GERENTE')).toBe(true)
    expect(aceitaNoHost('suporte', 'GERENTE')).toBe(false)
    expect(recusaDoHost('sistema', 'GERENTE')).toBeNull()
    expect(recusaDoHost('suporte', 'GERENTE')).toMatch(/só do atendimento/)
  })
  it('o convite e o começo são no sistema', () => {
    expect(linkDeDefinirSenha({ para: 'atendente', papel: 'GERENTE' }, env)).toBe('https://admin.bellarisos.com/auth/confirm?next=/update-password')
    expect(inicioDaPlataforma('GERENTE', env)).toBe('https://admin.bellarisos.com/')
  })
  it('papelAlcanca: ver o sistema é do Admin e do Gerente; administrar, só do Admin; atender, do Suporte e do Admin', () => {
    expect(papelAlcanca('GERENTE', 'ver-sistema')).toBe(true)
    expect(papelAlcanca('ADMIN', 'ver-sistema')).toBe(true)
    expect(papelAlcanca('SUPORTE', 'ver-sistema')).toBe(false)
    expect(papelAlcanca('GERENTE', 'administrar')).toBe(false)
    expect(papelAlcanca('ADMIN', 'administrar')).toBe(true)
    expect(papelAlcanca('GERENTE', 'atender')).toBe(false)
    expect(papelAlcanca('SUPORTE', 'atender')).toBe(true)
    expect(papelAlcanca('ADMIN', 'atender')).toBe(true)
    expect(papelAlcanca('OUTRO', 'ver-sistema')).toBe(false)
  })
})
