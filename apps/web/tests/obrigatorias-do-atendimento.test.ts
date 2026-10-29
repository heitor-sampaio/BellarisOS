import { describe, it, expect } from 'vitest'
import { campoVazio, primeiraObrigatoriaVazia, type AnamnesisRow } from '@/lib/anamnesis'
import { faltaNaAnamnese, faltaNaFichaDoProcedimento } from '@/lib/atendimento/obrigatorias'

/**
 * Revisão do Heitor, 2026-10-29: "tudo que for obrigatório é obrigatório e
 * barra qualquer progressão". A regra da obrigatória vazia é UMA — a tela
 * aponta o campo com ela, o servidor recusa com ela.
 */

const linha = (fields: AnamnesisRow['fields']): AnamnesisRow => ({ id: Math.random().toString(36), fields })
const ficha: AnamnesisRow[] = [
  linha([{ id: 'titulo', type: 'section', label: 'Pele', required: true }]),
  linha([
    { id: 'fototipo', type: 'select', label: 'Fototipo', required: true, options: ['I', 'II'] },
    { id: 'acido', type: 'text', label: 'Ácido' },
  ]),
  linha([{ id: 'mapa', type: 'injectable_map', label: 'Pontos', required: true }]),
  linha([{ id: 'foto', type: 'photo', label: 'Foto', required: true }]),
]

describe('campoVazio', () => {
  it('texto, lista e o planejador', () => {
    expect(campoVazio(undefined)).toBe(true)
    expect(campoVazio('  ')).toBe(true)
    expect(campoVazio([])).toBe(true)
    expect(campoVazio(['a'])).toBe(false)
    expect(campoVazio('0')).toBe(false)
    expect(campoVazio({ view: 'rosto_f', points: [] })).toBe(true)
    // O planejamento escolhido vale mesmo sem ponto (2026-10-29).
    expect(campoVazio({ view: 'rosto_f', points: [], planejamento: { id: 'p1', nome: '' } })).toBe(false)
    expect(campoVazio({ qualquer: 1 }), 'objeto que não é planejador não é resposta').toBe(true)
  })
})

describe('a primeira obrigatória vazia', () => {
  it('na ordem da ficha, sem contar o título', () => {
    expect(primeiraObrigatoriaVazia(ficha, {})?.id).toBe('fototipo')
    expect(primeiraObrigatoriaVazia(ficha, { fototipo: 'I' })?.id).toBe('mapa')
    expect(primeiraObrigatoriaVazia(ficha, { fototipo: 'I', mapa: { view: 'rosto_f', points: [], planejamento: { id: 'p', nome: 'x' } } })?.id).toBe('foto')
  })

  it('a ficha do procedimento: sem o recurso de injetáveis, o planejador não barra', () => {
    const r = { fototipo: 'II', foto: 'rede/ag/foto.jpg' }
    expect(faltaNaFichaDoProcedimento(ficha, r)?.campo).toBe('mapa')
    expect(faltaNaFichaDoProcedimento(ficha, r, { semInjetaveis: true })).toBeNull()
    expect(faltaNaFichaDoProcedimento(ficha, {})?.mensagem).toBe('Falta preencher "Fototipo" na ficha do procedimento.')
  })

  it('a anamnese: foto e planejador ficam de fora (a cliente responde pelo celular)', () => {
    const saude: AnamnesisRow[] = [
      linha([{ id: 'allergies', type: 'textarea', label: 'Alergias', required: true }]),
      linha([{ id: 'foto', type: 'photo', label: 'Foto', required: true }]),
    ]
    expect(faltaNaAnamnese(saude, {})).toEqual({ onde: 'anamnese', campo: 'allergies', rotulo: 'Alergias', mensagem: 'Falta responder "Alergias" na anamnese.' })
    expect(faltaNaAnamnese(saude, { allergies: 'Nega' })).toBeNull()
  })
})
