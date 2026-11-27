import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  temEdicaoNaoSalva, marcarEdicaoNaoSalva, edicoesNaoSalvas, assinarEdicoesNaoSalvas,
} from '@/lib/injetaveis/edicao-nao-salva'

/**
 * D9 da 37ª simulação (C09 do Instituto Tumbérgia): o 4º ponto (5 UI), posto
 * sem salvar, sumiu do retrato da ficha ("como estava em 27/11") sem a tela
 * dizer nada. PT-15: "a edição não salva não entra, e a tela diz". O jeito é
 * o retorno da ação: o "Finalizar" diz que o planejamento tem pontos não
 * salvos e oferece salvá-lo ali.
 */

const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')
const ponto = (id: string, dose = 10) => ({ id, x: 0.5, y: 0.3, product: 'Toxina', dose, unit: 'UI' as const, applied: null })

describe('a edição do mapa não salva', () => {
  it('o ponto posto, mexido ou tirado sem salvar é edição não salva', () => {
    const salvo = [ponto('p1'), ponto('p2')]
    expect(temEdicaoNaoSalva(salvo, salvo.map(p => ({ ...p })))).toBe(false)
    expect(temEdicaoNaoSalva(salvo, [...salvo, ponto('p3', 5)])).toBe(true)
    expect(temEdicaoNaoSalva(salvo, [ponto('p1'), ponto('p2', 12)])).toBe(true)
    expect(temEdicaoNaoSalva(salvo, [ponto('p1')])).toBe(true)
  })

  it('o mapa marca e desmarca; quem assina fica sabendo', async () => {
    let avisos = 0
    const sair = assinarEdicoesNaoSalvas(() => { avisos++ })
    const salvar = async () => ({})
    marcarEdicaoNaoSalva('m1', { nome: 'Toxina terço superior', salvar })
    expect(edicoesNaoSalvas().map(e => [e.mapId, e.nome])).toEqual([['m1', 'Toxina terço superior']])
    const antes = edicoesNaoSalvas()
    expect(edicoesNaoSalvas(), 'o mesmo retrato enquanto nada muda').toBe(antes)
    marcarEdicaoNaoSalva('m1', null)
    expect(edicoesNaoSalvas()).toEqual([])
    expect(avisos).toBe(2)
    sair()
  })

  it('o mapa aberto marca a edição não salva', () => {
    const m = fonte('components/branch/mapa-injetavel.tsx')
    expect(m).toContain('temEdicaoNaoSalva(')
    expect(m).toContain('marcarEdicaoNaoSalva(')
  })

  it('o "Finalizar" diz que há pontos não salvos e oferece salvar', () => {
    const s = fonte('components/branch/appointment-session.tsx')
    expect(s).toContain('edicoesNaoSalvas')
    expect(s).toContain('data-mapa-nao-salvo')
    expect(s).toContain('tem pontos não salvos')
  })
})
