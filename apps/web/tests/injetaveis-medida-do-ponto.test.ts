import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { comOProduto, pontoNovo, recusaDaMedidaDosPontos, type ProdutoDoMapa } from '@/lib/injetaveis/medida-do-ponto'
import type { InjectablePoint } from '@/lib/anamnesis'

/**
 * A dose do ponto é sempre na medida de consumo do produto do Estoque (o
 * Heitor, 27/11: "O consumo é sempre na unidade cadastrada no produto, seja no
 * mapa, seja no atendimento, seja no consumo do estoque."). O mapa não escolhe
 * outra medida nem a digita: escolher o produto é escolher a medida. Assim o
 * mapa em UI com a baixa do mesmo produto em ml deixa de existir.
 *
 * O ponto gravado antes noutra medida não é reescrito: fica como foi gravado
 * (decisão do Claude, princípios 3 e 4 — trocar só o rótulo mudaria o que a
 * dose diz; converter seria chutar número).
 */
const estoque: ProdutoDoMapa[] = [
  { name: 'Toxina botulínica', unit: 'U' },
  { name: 'Ácido hialurônico', unit: 'ml' },
]
const ponto = (p: Partial<InjectablePoint>): InjectablePoint =>
  ({ id: 'p1', x: 0.5, y: 0.3, product: '', dose: 0, unit: '', applied: null, view: 'rosto_f', ...p })

describe('a medida do ponto vem do produto do estoque', () => {
  it('escolher o produto é escolher a medida dele', () => {
    expect(comOProduto('Ácido hialurônico', estoque)).toEqual({ product: 'Ácido hialurônico', unit: 'ml' })
    expect(comOProduto('Toxina botulínica', estoque)).toEqual({ product: 'Toxina botulínica', unit: 'U' })
    expect(comOProduto('', estoque)).toEqual({ product: '', unit: '' })
  })

  it('o primeiro ponto nasce sem produto e sem medida', () => {
    expect(pontoNovo(undefined, estoque)).toEqual({ product: '', dose: 0, unit: '' })
  })

  it('o ponto seguinte repete o produto, a dose e a medida do produto', () => {
    expect(pontoNovo(ponto({ product: 'Toxina botulínica', dose: 4, unit: 'U' }), estoque))
      .toEqual({ product: 'Toxina botulínica', dose: 4, unit: 'U' })
  })

  it('depois de um ponto gravado noutra medida, o novo nasce na medida do produto, sem copiar a dose', () => {
    expect(pontoNovo(ponto({ product: 'Ácido hialurônico', dose: 1, unit: 'UI' }), estoque))
      .toEqual({ product: 'Ácido hialurônico', dose: 0, unit: 'ml' })
  })

  it('depois de um ponto com produto fora do estoque, o novo nasce sem produto', () => {
    expect(pontoNovo(ponto({ product: 'Texto solto', dose: 2, unit: 'UI' }), estoque)).toEqual({ product: '', dose: 0, unit: '' })
  })
})

describe('o servidor recusa a medida que não é a do produto', () => {
  it('o ponto novo na medida do produto passa; sem produto também', () => {
    expect(recusaDaMedidaDosPontos([ponto({ product: 'Ácido hialurônico', dose: 1, unit: 'ml' }), ponto({ id: 'p2' })], [], estoque)).toBeNull()
  })

  it('o ponto novo noutra medida é recusado', () => {
    expect(recusaDaMedidaDosPontos([ponto({ product: 'Ácido hialurônico', dose: 1, unit: 'UI' })], [], estoque))
      .toBe('A dose de Ácido hialurônico é em ml, a medida do produto no estoque.')
  })

  it('o ponto novo com produto que não está no estoque é recusado', () => {
    expect(recusaDaMedidaDosPontos([ponto({ product: 'Texto solto', dose: 1, unit: 'UI' })], [], estoque))
      .toBe('Texto solto não está entre os produtos do estoque.')
  })

  it('o ponto gravado antes noutra medida fica como foi gravado, também com a dose mexida', () => {
    const salvo = ponto({ product: 'Ácido hialurônico', dose: 1, unit: 'UI' })
    expect(recusaDaMedidaDosPontos([salvo], [salvo], estoque)).toBeNull()
    expect(recusaDaMedidaDosPontos([{ ...salvo, dose: 2, applied: 2 }], [salvo], estoque)).toBeNull()
  })

  it('trocar o produto ou a medida de um ponto gravado pede a medida do produto', () => {
    const salvo = ponto({ product: 'Ácido hialurônico', dose: 1, unit: 'ml' })
    expect(recusaDaMedidaDosPontos([{ ...salvo, unit: 'UI' }], [salvo], estoque))
      .toBe('A dose de Ácido hialurônico é em ml, a medida do produto no estoque.')
    expect(recusaDaMedidaDosPontos([{ ...salvo, product: 'Toxina botulínica' }], [salvo], estoque))
      .toBe('A dose de Toxina botulínica é em U, a medida do produto no estoque.')
    expect(recusaDaMedidaDosPontos([{ ...salvo, product: 'Toxina botulínica', unit: 'U' }], [salvo], estoque)).toBeNull()
  })
})

const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('a tela não escolhe a medida do ponto', () => {
  it('o ponto do mapa não tem seletor de medida nem lista própria de medidas', () => {
    const campo = fonte('components/branch/injectable-map-field.tsx')
    expect(campo).not.toContain('INJECTABLE_UNITS')
    expect(campo).not.toMatch(/onChange\(\{ unit:/)
    expect(fonte('lib/anamnesis.ts')).not.toContain('INJECTABLE_UNITS')
  })

  it('o produto do ponto se escolhe só entre os do estoque (nada de texto livre)', () => {
    const campo = fonte('components/branch/injectable-map-field.tsx')
    expect(campo).not.toContain('<datalist')
    expect(campo).toContain('comOProduto(')
    expect(campo).toContain('pontoNovo(')
  })

  it('salvar e registrar a aplicação conferem a medida no servidor', () => {
    const acoes = fonte('actions/injectable-map.ts')
    const corpo = (de: string, ate: string) => acoes.slice(acoes.indexOf(de), acoes.indexOf(ate))
    expect(corpo('export async function salvarPlanejamentoInjetavel', 'export async function renomearPlanejamentoInjetavel')).toContain('await recusaDaMedida(')
    expect(corpo('export async function registrarAplicacao', 'async function recusaDaMedida(')).toContain('await recusaDaMedida(')
    expect(acoes).toContain('recusaDaMedidaDosPontos(')
  })
})
