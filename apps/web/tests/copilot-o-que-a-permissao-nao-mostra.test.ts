import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { foraDaPermissaoDaFicha } from '@/lib/copilot/fora-da-permissao'

/**
 * D11 da 28ª: sem a Fidelidade em Ver, "quantos pontos a Larissa tem?" ouvia
 * "Não encontrei pontos de fidelidade na ficha" — ela tem 1.000. Princípio 4
 * (faltou o dado, a tela avisa — nunca o valor de outro caso), CW-05 (o
 * Copilot fala em permissão): a ferramenta diz ao modelo o que a permissão
 * desta pessoa não mostra, e ele diz isso em vez de "não encontrei".
 */
describe('o que a permissão não mostra na ficha do Copilot', () => {
  it('sem a Fidelidade em Ver (o programa ligado): diz que os pontos pedem a Fidelidade em Ver', () => {
    const r = foraDaPermissaoDaFicha({ veAgenda: true, veCredito: true, vePontos: false, fidelidadeLigada: true })
    expect(r?.pontosDeFidelidade).toMatch(/permissão desta pessoa não inclui a Fidelidade em Ver/)
    expect(r?.pontosDeFidelidade).not.toMatch(/cargo/i)
  })
  it('com o programa desligado, nada de pontos (C5): não fala de permissão', () => {
    expect(foraDaPermissaoDaFicha({ veAgenda: true, veCredito: true, vePontos: false, fidelidadeLigada: false })).toBeUndefined()
  })
  it('sem a Agenda e sem o que dá o crédito interno: diz os dois', () => {
    const r = foraDaPermissaoDaFicha({ veAgenda: false, veCredito: false, vePontos: true, fidelidadeLigada: true })
    expect(Object.keys(r ?? {}).sort()).toEqual(['atendimentos', 'creditoInterno'])
  })
  it('vendo tudo: nada', () => {
    expect(foraDaPermissaoDaFicha({ veAgenda: true, veCredito: true, vePontos: true, fidelidadeLigada: true })).toBeUndefined()
  })
  it('a ferramenta da ficha manda o recado ao modelo', () => {
    const f = readFileSync(join(__dirname, '..', 'lib/copilot/ferramentas/clientes.ts'), 'utf8')
    expect(f).toMatch(/foraDaPermissao \? \{ foraDaPermissao \} : \{\}/)
  })
})
