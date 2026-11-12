import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * F63 — segurança (C1, C7 e C9 do levantamento das regras).
 *
 * - C1: a sessão só LÊ. O que grava a matriz de cargos vai pelo cliente de
 *   serviço, depois da trava da action (a 20261112006302 tira a escrita pela
 *   sessão); e as telas de comissão escutam o sinal `comissoes_sinais`, não a
 *   tabela (que ia pelo Realtime a quem só vê "as minhas").
 * - C7: o que muda a clínica de verdade — desativar e reativar membro, apagar
 *   cargo, ligar automação, mudar os limites dela — passa por bloqueioDoSuporte.
 * - C9: a action devolve `{ error }`; `new Error` lançado chega trocado à tela
 *   em produção ("algo deu errado").
 */
const RAIZ = path.resolve(__dirname, '..')
const ler = (f: string) => fs.readFileSync(path.join(RAIZ, f), 'utf8')

/** O corpo de `export async function nome(` (ou `async function nome(`) até a próxima função do topo. */
function corpo(arquivo: string, nome: string): string {
  const texto = ler(arquivo)
  const inicio = texto.search(new RegExp(`(export\\s+)?async\\s+function\\s+${nome}\\s*\\(`))
  if (inicio < 0) throw new Error(`não achei ${nome} em ${arquivo}`)
  const resto = texto.slice(inicio + 1)
  const fim = resto.search(/\n(export\s+)?(async\s+)?function\s+\w+|\nexport\s+(const|type|interface)\s/)
  return fim < 0 ? texto.slice(inicio) : texto.slice(inicio, inicio + 1 + fim)
}

describe('C1: a matriz de cargos grava pelo servidor', () => {
  it.each(['actions/roles.ts', 'actions/permissions.ts'])('%s não usa o cliente da sessão', arquivo => {
    expect(ler(arquivo)).not.toMatch(/from '@\/lib\/supabase\/server'/)
    expect(ler(arquivo)).toMatch(/createAdminClient/)
  })
})

describe('C1: as telas de comissão escutam o sinal', () => {
  it.each(['app/admin/financeiro/page.tsx', 'app/[slug]/financeiro/page.tsx', 'app/_shared/comissoes-da-equipe.tsx'])('%s', arquivo => {
    const texto = ler(arquivo)
    expect(texto).not.toMatch(/tables=\{\[[^\]]*'commissions'/)
    expect(texto).toMatch(/'comissoes_sinais'/)
  })
})

describe('C7: o suporte não muda a clínica por estas actions', () => {
  it.each([
    ['actions/team.ts', 'deactivateTeamMember'],
    ['actions/team.ts', 'reactivateTeamMember'],
    ['actions/roles.ts', 'deleteRole'],
    ['actions/automacoes.ts', 'mudarStatusDaAutomacao'],
    ['actions/automacoes.ts', 'salvarAutomacao'],
  ])('%s#%s confere bloqueioDoSuporte', (arquivo, nome) => {
    expect(corpo(arquivo, nome)).toMatch(/bloqueioDoSuporte\(/)
  })
})

describe('C9: a action devolve { error }, não lança', () => {
  it.each([
    ['actions/team.ts', 'membroDaRede'],
    ['actions/team.ts', 'deactivateTeamMember'],
    ['actions/team.ts', 'reactivateTeamMember'],
    ['actions/inbox.ts', 'setConversationStatus'],
  ])('%s#%s', (arquivo, nome) => {
    expect(corpo(arquivo, nome)).not.toMatch(/throw new Error\(/)
  })
})
