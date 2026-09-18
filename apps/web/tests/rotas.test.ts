import { describe, it, expect } from 'vitest'
import {
  ehPortalDaRede, portalDe, rotaNoPortal, rotaAtendimento, rotaAgenda,
  rotaCliente, rotaClientes, rotaNovoCliente, rotaInbox, rotaOportunidades, rotaCheckout,
} from '@/lib/rotas'

/** O portal vem de onde a pessoa está (pathname), nunca do slug do registro. */
describe('ehPortalDaRede', () => {
  it('reconhece o portal da rede pelo caminho', () => {
    expect(ehPortalDaRede('/admin/agenda')).toBe(true)
    expect(ehPortalDaRede('/admin')).toBe(true)
  })

  it('qualquer outro caminho é portal de unidade', () => {
    expect(ehPortalDaRede('/centro/agenda')).toBe(false)
    expect(ehPortalDaRede('/')).toBe(false)
  })
})

describe('portalDe', () => {
  it('estando na rede, o slug do registro não muda o portal', () => {
    expect(portalDe('/admin/clients/42', 'centro')).toBe('/admin')
  })

  it('estando na unidade, usa o slug do registro', () => {
    expect(portalDe('/centro/clients/42', 'jardins')).toBe('/jardins')
  })

  it('sem slug, a rede é o destino — é o único portal que alcança qualquer unidade', () => {
    expect(portalDe('/centro/clients/42', null)).toBe('/admin')
    expect(portalDe('/centro/clients/42', undefined)).toBe('/admin')
  })
})

describe('atalhos', () => {
  const naRede    = '/admin/clients/42'
  const naUnidade = '/centro/clients/42'

  it('abrir um atendimento não troca de portal', () => {
    expect(rotaAtendimento(naRede, 'centro', 'ap-1')).toBe('/admin/agenda/ap-1')
    expect(rotaAtendimento(naUnidade, 'centro', 'ap-1')).toBe('/centro/agenda/ap-1')
  })

  it('agenda, clientes e cadastro seguem o portal atual', () => {
    expect(rotaAgenda(naRede, 'centro')).toBe('/admin/agenda')
    expect(rotaClientes(naUnidade, 'centro')).toBe('/centro/clients')
    expect(rotaNovoCliente(naRede, 'centro')).toBe('/admin/clients/new')
    expect(rotaCliente(naUnidade, 'centro', 'cl-9')).toBe('/centro/clients/cl-9')
  })

  it('sufixo arbitrário entra sem alterar o portal', () => {
    expect(rotaNoPortal(naRede, 'centro', '/estoque')).toBe('/admin/estoque')
  })

  it('inbox leva a conversa na query, já escapada', () => {
    expect(rotaInbox(naRede, 'centro')).toBe('/admin/inbox')
    expect(rotaInbox(naUnidade, 'centro', 'conv 1')).toBe('/centro/inbox?c=conv%201')
    expect(rotaInbox(naRede, 'centro', null)).toBe('/admin/inbox')
  })

  it('oportunidades e checkout', () => {
    expect(rotaOportunidades(naUnidade, 'centro')).toBe('/centro/oportunidades')
    expect(rotaCheckout(naRede, 'centro')).toBe('/admin/checkout')
    expect(rotaCheckout(naRede, 'centro', 'plan-3')).toBe('/admin/checkout/plan-3')
  })
})
