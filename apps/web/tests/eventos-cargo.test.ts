import { describe, it, expect } from 'vitest'
import { diferencaDaMatriz } from '@/lib/events/cadastro'

/**
 * `cargo.permissoes_alteradas` é o evento de auditoria do sistema, e o que
 * decide se ele sai é esta comparação. Os dois casos que importam são opostos:
 * salvar sem mexer em nada NÃO pode emitir (conferir a matriz é rotina), e
 * subir um módulo de nível TEM de emitir com o de→para — depois do upsert a
 * matriz anterior não existe mais para ninguém reconstruir.
 */
describe('diferencaDaMatriz', () => {
  const matriz = [
    { modulo: 'agenda',    nivel: 'MANAGE', escopo: 'ALL' },
    { modulo: 'financial', nivel: 'NONE',   escopo: 'ALL' },
  ]

  it('não acusa mudança quando nada mudou', () => {
    expect(diferencaDaMatriz(matriz, matriz)).toEqual([])
  })

  it('acusa o módulo que subiu de nível, com de e para', () => {
    const depois = [
      { modulo: 'agenda',    nivel: 'MANAGE', escopo: 'ALL' },
      { modulo: 'financial', nivel: 'VIEW',   escopo: 'ALL' },
    ]
    expect(diferencaDaMatriz(matriz, depois)).toEqual([
      { modulo: 'financial', de: 'NONE/ALL', para: 'VIEW/ALL' },
    ])
  })

  it('acusa mudança só de escopo — o nível sozinho não conta a história', () => {
    const depois = [
      { modulo: 'agenda',    nivel: 'MANAGE', escopo: 'OWN' },
      { modulo: 'financial', nivel: 'NONE',   escopo: 'ALL' },
    ]
    expect(diferencaDaMatriz(matriz, depois)).toEqual([
      { modulo: 'agenda', de: 'MANAGE/ALL', para: 'MANAGE/OWN' },
    ])
  })

  it('cargo novo (sem linha nenhuma) só acusa o que não for NONE/ALL', () => {
    // Sem o default, a primeira gravação apareceria como se tivesse mudado
    // todos os 14 módulos de uma vez.
    expect(diferencaDaMatriz([], matriz)).toEqual([
      { modulo: 'agenda', de: 'NONE/ALL', para: 'MANAGE/ALL' },
    ])
  })

  it('módulo que sumiu do formulário não vira mudança fantasma', () => {
    // A tela grava sempre os 14 módulos; se um dia gravar menos, a ausência não
    // deve ser lida como rebaixamento — só o que veio é comparado.
    const depois = [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }]
    expect(diferencaDaMatriz(matriz, depois)).toEqual([])
  })
})
