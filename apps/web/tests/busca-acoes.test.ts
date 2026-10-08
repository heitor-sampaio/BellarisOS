import { describe, expect, it } from 'vitest'
import type { ResolvedPermissions } from '@estetica-os/types'
import { NO_PERMISSIONS } from '@/lib/permissions'
import { acoesGerais, acoesDoCliente, acaoDeCadastrar } from '@/lib/busca/acoes'

/**
 * As AÇÕES da busca universal (fase 2, 2026-10-08): atalhos que abrem o modal
 * que já existe, por URL. Só aparecem para quem a tela de destino libera — a
 * busca não oferece o que a pessoa não pode fazer.
 */
const com = (p: Partial<ResolvedPermissions>) => ({ ...NO_PERMISSIONS, ...p }) as ResolvedPermissions
const REDE = '/admin/dashboard'
const UNIDADE = '/centro/dashboard'

describe('acoesGerais', () => {
  it('sem termo: novo agendamento e cadastrar cliente, para quem pode os dois', () => {
    const a = acoesGerais({ pathname: REDE, slug: null, permissoes: com({ agenda: 'MANAGE', clients: 'MANAGE' }), agendaPropria: false, termo: '' })
    expect(a.map(x => [x.id, x.href])).toEqual([
      ['novo-agendamento', '/admin/agenda?novo=1'],
      ['cadastrar-cliente', '/admin/clients/new'],
    ])
  })
  it('no portal da unidade, o caminho é o dela', () => {
    const a = acoesGerais({ pathname: UNIDADE, slug: 'centro', permissoes: com({ agenda: 'MANAGE' }), agendaPropria: false, termo: '' })
    expect(a.map(x => x.href)).toEqual(['/centro/agenda?novo=1'])
  })
  it('quem só VÊ a agenda, ou só a PRÓPRIA, não ganha "novo agendamento"; quem só vê clientes, não cadastra', () => {
    expect(acoesGerais({ pathname: REDE, slug: null, permissoes: com({ agenda: 'VIEW', clients: 'VIEW' }), agendaPropria: false, termo: '' })).toEqual([])
    expect(acoesGerais({ pathname: REDE, slug: null, permissoes: com({ agenda: 'MANAGE' }), agendaPropria: true, termo: '' })).toEqual([])
  })
  it('com termo, só as ações que casam com ele (sem acento, por apelido)', () => {
    const p = { pathname: REDE, slug: null, permissoes: com({ agenda: 'MANAGE', clients: 'MANAGE' }), agendaPropria: false }
    expect(acoesGerais({ ...p, termo: 'agend' }).map(x => x.id)).toEqual(['novo-agendamento'])
    expect(acoesGerais({ ...p, termo: 'novo cliente' }).map(x => x.id)).toEqual(['cadastrar-cliente'])
    expect(acoesGerais({ ...p, termo: 'maria' })).toEqual([])
  })
})

describe('acoesDoCliente', () => {
  it('agendar (a agenda com o modal e o cliente) e vender (a ficha com a venda aberta)', () => {
    const a = acoesDoCliente({ pathname: REDE, slug: null, permissoes: com({ agenda: 'MANAGE', cashier: 'MANAGE' }), agendaPropria: false }, 'c1')
    expect(a.map(x => [x.id, x.href])).toEqual([
      ['agendar', '/admin/agenda?novo=1&cliente=c1'],
      ['vender', '/admin/clients/c1?acao=vender'],
    ])
  })
  it('vender é de quem recebe (caixa ou financeiro em Gerenciar)', () => {
    expect(acoesDoCliente({ pathname: REDE, slug: null, permissoes: com({ financial: 'MANAGE' }), agendaPropria: false }, 'c1').map(x => x.id)).toEqual(['vender'])
    expect(acoesDoCliente({ pathname: REDE, slug: null, permissoes: com({ financial: 'VIEW' }), agendaPropria: false }, 'c1')).toEqual([])
  })
})

describe('acaoDeCadastrar (o termo que não achou ninguém)', () => {
  const p = { pathname: REDE, slug: null, permissoes: com({ clients: 'MANAGE' }), agendaPropria: false }
  it('um nome vai como nome', () => {
    expect(acaoDeCadastrar(p, 'Maria Souza')).toEqual({ id: 'cadastrar-termo', rotulo: 'Cadastrar “Maria Souza” como cliente', href: '/admin/clients/new?nome=Maria%20Souza' })
  })
  it('um telefone vai como telefone', () => {
    expect(acaoDeCadastrar(p, '(48) 99988-7766')?.href).toBe('/admin/clients/new?telefone=48999887766')
  })
  it('sem poder cadastrar, ou termo curto: nada', () => {
    expect(acaoDeCadastrar({ ...p, permissoes: com({ clients: 'VIEW' }) }, 'Maria')).toBeNull()
    expect(acaoDeCadastrar(p, 'M')).toBeNull()
  })
})
