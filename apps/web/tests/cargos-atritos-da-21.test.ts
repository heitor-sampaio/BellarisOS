import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A16, A17 e A24 da 21ª simulação (2026-11-17), Configurações → Cargos.
 *
 * A16 [3]: o cargo com módulo ligado sem o alcance escolhido não salva, e o
 * aviso era o laranja pequeno ao lado da linha; o "Salvar acessos" seguia
 * ativo sem dizer nada ao lado — o aviso junto do botão só vinha DEPOIS do
 * clique. Agora ele fica junto do botão enquanto falta escolher.
 * A17 [3]: o cartão do cargo recém-salvo dizia "Nenhum acesso ainda" até
 * recarregar a página (a lista lia só o que veio do servidor).
 * A24 [3]: o resumo "O que essa pessoa vai ver" listava Documentos sem dizer
 * que vem de Clientes em Ver (a regra de 16/11).
 */

const raiz = join(__dirname, '..')
const editor = () => readFileSync(join(raiz, 'components/admin/roles-editor.tsx'), 'utf8')

describe('A17: o cartão do cargo salvo diz o que ele abre, sem recarregar', () => {
  it('os acessos salvos viram o resumo do cartão', async () => {
    const { acessosDoSalvo, resumoDoCargo } = await import('@/lib/cargos/acessos-salvos')
    const antes = {}
    expect(resumoDoCargo(antes)).toBe('Nenhum acesso ainda')
    const levels = { agenda: 'MANAGE', clients: 'MANAGE', cashier: 'MANAGE', financial: 'MANAGE', loyalty: 'VIEW', crm: 'NONE' } as const
    const salvo = acessosDoSalvo(levels)
    // Sem o "só os meus" (SM1, o Heitor, 2026-11-23): o resumo diz só as áreas.
    expect(resumoDoCargo(salvo)).toBe('5 áreas')
  })
  it('o editor guarda o salvo e passa à lista e à matriz', () => {
    const f = editor()
    expect(f).toContain('acessosDoSalvo(')
    expect(f).toMatch(/onSalvo/)
    expect(f).not.toMatch(/function summarize\(/)
  })
})

describe('A16: o que falta escolher fica junto do "Salvar acessos" antes do clique', () => {
  it('o aviso do botão lê o que falta AGORA, não só o do último clique', () => {
    const f = editor()
    expect(f).toMatch(/const faltaAgora = oQueFalta\(\)/)
    expect(f).toMatch(/const avisoDoQueFalta = falta \?\? faltaAgora/)
    expect(f).toMatch(/\{avisoDoQueFalta && \(/)
  })
})

describe('A24: o resumo diz de onde vem Documentos', () => {
  it('com Clientes ligado, a dica diz que Documentos vem de Clientes em Ver', async () => {
    const { documentosNoResumo } = await import('@/lib/permissions-copy')
    expect(documentosNoResumo({ clients: 'VIEW', documents: 'NONE' })).toMatch(/^Documentos vem de Clientes em “Ver”/)
    expect(documentosNoResumo({ clients: 'NONE', documents: 'MANAGE' })).toBeNull()
  })
  it('o resumo do cargo usa o texto', () => {
    expect(editor()).toContain('documentosNoResumo(')
  })
})
