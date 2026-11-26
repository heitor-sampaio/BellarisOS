import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A10 da 31ª simulação (princípio 7; D5 da 27ª): o cargo novo nasce e a seleção
 * fica em outro — marca-se a matriz do cargo errado. No banco (25/11, 12:00):
 * duplicado e renomeado o "Comercial", 28 s depois os níveis foram gravados no
 * "Financeiro" — o primeiro editável da lista, o mesmo do D5 (24/11). É o
 * escolhido de quando a tela (re)monta sem achar na lista o cargo que o
 * endereço pede (`cargoEscolhido` cai no primeiro editável) — e, chegada a
 * lista com ele, nada voltava ao pedido.
 *
 * Agora o endereço (`?cargo=`) manda: o cargo que ele pede e a lista ainda não
 * tem fica esperando; quando a lista o traz, a tela abre nele — a não ser que
 * haja alteração por salvar (o "Descartar alterações?" decide) ou que a pessoa
 * já tenha escolhido outro.
 */
const fonte = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')

describe('A10: o cargo que o endereço pede abre quando chega na lista [7]', () => {
  const lista = [
    { id: 'adm', is_system: true },
    { id: 'fin', is_system: false },
    { id: 'ger', is_system: false },
  ]
  const comONovo = [...lista, { id: 'com', is_system: false }]

  it('a lista chegou com o cargo pedido: troca para ele', async () => {
    const { cargoPedidoPeloEndereco } = await import('@/lib/cargos/cargo-escolhido')
    expect(cargoPedidoPeloEndereco({ roles: comONovo, esperando: 'com', selecionado: 'fin', ocupado: false })).toBe('com')
  })
  it('a lista ainda não o tem: espera (não troca)', async () => {
    const { cargoPedidoPeloEndereco } = await import('@/lib/cargos/cargo-escolhido')
    expect(cargoPedidoPeloEndereco({ roles: lista, esperando: 'com', selecionado: 'fin', ocupado: false })).toBeNull()
  })
  it('com alteração por salvar, não troca sozinho (o "Descartar alterações?" decide)', async () => {
    const { cargoPedidoPeloEndereco } = await import('@/lib/cargos/cargo-escolhido')
    expect(cargoPedidoPeloEndereco({ roles: comONovo, esperando: 'com', selecionado: 'fin', ocupado: true })).toBeNull()
  })
  it('já está nele, ou nada pedido: não troca', async () => {
    const { cargoPedidoPeloEndereco } = await import('@/lib/cargos/cargo-escolhido')
    expect(cargoPedidoPeloEndereco({ roles: comONovo, esperando: 'com', selecionado: 'com', ocupado: false })).toBeNull()
    expect(cargoPedidoPeloEndereco({ roles: comONovo, esperando: null, selecionado: 'fin', ocupado: false })).toBeNull()
  })

  it('o editor guarda o pedido do endereço e troca quando ele chega; escolher à mão o esquece', () => {
    const tela = fonte('components/admin/roles-editor.tsx')
    expect(tela).toMatch(/cargoPedidoPeloEndereco\(\{ roles, esperando/)
    // O pedido que muda no endereço passa a esperar; o escolhido à mão limpa a espera.
    expect(tela).toMatch(/if \(pedido !== pedidoVisto\) \{ setPedidoVisto\(pedido\); setEsperando\(pedido\) \}/)
    expect(tela).toMatch(/function setSelectedId\(id: string \| null\) \{\s*setEsperando\(null\)/)
    // Com alteração por salvar ou o "Descartar alterações?" aberto, não troca sozinho.
    expect(tela).toMatch(/ocupado: dirty \|\| !!pendingSelect/)
  })
})
