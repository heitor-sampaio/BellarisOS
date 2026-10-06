import { describe, it, expect } from 'vitest'
import { verificacaoPendente } from '@estetica-os/nucleo/lib/plataforma/verificacao-exigida'

/**
 * A verificação em duas etapas da plataforma passou a ser OPÇÃO do admin do
 * sistema (decisão do Heitor, 2026-10-06 — nasce desligada). A regra de
 * quando a sessão para em /verificacao:
 *  - já verificada (aal2): nunca;
 *  - a plataforma exige: sempre;
 *  - não exige, mas a pessoa TEM autenticador (o próximo nível é aal2): sim —
 *    quem cadastrou um continua sendo pedido, senão o cadastro não valeria nada.
 */
describe('verificacaoPendente', () => {
  it('desligada e sem autenticador: entra só com a senha', () => {
    expect(verificacaoPendente({ exigida: false, nivelAtual: 'aal1', proximoNivel: 'aal1' })).toBe(false)
  })
  it('ligada: pede, mesmo sem autenticador (para cadastrar)', () => {
    expect(verificacaoPendente({ exigida: true, nivelAtual: 'aal1', proximoNivel: 'aal1' })).toBe(true)
  })
  it('desligada, mas com autenticador cadastrado: pede o código', () => {
    expect(verificacaoPendente({ exigida: false, nivelAtual: 'aal1', proximoNivel: 'aal2' })).toBe(true)
  })
  it('já verificada: nunca pede', () => {
    expect(verificacaoPendente({ exigida: true, nivelAtual: 'aal2', proximoNivel: 'aal2' })).toBe(false)
    expect(verificacaoPendente({ exigida: false, nivelAtual: 'aal2', proximoNivel: 'aal2' })).toBe(false)
  })
  it('nível desconhecido conta como não verificada', () => {
    expect(verificacaoPendente({ exigida: true, nivelAtual: null, proximoNivel: null })).toBe(true)
    expect(verificacaoPendente({ exigida: false, nivelAtual: null, proximoNivel: null })).toBe(false)
  })
})
